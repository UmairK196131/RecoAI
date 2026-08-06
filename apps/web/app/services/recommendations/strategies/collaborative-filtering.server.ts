import db from "../../../db.server";
import { getCfMinOrderThreshold } from "../config.server";
import type { RecommendationItem, RecommendationRequest } from "../types";
import { cacheCfNeighbors, getCachedCfNeighbors } from "../cf/cache.server";
import { countShopOrders } from "../select-strategy.server";

function decimalToNumber(
  value: { toNumber(): number } | number | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  return value.toNumber();
}

/**
 * "Customers who bought X also bought Y" — item–item CF from co-purchase scores.
 * Returns [] when below order threshold or no neighbors (caller should fall back).
 */
export async function getCollaborativeFilteringRecommendations(
  request: RecommendationRequest,
): Promise<RecommendationItem[]> {
  if (!request.productId) return [];

  const orderCount = await countShopOrders(request.shopId);
  if (orderCount < getCfMinOrderThreshold()) {
    return [];
  }

  const limit = request.limit ?? 8;
  const exclude = new Set([
    request.productId,
    ...(request.excludeProductIds ?? []),
  ]);

  const cached = await getCachedCfNeighbors(request.shopId, request.productId);
  if (cached && cached.length > 0) {
    return cached.filter((item) => !exclude.has(item.productId)).slice(0, limit);
  }

  const rows = await db.coPurchaseScore.findMany({
    where: {
      shopId: request.shopId,
      sourceProductId: request.productId,
      targetProductId: exclude.size
        ? { notIn: [...exclude] }
        : undefined,
      targetProduct: {
        status: "active",
        inventoryStatus: { not: "out_of_stock" },
      },
    },
    orderBy: [{ score: "desc" }, { coOccurrence: "desc" }],
    take: limit,
    include: {
      targetProduct: {
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

  const items: RecommendationItem[] = rows.map((row) => ({
    productId: row.targetProduct.id,
    shopifyProductId: row.targetProduct.shopifyProductId,
    title: row.targetProduct.title,
    score: row.score,
    imageUrls: row.targetProduct.imageUrls,
    priceRangeMin: decimalToNumber(row.targetProduct.priceRangeMin),
    priceRangeMax: decimalToNumber(row.targetProduct.priceRangeMax),
    strategy: "collaborative_filtering",
  }));

  if (items.length > 0) {
    await cacheCfNeighbors(request.shopId, request.productId, items);
  }

  return items;
}
