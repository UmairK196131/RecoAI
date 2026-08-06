import db from "../../../db.server";
import type { RecommendationItem, RecommendationRequest } from "../types";
import {
  getCachedBestSellersList,
  getCachedTrendingList,
} from "../trending/cache.server";

function decimalToNumber(
  value: { toNumber(): number } | number | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  return value.toNumber();
}

function filterItems(
  items: RecommendationItem[],
  excludeProductIds: string[],
  limit: number,
): RecommendationItem[] {
  const excluded = new Set(excludeProductIds);
  return items.filter((item) => !excluded.has(item.productId)).slice(0, limit);
}

async function loadFromDb(
  shopId: string,
  orderBy: "score" | "orderVolume",
  limit: number,
  excludeProductIds: string[],
  strategy: "trending" | "best_sellers",
): Promise<RecommendationItem[]> {
  const rows = await db.trendingScore.findMany({
    where: {
      shopId,
      productId: excludeProductIds.length
        ? { notIn: excludeProductIds }
        : undefined,
      product: {
        status: "active",
        inventoryStatus: { not: "out_of_stock" },
      },
    },
    orderBy:
      orderBy === "orderVolume"
        ? [{ orderVolume: "desc" }, { score: "desc" }]
        : [{ score: "desc" }],
    take: limit,
    include: {
      product: {
        select: {
          id: true,
          shopifyProductId: true,
          title: true,
          imageUrls: true,
          priceRangeMin: true,
          priceRangeMax: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    productId: row.product.id,
    shopifyProductId: row.product.shopifyProductId,
    title: row.product.title,
    score: orderBy === "orderVolume" && row.orderVolume > 0 ? row.orderVolume : row.score,
    imageUrls: row.product.imageUrls,
    priceRangeMin: decimalToNumber(row.product.priceRangeMin),
    priceRangeMax: decimalToNumber(row.product.priceRangeMax),
    strategy,
  }));
}

/**
 * Fallback when trending scores have not been computed yet:
 * rank active in-stock products by recency so cold-start is never empty.
 */
async function catalogFallback(
  shopId: string,
  limit: number,
  excludeProductIds: string[],
  strategy: "trending" | "best_sellers",
): Promise<RecommendationItem[]> {
  const products = await db.product.findMany({
    where: {
      shopId,
      status: "active",
      inventoryStatus: { not: "out_of_stock" },
      id: excludeProductIds.length ? { notIn: excludeProductIds } : undefined,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      shopifyProductId: true,
      title: true,
      imageUrls: true,
      priceRangeMin: true,
      priceRangeMax: true,
    },
  });

  return products.map((product, index) => ({
    productId: product.id,
    shopifyProductId: product.shopifyProductId,
    title: product.title,
    score: 1 / (index + 1),
    imageUrls: product.imageUrls,
    priceRangeMin: decimalToNumber(product.priceRangeMin),
    priceRangeMax: decimalToNumber(product.priceRangeMax),
    strategy,
  }));
}

export async function getTrendingRecommendations(
  request: RecommendationRequest,
): Promise<RecommendationItem[]> {
  const limit = request.limit ?? 8;
  const exclude = [
    ...(request.excludeProductIds ?? []),
    ...(request.productId ? [request.productId] : []),
  ];

  const cached = await getCachedTrendingList(request.shopId);
  if (cached && cached.length > 0) {
    return filterItems(cached, exclude, limit);
  }

  const fromDb = await loadFromDb(request.shopId, "score", limit, exclude, "trending");
  if (fromDb.length > 0) return fromDb;

  return catalogFallback(request.shopId, limit, exclude, "trending");
}

/** Best-sellers: order-volume–first ranking over the same rolling window. */
export async function getBestSellerRecommendations(
  request: RecommendationRequest,
): Promise<RecommendationItem[]> {
  const limit = request.limit ?? 8;
  const exclude = [
    ...(request.excludeProductIds ?? []),
    ...(request.productId ? [request.productId] : []),
  ];

  const cached = await getCachedBestSellersList(request.shopId);
  if (cached && cached.length > 0) {
    return filterItems(cached, exclude, limit);
  }

  const fromDb = await loadFromDb(
    request.shopId,
    "orderVolume",
    limit,
    exclude,
    "best_sellers",
  );
  if (fromDb.length > 0) return fromDb;

  return catalogFallback(request.shopId, limit, exclude, "best_sellers");
}
