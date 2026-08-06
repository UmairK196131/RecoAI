import type { RecommendationStrategy } from "@prisma/client";

export interface RecommendationRequest {
  shopId: string;
  strategy: RecommendationStrategy;
  productId?: string;
  sessionId?: string;
  customerId?: string;
  limit?: number;
  excludeProductIds?: string[];
}

export interface RecommendationItem {
  productId: string;
  shopifyProductId: string;
  title: string;
  score: number;
  imageUrls: string[];
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  strategy?: RecommendationStrategy | "best_sellers";
}

export type ColdStartScenario =
  | "new_store"
  | "new_product"
  | "anonymous_shopper"
  | "none";

export interface StrategySelectionContext {
  shopId: string;
  productId?: string;
  sessionId?: string;
  customerId?: string;
  requestedStrategy?: RecommendationStrategy;
  orderCount?: number;
  productInteractionCount?: number;
  sessionEventCount?: number;
}

export interface StrategySelection {
  scenario: ColdStartScenario;
  strategies: Array<RecommendationStrategy | "best_sellers">;
  reason: string;
}

/** Deduplicate recommendation lists, keeping the highest score per product. */
export function mergeRecommendationLists(
  lists: RecommendationItem[][],
  limit: number,
): RecommendationItem[] {
  const byProduct = new Map<string, RecommendationItem>();

  for (const list of lists) {
    for (const item of list) {
      const existing = byProduct.get(item.productId);
      if (!existing || item.score > existing.score) {
        byProduct.set(item.productId, item);
      }
    }
  }

  return [...byProduct.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
