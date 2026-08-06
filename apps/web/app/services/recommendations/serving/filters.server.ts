import db from "../../../db.server";
import type { RecommendationItem } from "../types";
import { normalizeShopifyProductId } from "./parse.server";
import type { ExclusionRules } from "./types.server";

export interface ProductFilterContext {
  inventoryStatus: string;
  status: string;
  tags: string[];
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  shopifyProductId: string;
}

/**
 * Resolve internal product IDs that belong to excluded collections.
 * Collection.productIds stores internal product IDs; exclusion rules may use
 * Shopify collection IDs or internal collection IDs.
 */
export async function resolveExcludedCollectionProductIds(
  shopId: string,
  excludedCollectionIds: string[],
): Promise<Set<string>> {
  if (excludedCollectionIds.length === 0) return new Set();

  const normalized = excludedCollectionIds.map((id) =>
    id.includes("/") ? (id.split("/").pop() ?? id) : id,
  );

  const collections = await db.collection.findMany({
    where: {
      shopId,
      OR: [
        { id: { in: excludedCollectionIds } },
        { shopifyCollectionId: { in: normalized } },
      ],
    },
    select: { productIds: true },
  });

  const productIds = new Set<string>();
  for (const collection of collections) {
    for (const productId of collection.productIds) {
      productIds.add(productId);
    }
  }
  return productIds;
}

/**
 * Resolve Shopify product IDs (and pass-through internal IDs) to internal IDs.
 */
export async function resolveProductIdSet(
  shopId: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  const shopifyIds = ids.map(normalizeShopifyProductId);
  const products = await db.product.findMany({
    where: {
      shopId,
      OR: [{ id: { in: ids } }, { shopifyProductId: { in: shopifyIds } }],
    },
    select: { id: true },
  });

  return new Set(products.map((p) => p.id));
}

export async function loadProductFilterContexts(
  shopId: string,
  productIds: string[],
): Promise<Map<string, ProductFilterContext>> {
  if (productIds.length === 0) return new Map();

  const products = await db.product.findMany({
    where: { shopId, id: { in: productIds } },
    select: {
      id: true,
      shopifyProductId: true,
      inventoryStatus: true,
      status: true,
      tags: true,
      priceRangeMin: true,
      priceRangeMax: true,
    },
  });

  const map = new Map<string, ProductFilterContext>();
  for (const product of products) {
    map.set(product.id, {
      inventoryStatus: product.inventoryStatus,
      status: product.status,
      tags: product.tags,
      priceRangeMin:
        product.priceRangeMin == null
          ? null
          : typeof product.priceRangeMin === "number"
            ? product.priceRangeMin
            : product.priceRangeMin.toNumber(),
      priceRangeMax:
        product.priceRangeMax == null
          ? null
          : typeof product.priceRangeMax === "number"
            ? product.priceRangeMax
            : product.priceRangeMax.toNumber(),
      shopifyProductId: product.shopifyProductId,
    });
  }
  return map;
}

function passesPriceRange(
  ctx: ProductFilterContext,
  rules: ExclusionRules,
): boolean {
  if (rules.priceMin != null) {
    const price = ctx.priceRangeMax ?? ctx.priceRangeMin;
    if (price == null || price < rules.priceMin) return false;
  }
  if (rules.priceMax != null) {
    const price = ctx.priceRangeMin ?? ctx.priceRangeMax;
    if (price == null || price > rules.priceMax) return false;
  }
  return true;
}

/**
 * Apply merchant business rules as post-filters (FR-REC-03).
 * Always drops inactive products; optionally drops OOS, cart, excluded IDs/tags/collections, price range.
 */
export async function applyBusinessRuleFilters(
  shopId: string,
  items: RecommendationItem[],
  rules: ExclusionRules,
  options: {
    cartInternalIds?: Set<string>;
    sourceProductId?: string;
    limit: number;
  },
): Promise<RecommendationItem[]> {
  if (items.length === 0) return [];

  const excludeOutOfStock = rules.excludeOutOfStock !== false;
  const excludedTags = new Set(
    (rules.excludedTags ?? []).map((tag) => tag.toLowerCase()),
  );

  const [excludedProducts, collectionExcluded] = await Promise.all([
    resolveProductIdSet(shopId, rules.excludedProductIds ?? []),
    resolveExcludedCollectionProductIds(
      shopId,
      rules.excludedCollectionIds ?? [],
    ),
  ]);

  const blocked = new Set<string>([
    ...excludedProducts,
    ...collectionExcluded,
    ...(options.cartInternalIds ?? []),
  ]);
  if (options.sourceProductId) {
    blocked.add(options.sourceProductId);
  }

  const contexts = await loadProductFilterContexts(
    shopId,
    items.map((item) => item.productId),
  );

  const filtered: RecommendationItem[] = [];
  for (const item of items) {
    if (blocked.has(item.productId)) continue;

    const ctx = contexts.get(item.productId);
    if (!ctx) continue;
    if (ctx.status !== "active") continue;
    if (excludeOutOfStock && ctx.inventoryStatus === "out_of_stock") continue;
    if (
      excludedTags.size > 0 &&
      ctx.tags.some((tag) => excludedTags.has(tag.toLowerCase()))
    ) {
      continue;
    }
    if (!passesPriceRange(ctx, rules)) continue;

    filtered.push(item);
    if (filtered.length >= options.limit) break;
  }

  return filtered;
}

/** Pure filter helper for unit tests (no DB). */
export function filterRecommendationsSync(
  items: RecommendationItem[],
  contexts: Map<string, ProductFilterContext>,
  rules: ExclusionRules,
  blockedProductIds: Set<string>,
  limit: number,
): RecommendationItem[] {
  const excludeOutOfStock = rules.excludeOutOfStock !== false;
  const excludedTags = new Set(
    (rules.excludedTags ?? []).map((tag) => tag.toLowerCase()),
  );

  const filtered: RecommendationItem[] = [];
  for (const item of items) {
    if (blockedProductIds.has(item.productId)) continue;
    const ctx = contexts.get(item.productId);
    if (!ctx) continue;
    if (ctx.status !== "active") continue;
    if (excludeOutOfStock && ctx.inventoryStatus === "out_of_stock") continue;
    if (
      excludedTags.size > 0 &&
      ctx.tags.some((tag) => excludedTags.has(tag.toLowerCase()))
    ) {
      continue;
    }
    if (!passesPriceRange(ctx, rules)) continue;
    filtered.push(item);
    if (filtered.length >= limit) break;
  }
  return filtered;
}
