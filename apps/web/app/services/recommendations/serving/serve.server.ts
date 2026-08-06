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
  isRecommendationStrategy,
  normalizeShopifyId,
  normalizeShopifyProductId,
  parseCartProductIds,
  parseExclusionRules,
  placementResponseKey,
  reasonTagsForStrategy,
  resolvePlacementTypeParam,
  normalizePlacementKeyParam,
  strategyUsedLabel,
  toShopifyProductGid,
  isPlacementType,
} from "./parse.server";
import {
  defaultStrategyForPlacement,
  defaultTitleForPlacement,
  getPlacementDefaults,
} from "./placement-defaults.server";
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
  opts: {
    placementKey?: string;
    strategyHint?: RecommendationStrategy;
    titleHint?: string;
  } = {},
): Promise<ResolvedPlacement> {
  const defaults = getPlacementDefaults(placementType, opts.placementKey);
  const strategyHint = opts.strategyHint ?? defaults.strategy;
  const titleHint = opts.titleHint ?? defaults.titleText;

  if (strategyHint) {
    const byStrategy = await db.recommendationPlacement.findFirst({
      where: {
        shopId,
        placementType,
        strategy: strategyHint,
        enabled: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    if (byStrategy) {
      return mapPlacement(byStrategy);
    }
  }

  if (titleHint) {
    const byTitle = await db.recommendationPlacement.findFirst({
      where: {
        shopId,
        placementType,
        titleText: titleHint,
        enabled: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    if (byTitle) {
      return mapPlacement(byTitle);
    }
  }

  const placement = await db.recommendationPlacement.findFirst({
    where: { shopId, placementType, enabled: true },
    orderBy: { updatedAt: "desc" },
  });

  if (placement) {
    return mapPlacement(placement);
  }

  // Soft fallback when merchant has not configured placements yet (Sprint 13 defaults)
  return {
    id: null,
    placementType,
    strategy: strategyHint,
    enabled: true,
    maxItems: 4,
    titleText: titleHint || defaultTitleForPlacement(placementType, opts.placementKey),
    exclusionRules: { excludeOutOfStock: true },
  };
}

function mapPlacement(placement: {
  id: string;
  placementType: PlacementType;
  strategy: RecommendationStrategy;
  enabled: boolean;
  maxItems: number;
  titleText: string;
  exclusionRules: unknown;
}): ResolvedPlacement {
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

/**
 * Collection page: seed from a product in the collection for content similarity,
 * and exclude products already listed in that collection.
 */
async function resolveCollectionContext(
  shopId: string,
  shopifyCollectionId: string | undefined,
): Promise<{ seedProductId?: string; excludeProductIds: string[] }> {
  if (!shopifyCollectionId) return { excludeProductIds: [] };

  const normalized = normalizeShopifyId(shopifyCollectionId);
  const collection = await db.collection.findUnique({
    where: {
      shopId_shopifyCollectionId: {
        shopId,
        shopifyCollectionId: normalized,
      },
    },
    select: { productIds: true },
  });

  if (!collection || collection.productIds.length === 0) {
    return { excludeProductIds: [] };
  }

  return {
    seedProductId: collection.productIds[0],
    excludeProductIds: collection.productIds,
  };
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
  const placementKeyRaw = url.searchParams.get("placement_key");
  const strategyRaw = url.searchParams.get("strategy");
  const productId = url.searchParams.get("product_id") ?? undefined;
  const collectionId = url.searchParams.get("collection_id") ?? undefined;
  const searchQuery = url.searchParams.get("search_query") ?? undefined;
  const sessionId = url.searchParams.get("session_id") ?? undefined;
  const cartRaw = url.searchParams.get("cart_product_ids");

  if (!shop) return { error: "shop is required" };
  const normalizedShop = normalizeShopDomain(shop);
  if (!isValidShopDomain(normalizedShop)) {
    return { error: "Invalid shop domain" };
  }

  if (!placementTypeRaw) return { error: "placement_type is required" };
  const placementType = resolvePlacementTypeParam(placementTypeRaw);
  if (!placementType) {
    return { error: "Invalid placement_type" };
  }

  const placementKey = normalizePlacementKeyParam(
    placementKeyRaw,
    placementTypeRaw,
  );

  let strategy: RecommendationStrategy | undefined;
  if (strategyRaw) {
    if (!isRecommendationStrategy(strategyRaw)) {
      return { error: "Invalid strategy" };
    }
    strategy = strategyRaw;
  }

  return {
    shop: normalizedShop,
    placementType,
    placementKey,
    strategy,
    productId: productId ? normalizeShopifyProductId(productId) : undefined,
    collectionId: collectionId ? normalizeShopifyId(collectionId) : undefined,
    searchQuery: searchQuery?.trim() || undefined,
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
  extraExcludeIds: string[] = [],
): Promise<{ items: RecommendationItem[]; strategyUsed: string }> {
  // Fetch extra candidates so post-filters / cart still leave maxItems
  const fetchLimit = Math.min(Math.max(placement.maxItems * 4, 16), 48);
  const cacheLimit = Math.min(Math.max(placement.maxItems * 2, 8), 24);

  const strategy =
    (placement.strategy ??
      defaultStrategyForPlacement(placement.placementType)) as RecommendationStrategy;

  const excludeProductIds = [
    ...(internalProductId ? [internalProductId] : []),
    ...extraExcludeIds,
  ];

  const { items, selection } = await getRecommendationsWithColdStart({
    shopId,
    strategy,
    productId: internalProductId,
    sessionId,
    limit: fetchLimit,
    excludeProductIds,
  });

  // Cache merchant-rule-filtered results without cart (cart is per-request)
  const filtered = await applyBusinessRuleFilters(shopId, items, exclusionRules, {
    sourceProductId: internalProductId,
    limit: cacheLimit,
  });

  const strategyUsed = strategyUsedLabel(
    selection.strategies.length > 0
      ? selection.strategies
      : [strategy],
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
  const defaults = getPlacementDefaults(
    request.placementType,
    request.placementKey,
  );
  const placementKeyFallback =
    request.placementKey ?? defaults.placementKey ?? request.placementType;
  const productIdForResponse = request.productId ?? null;

  try {
    const shopRecord = await getShopByDomain(request.shop);
    if (!shopRecord || shopRecord.status !== "active") {
      const latencyMs = Math.round(performance.now() - started);
      recordServingLatency(latencyMs);
      return emptyResponse(placementKeyFallback, productIdForResponse, latencyMs);
    }

    const placement = await resolvePlacement(
      shopRecord.id,
      request.placementType,
      {
        placementKey: request.placementKey,
        strategyHint: request.strategy ?? defaults.strategy,
        titleHint: defaults.titleText,
      },
    );

    const placementKey = placementResponseKey(
      placement.placementType,
      placement.titleText,
    );

    const collectionCtx = await resolveCollectionContext(
      shopRecord.id,
      request.collectionId,
    );

    // Cart: seed from first cart item when no product_id provided
    const cartSeedShopifyId =
      !request.productId && request.cartProductIds?.length
        ? request.cartProductIds[0]
        : undefined;

    const [internalProductId, cartInternalIds] = await Promise.all([
      resolveInternalProductId(
        shopRecord.id,
        request.productId ?? cartSeedShopifyId,
      ),
      resolveProductIdSet(shopRecord.id, request.cartProductIds ?? []),
    ]);

    // Collection: use collection seed when no product context
    const seedProductId =
      internalProductId ??
      (request.placementType === "collection"
        ? collectionCtx.seedProductId
        : undefined);

    const extraExcludeIds =
      request.placementType === "collection"
        ? collectionCtx.excludeProductIds.filter((id) => id !== seedProductId)
        : [];

    const cacheParts = {
      placementType: request.placementType,
      placementKey: request.placementKey ?? defaults.placementKey,
      productId: seedProductId ?? null,
      collectionId: request.collectionId ?? null,
      strategy: placement.strategy,
    };

    let cacheHit = false;
    const cached: CachedServingPayload | null = await getCachedServingResult(
      shopRecord.id,
      cacheParts,
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
        seedProductId,
        request.sessionId,
        placement.exclusionRules,
        extraExcludeIds,
      );
      baseItems = built.items;
      strategyUsed = built.strategyUsed;
      generatedAt = new Date().toISOString();

      await setCachedServingResult(shopRecord.id, cacheParts, {
        items: baseItems,
        strategyUsed,
        placementKey,
        generatedAt,
      });
    }

    // Cart exclusions are request-specific and applied after cache (FR-REC-03)
    const cartFiltered =
      cartInternalIds.size > 0
        ? baseItems.filter((item) => !cartInternalIds.has(item.productId))
        : baseItems;

    // Collection: also drop in-collection products if they slipped through cache
    const collectionFiltered =
      request.placementType === "collection" &&
      collectionCtx.excludeProductIds.length > 0
        ? cartFiltered.filter(
            (item) => !collectionCtx.excludeProductIds.includes(item.productId),
          )
        : cartFiltered;

    const reranked = await rerankBySessionViews(
      shopRecord.id,
      request.sessionId,
      collectionFiltered,
    );

    const latencyMs = Math.round(performance.now() - started);
    recordServingLatency(latencyMs);

    // search_query is accepted for future query-aware ranking; trending default today
    void request.searchQuery;

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
        placement_key: request.placementKey,
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
        const stale = await getCachedServingResult(shopRecord.id, {
          placementType: request.placementType,
          placementKey: request.placementKey ?? defaults.placementKey,
          productId: internalProductId ?? null,
          collectionId: request.collectionId ?? null,
          strategy: request.strategy ?? defaults.strategy,
        });
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
