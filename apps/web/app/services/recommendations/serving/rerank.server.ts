import db from "../../../db.server";
import { getSessionRerankBoost } from "../config.server";
import type { RecommendationItem } from "../types";

/**
 * Re-rank recommendations using current session product views (FR-REC-07).
 * Products viewed in-session receive a score boost so related items surface higher.
 * Does not inject new products — only reorders the existing candidate list.
 */
export async function rerankBySessionViews(
  shopId: string,
  sessionId: string | undefined,
  items: RecommendationItem[],
): Promise<RecommendationItem[]> {
  if (!sessionId || items.length <= 1) return items;

  const events = await db.behavioralEvent.findMany({
    where: {
      shopId,
      sessionId,
      eventType: "product_view",
      productId: { not: null },
    },
    orderBy: { timestamp: "desc" },
    select: { productId: true },
    take: 40,
  });

  if (events.length === 0) return items;

  const viewed = new Set<string>();
  for (const event of events) {
    if (event.productId) viewed.add(event.productId);
  }

  return applySessionViewBoost(items, viewed, getSessionRerankBoost());
}

/** Pure re-rank for unit tests. */
export function applySessionViewBoost(
  items: RecommendationItem[],
  viewedProductIds: Set<string>,
  boost: number,
): RecommendationItem[] {
  if (viewedProductIds.size === 0 || items.length <= 1) return items;

  return [...items]
    .map((item) => {
      if (!viewedProductIds.has(item.productId)) return item;
      return {
        ...item,
        score: item.score + boost,
      };
    })
    .sort((a, b) => b.score - a.score);
}
