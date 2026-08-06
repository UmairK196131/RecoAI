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
export { getContentSimilarityRecommendations } from "./strategies/content-similarity.server";
export { getRecentlyViewedRecommendations } from "./strategies/recently-viewed.server";
export {
  getBestSellerRecommendations,
  getTrendingRecommendations,
} from "./strategies/trending.server";

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
    default:
      // CF / association_rules / personalized_blend arrive in later sprints.
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
