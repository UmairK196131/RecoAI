import { findSimilarProducts, type SimilarProductResult } from "../../embeddings/similarity.server";
import type { RecommendationItem, RecommendationRequest } from "../types";

function mapSimilarProduct(result: SimilarProductResult): RecommendationItem {
  return {
    productId: result.productId,
    shopifyProductId: result.shopifyProductId,
    title: result.title,
    score: result.similarity,
    imageUrls: result.imageUrls,
    priceRangeMin: result.priceRangeMin,
    priceRangeMax: result.priceRangeMax,
    strategy: "content_similarity",
  };
}

export async function getContentSimilarityRecommendations(
  request: RecommendationRequest,
): Promise<RecommendationItem[]> {
  if (!request.productId) {
    return [];
  }

  const results = await findSimilarProducts({
    shopId: request.shopId,
    productId: request.productId,
    limit: request.limit ?? 8,
    excludeProductIds: request.excludeProductIds,
    requireInStock: true,
  });

  return results.map(mapSimilarProduct);
}
