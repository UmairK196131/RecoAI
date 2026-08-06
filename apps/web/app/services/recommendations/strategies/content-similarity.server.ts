import type { RecommendationStrategy } from "@prisma/client";

import { findSimilarProducts, type SimilarProductResult } from "../../embeddings/similarity.server";

export interface RecommendationRequest {
  shopId: string;
  strategy: RecommendationStrategy;
  productId?: string;
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
}

function mapSimilarProduct(result: SimilarProductResult): RecommendationItem {
  return {
    productId: result.productId,
    shopifyProductId: result.shopifyProductId,
    title: result.title,
    score: result.similarity,
    imageUrls: result.imageUrls,
    priceRangeMin: result.priceRangeMin,
    priceRangeMax: result.priceRangeMax,
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
