import type { PlacementType, RecommendationStrategy } from "@prisma/client";
import db from "../../../db.server";
import { getShopByDomain } from "../../sync/shop-lookup.server";
import { getRecommendationsWithColdStart } from "../index.server";
import type { RecommendationItem } from "../types";
import {
  getCachedServingResult,
  setCachedServingResult,
} from "./cache.server";
import { applyBusinessRuleFilters, resolveProductIdSet } from "./filters.server";
import {
  isPlacementType,
  normalizeShopifyProductId,
  parseCartProductIds,
  parseExclusionRules,
  placementResponseKey,
  reasonTagsForStrategy,
  strategyUsedLabel,
  toShopifyProductGid,
} from "./parse.server";
import { rerankBySessionViews } from "./rerank.server";
import { recordServingLatency } from "./timing.server";
import type {
  CachedServingPayload,
  ExclusionRules,
  ResolvedPlacement,
  ServingRequest,
  ServingResponse,
} from "./types.server";

function emptyResponse(
  placement: string,
  productId: string | null,
  latencyMs: number,
  cacheHit = false,
): ServingResponse {
  return {
    placement,
    product_id: productId ? toShopifyProductGid(productId) : null,
    strategy_used: "none",
    recommendations: [],
    generated_at: new Date().toISOString(),
    meta: { cache_hit: cacheHit, latency_ms: latencyMs },
  };
}

function decimalToPriceString(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return (Math.round(value * 100) / 100).toFixed(2);
}

/**
 * Formats recommendation items for the storefront widget, hydrating handle /
 * variant from the product catalog when available.
 */
