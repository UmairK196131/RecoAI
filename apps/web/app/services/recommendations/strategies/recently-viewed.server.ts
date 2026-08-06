import db from "../../../db.server";
import type { RecommendationItem, RecommendationRequest } from "../types";

function decimalToNumber(
  value: { toNumber(): number } | number | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  return value.toNumber();
}

/**
 * Session-based recently viewed products from BehavioralEvent product_view rows.
 * Returns products in most-recent-first order (deduped).
 */
export async function getRecentlyViewedRecommendations(
  request: RecommendationRequest,
): Promise<RecommendationItem[]> {
  if (!request.sessionId) {
    return [];
  }

  const limit = request.limit ?? 8;
  const exclude = new Set([
    ...(request.excludeProductIds ?? []),
    ...(request.productId ? [request.productId] : []),
  ]);

  const events = await db.behavioralEvent.findMany({
    where: {
      shopId: request.shopId,
      sessionId: request.sessionId,
      eventType: "product_view",
      productId: { not: null },
    },
    orderBy: { timestamp: "desc" },
    select: {
      productId: true,
      timestamp: true,
      product: {
        select: {
          id: true,
          shopifyProductId: true,
          title: true,
          imageUrls: true,
          priceRangeMin: true,
          priceRangeMax: true,
          status: true,
          inventoryStatus: true,
        },
      },
    },
    take: Math.max(limit * 4, 40),
  });

  const seen = new Set<string>();
  const items: RecommendationItem[] = [];

  for (const event of events) {
    const product = event.product;
    if (!product || !event.productId) continue;
    if (seen.has(product.id) || exclude.has(product.id)) continue;
    if (product.status !== "active") continue;

    seen.add(product.id);
    items.push({
      productId: product.id,
      shopifyProductId: product.shopifyProductId,
      title: product.title,
      // Higher score = more recently viewed
      score: items.length === 0 ? 1 : 1 / (items.length + 1),
      imageUrls: product.imageUrls,
      priceRangeMin: decimalToNumber(product.priceRangeMin),
      priceRangeMax: decimalToNumber(product.priceRangeMax),
      strategy: "recently_viewed",
    });

    if (items.length >= limit) break;
  }

  return items;
}
