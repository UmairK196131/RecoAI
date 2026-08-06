import type {
  PlacementType,
  RecommendationStrategy,
} from "@prisma/client";
import type { RecommendationItem } from "../types";

/** Merchant exclusion / business rules stored on RecommendationPlacement.exclusionRules. */
export interface ExclusionRules {
  /** Default true — exclude out-of-stock products (FR-REC-03). */
  excludeOutOfStock?: boolean;
  /** Internal product IDs or Shopify product IDs. */
  excludedProductIds?: string[];
  /** Internal collection IDs or Shopify collection IDs. */
  excludedCollectionIds?: string[];
  /** Product tags that must never be recommended. */
  excludedTags?: string[];
  /** Inclusive minimum price (uses product priceRangeMin). */
  priceMin?: number | null;
  /** Inclusive maximum price (uses product priceRangeMax). */
  priceMax?: number | null;
}

export interface ServingRequest {
  shop: string;
  placementType: PlacementType;
  /** Shopify product ID (numeric or GID). */
  productId?: string;
  sessionId?: string;
  /** Shopify product IDs currently in the cart. */
  cartProductIds?: string[];
}

export interface ServingRecommendation {
  product_id: string;
  title: string;
  score: number;
  reason_tags: string[];
}

export interface ServingResponse {
  placement: string;
  product_id: string | null;
  strategy_used: string;
  recommendations: ServingRecommendation[];
  generated_at: string;
  /** Present for observability; storefront may ignore. */
  meta?: {
    cache_hit: boolean;
    latency_ms: number;
  };
}

export interface CachedServingPayload {
  items: RecommendationItem[];
  strategyUsed: string;
  placementKey: string;
  generatedAt: string;
}

export interface ResolvedPlacement {
  id: string | null;
  placementType: PlacementType;
  strategy: RecommendationStrategy | null;
  enabled: boolean;
  maxItems: number;
  titleText: string;
  exclusionRules: ExclusionRules;
}

export type { PlacementType, RecommendationStrategy, RecommendationItem };