async function formatRecommendations(
  shopId: string,
  items: RecommendationItem[],
): Promise<ServingResponse["recommendations"]> {
  if (items.length === 0) return [];

  const products = await db.product.findMany({
    where: { shopId, id: { in: items.map((item) => item.productId) } },
    select: {
      id: true,
      handle: true,
      imageUrls: true,
      priceRangeMin: true,
      variants: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { shopifyVariantId: true },
      },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  return items.map((item) => {
    const product = byId.get(item.productId);
    const handle = product?.handle ?? null;
    const imageUrl =
      item.imageUrls[0] ?? product?.imageUrls[0] ?? null;
    const price =
      decimalToPriceString(item.priceRangeMin) ??
      (product?.priceRangeMin != null
        ? decimalToPriceString(Number(product.priceRangeMin))
        : null);

    return {
      product_id: toShopifyProductGid(item.shopifyProductId),
      title: item.title,
      score: Math.round(item.score * 1000) / 1000,
      reason_tags: reasonTagsForStrategy(item.strategy),
      image_url: imageUrl,
      price,
      handle,
      url: handle ? `/products/${handle}` : null,
      variant_id: product?.variants[0]?.shopifyVariantId ?? null,
    };
  });
}

async function resolvePlacement(
  shopId: string,
  placementType: PlacementType,
): Promise<ResolvedPlacement> {
  const placement = await db.recommendationPlacement.findFirst({
    where: { shopId, placementType, enabled: true },
    orderBy: { updatedAt: "desc" },
  });

  if (placement) {
    return {
      id: placement.id,
      placementType: placement.placementType,
      strategy: placement.strategy,
      enabled: placement.enabled,
      maxItems: placement.maxItems,
      titleText: placement.titleText,
      exclusionRules: parseExclusionRules(placement.exclusionRules),
    };
  }

  // Soft fallback when merchant has not configured placements yet
  return {
    id: null,
    placementType,
    strategy: null,
    enabled: true,
    maxItems: 4,
    titleText: defaultTitleForPlacement(placementType),
    exclusionRules: { excludeOutOfStock: true },
  };
}

function defaultTitleForPlacement(placementType: PlacementType): string {
  switch (placementType) {
    case "product_page":
      return "You may also like";
    case "cart":
      return "Add these too";
    case "home":
      return "Trending now";
    case "collection":
      return "You may also like";
    case "search":
      return "Popular picks";
    default:
      return "Recommended for you";
  }
}

async function resolveInternalProductId(
  shopId: string,
  shopifyProductId: string | undefined,
): Promise<string | undefined> {
  if (!shopifyProductId) return undefined;
  const normalized = normalizeShopifyProductId(shopifyProductId);
  const product = await db.product.findUnique({
    where: {
      shopId_shopifyProductId: { shopId, shopifyProductId: normalized },
    },
    select: { id: true },
  });
  return product?.id;
}

function normalizeShopDomain(shop: string): string {
  return shop.trim().toLowerCase();
}

function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}

export function parseServingRequestFromUrl(url: URL): ServingRequest | { error: string } {
  const shop = url.searchParams.get("shop");
  const placementTypeRaw = url.searchParams.get("placement_type");
  const productId = url.searchParams.get("product_id") ?? undefined;
  const sessionId = url.searchParams.get("session_id") ?? undefined;
  const cartRaw = url.searchParams.get("cart_product_ids");

  if (!shop) return { error: "shop is required" };
  const normalizedShop = normalizeShopDomain(shop);
  if (!isValidShopDomain(normalizedShop)) {
    return { error: "Invalid shop domain" };
  }

  if (!placementTypeRaw) return { error: "placement_type is required" };
  if (!isPlacementType(placementTypeRaw)) {
    return { error: "Invalid placement_type" };
  }

  return {
    shop: normalizedShop,
    placementType: placementTypeRaw,
    productId: productId ? normalizeShopifyProductId(productId) : undefined,
    sessionId: sessionId || undefined,
    cartProductIds: parseCartProductIds(cartRaw),
  };
}

async function buildBaseRecommendations(
  shopId: string,
  placement: ResolvedPlacement,
  internalProductId: string | undefined,
  sessionId: string | undefined,
  exclusionRules: ExclusionRules,
): Promise<{ items: RecommendationItem[]; strategyUsed: string }> {
  // Fetch extra candidates so post-filters / cart still leave maxItems
  const fetchLimit = Math.min(Math.max(placement.maxItems * 4, 16), 48);
  const cacheLimit = Math.min(Math.max(placement.maxItems * 2, 8), 24);

  const { items, selection } = await getRecommendationsWithColdStart({
    shopId,
    strategy: (placement.strategy ?? "trending") as RecommendationStrategy,
    productId: internalProductId,
    sessionId,
    limit: fetchLimit,
    excludeProductIds: internalProductId ? [internalProductId] : [],
  });

  // Cache merchant-rule-filtered results without cart (cart is per-request)
  const filtered = await applyBusinessRuleFilters(shopId, items, exclusionRules, {
    sourceProductId: internalProductId,
    limit: cacheLimit,
  });

  const strategyUsed = strategyUsedLabel(
    selection.strategies.length > 0
      ? selection.strategies
      : placement.strategy
        ? [placement.strategy]
        : ["trending"],
  );

  return { items: filtered, strategyUsed };
}

/**
 * Core serving pipeline (FR-REC-02..07, NFR-AVAIL-02).
 * Never throws to the caller for storefront failures — returns empty recommendations.
 */
export async function serveRecommendations(
  request: ServingRequest,
): Promise<ServingResponse> {
  const started = performance.now();
  const placementKeyFallback = request.placementType;
  const productIdForResponse = request.productId ?? null;

  try {
    const shopRecord = await getShopByDomain(request.shop);
    if (!shopRecord || shopRecord.status !== "active") {
      const latencyMs = Math.round(performance.now() - started);
      recordServingLatency(latencyMs);
      return emptyResponse(placementKeyFallback, productIdForResponse, latencyMs);
    }

    const placement = await resolvePlacement(shopRecord.id, request.placementType);
    const placementKey = placementResponseKey(
      placement.placementType,
      placement.titleText,
    );

    const [internalProductId, cartInternalIds] = await Promise.all([
      resolveInternalProductId(shopRecord.id, request.productId),
      resolveProductIdSet(shopRecord.id, request.cartProductIds ?? []),
    ]);

    let cacheHit = false;
    const cached: CachedServingPayload | null = await getCachedServingResult(
      shopRecord.id,
      request.placementType,
      internalProductId ?? null,
    );

    let baseItems: RecommendationItem[];
    let strategyUsed: string;
    let generatedAt: string;

    if (cached && cached.items.length > 0) {
      cacheHit = true;
      baseItems = cached.items;
      strategyUsed = cached.strategyUsed;
      generatedAt = cached.generatedAt;
    } else {
      const built = await buildBaseRecommendations(
        shopRecord.id,
        placement,
        internalProductId,
        request.sessionId,
        placement.exclusionRules,
      );
      baseItems = built.items;
      strategyUsed = built.strategyUsed;
      generatedAt = new Date().toISOString();

      await setCachedServingResult(
        shopRecord.id,
        request.placementType,
        internalProductId ?? null,
        {
          items: baseItems,
          strategyUsed,
          placementKey,
          generatedAt,
        },
      );
    }

    // Cart exclusions are request-specific and applied after cache (FR-REC-03)
    const cartFiltered =
      cartInternalIds.size > 0
        ? baseItems.filter((item) => !cartInternalIds.has(item.productId))
        : baseItems;

    const reranked = await rerankBySessionViews(
      shopRecord.id,
      request.sessionId,
      cartFiltered,
    );

    const latencyMs = Math.round(performance.now() - started);
    recordServingLatency(latencyMs);

    return {
      placement: placementKey,
      product_id: productIdForResponse
        ? toShopifyProductGid(productIdForResponse)
        : null,
      strategy_used: strategyUsed,
      recommendations: await formatRecommendations(
        shopRecord.id,
        reranked.slice(0, placement.maxItems),
      ),
      generated_at: generatedAt,
      meta: { cache_hit: cacheHit, latency_ms: latencyMs },
    };
  } catch (error) {
    // Graceful degradation (NFR-AVAIL-02): try any cached result, else empty — never 500
    console.error(
      JSON.stringify({
        event: "recommendation_serving_error",
        component: "recommendation-serving",
        level: "error",
        shop: request.shop,
        placement_type: request.placementType,
        error: error instanceof Error ? error.message : "unknown",
        timestamp: new Date().toISOString(),
      }),
    );

    try {
      const shopRecord = await getShopByDomain(request.shop);
      if (shopRecord) {
        const internalProductId = await resolveInternalProductId(
          shopRecord.id,
          request.productId,
        );
        const stale = await getCachedServingResult(
          shopRecord.id,
          request.placementType,
          internalProductId ?? null,
        );
        if (stale && stale.items.length > 0) {
          const latencyMs = Math.round(performance.now() - started);
          recordServingLatency(latencyMs);
          return {
            placement: stale.placementKey,
            product_id: productIdForResponse
              ? toShopifyProductGid(productIdForResponse)
              : null,
            strategy_used: stale.strategyUsed,
            recommendations: await formatRecommendations(shopRecord.id, stale.items),
            generated_at: stale.generatedAt,
            meta: { cache_hit: true, latency_ms: latencyMs },
          };
        }
      }
    } catch {
      // fall through to empty
    }

    const latencyMs = Math.round(performance.now() - started);
    recordServingLatency(latencyMs);
    return emptyResponse(placementKeyFallback, productIdForResponse, latencyMs);
  }
}

export { parseCartProductIds, isPlacementType };
