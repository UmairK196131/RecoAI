import { getAssociationRuleRecommendations } from "./strategies/association-rules.server";
import { getCollaborativeFilteringRecommendations } from "./strategies/collaborative-filtering.server";
import { getContentSimilarityRecommendations } from "./strategies/content-similarity.server";
import { getRecentlyViewedRecommendations } from "./strategies/recently-viewed.server";
import {
  getBestSellerRecommendations,
  getTrendingRecommendations,
} from "./strategies/trending.server";
import { selectStrategiesForRequest } from "./select-strategy.server";
import {
  mergeRecommendationLists,
  type RecommendationItem,
  type RecommendationRequest,
} from "./types";

export type { RecommendationItem, RecommendationRequest } from "./types";
export { selectStrategies, selectStrategiesForRequest } from "./select-strategy.server";
export { getAssociationRuleRecommendations } from "./strategies/association-rules.server";
export { getCollaborativeFilteringRecommendations } from "./strategies/collaborative-filtering.server";
export { getContentSimilarityRecommendations } from "./strategies/content-similarity.server";
export { getRecentlyViewedRecommendations } from "./strategies/recently-viewed.server";
export {
  getBestSellerRecommendations,
  getTrendingRecommendations,
} from "./strategies/trending.server";

/**
 * Cold-start / empty-result fallback for CF and association rules:
 * content similarity (when product context exists) + trending.
 */
async function fallbackContentOrTrending(
  request: RecommendationRequest,
): Promise<RecommendationItem[]> {
  const limit = request.limit ?? 8;
  if (request.productId) {
    const [content, trending] = await Promise.all([
      getContentSimilarityRecommendations(request),
      getTrendingRecommendations(request),
    ]);
    return mergeRecommendationLists([content, trending], limit);
  }
  return getTrendingRecommendations(request);
}

async function runStrategy(
  strategy: RecommendationRequest["strategy"] | "best_sellers",
  request: RecommendationRequest,
): Promise<RecommendationItem[]> {
  switch (strategy) {
    case "content_similarity":
      return getContentSimilarityRecommendations(request);
    case "trending":
      return getTrendingRecommendations(request);
    case "best_sellers":
      return getBestSellerRecommendations(request);
    case "recently_viewed":
      return getRecentlyViewedRecommendations(request);
    case "collaborative_filtering": {
      const items = await getCollaborativeFilteringRecommendations(request);
      if (items.length > 0) return items;
      return fallbackContentOrTrending(request);
    }
    case "association_rules": {
      const items = await getAssociationRuleRecommendations(request);
      if (items.length > 0) return items;
      return fallbackContentOrTrending(request);
    }
    default:
      // personalized_blend arrives in a later sprint.
      return getTrendingRecommendations(request);
  }
}

/**
 * Cold-start aware recommendation fetch (FR-REC-04).
 * Uses the strategy selector, then merges results from chosen strategies.
 */
export async function getRecommendationsWithColdStart(
  request: RecommendationRequest,
): Promise<{
  items: RecommendationItem[];
  selection: Awaited<ReturnType<typeof selectStrategiesForRequest>>;
}> {
  const selection = await selectStrategiesForRequest({
    shopId: request.shopId,
    productId: request.productId,
    sessionId: request.sessionId,
    customerId: request.customerId,
    requestedStrategy: request.strategy,
  });

  const limit = request.limit ?? 8;
  const lists = await Promise.all(
    selection.strategies.map((strategy) =>
      runStrategy(strategy, {
        ...request,
        strategy:
          strategy === "best_sellers" ? "trending" : strategy,
        limit,
      }),
    ),
  );

  return {
    items: mergeRecommendationLists(lists, limit),
    selection,
  };
}
