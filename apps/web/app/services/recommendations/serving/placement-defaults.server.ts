import type { PlacementType, RecommendationStrategy } from "@prisma/client";

/**
 * Storefront placement keys (FR-REC-05). Map to DB PlacementType + defaults
 * when the merchant has not configured a RecommendationPlacement row.
 */
export type PlacementKey =
  | "product_you_may_also_like"
  | "product_frequently_bought_together"
  | "cart"
  | "home_trending"
  | "home_picks_for_you"
  | "collection"
  | "search"
  | "product_page"
  | "home";

export interface PlacementDefaults {
  placementType: PlacementType;
  strategy: RecommendationStrategy;
  titleText: string;
  placementKey: string;
}

const KEY_DEFAULTS: Record<string, PlacementDefaults> = {
  product_you_may_also_like: {
    placementType: "product_page",
    strategy: "content_similarity",
    titleText: "You may also like",
    placementKey: "product_page_you_may_also_like",
  },
  product_frequently_bought_together: {
    placementType: "product_page",
    strategy: "association_rules",
    titleText: "Frequently bought together",
    placementKey: "product_page_frequently_bought_together",
  },
  product_page: {
    placementType: "product_page",
    strategy: "content_similarity",
    titleText: "You may also like",
    placementKey: "product_page_you_may_also_like",
  },
  cart: {
    placementType: "cart",
    strategy: "association_rules",
    titleText: "Add these too",
    placementKey: "cart_add_these_too",
  },
  home_trending: {
    placementType: "home",
    strategy: "trending",
    titleText: "Trending now",
    placementKey: "home_trending_now",
  },
  home: {
    placementType: "home",
    strategy: "trending",
    titleText: "Trending now",
    placementKey: "home_trending_now",
  },
  home_picks_for_you: {
    placementType: "home",
    strategy: "personalized_blend",
    titleText: "Picks for you",
    placementKey: "home_picks_for_you",
  },
  collection: {
    placementType: "collection",
    strategy: "content_similarity",
    titleText: "Related products",
    placementKey: "collection_related_products",
  },
  search: {
    placementType: "search",
    strategy: "trending",
    titleText: "Popular picks",
    placementKey: "search_popular_picks",
  },
};

const TYPE_DEFAULTS: Record<PlacementType, PlacementDefaults> = {
  product_page: KEY_DEFAULTS.product_page,
  cart: KEY_DEFAULTS.cart,
  home: KEY_DEFAULTS.home,
  collection: KEY_DEFAULTS.collection,
  search: KEY_DEFAULTS.search,
};

export function isPlacementKey(value: string): boolean {
  return value in KEY_DEFAULTS || value in TYPE_DEFAULTS;
}

/**
 * Resolve defaults from an optional placement_key or coarse placement_type.
 */
export function getPlacementDefaults(
  placementTypeOrKey: string,
  placementKey?: string | null,
): PlacementDefaults {
  if (placementKey && KEY_DEFAULTS[placementKey]) {
    return KEY_DEFAULTS[placementKey];
  }
  if (KEY_DEFAULTS[placementTypeOrKey]) {
    return KEY_DEFAULTS[placementTypeOrKey];
  }
  if (placementTypeOrKey in TYPE_DEFAULTS) {
    return TYPE_DEFAULTS[placementTypeOrKey as PlacementType];
  }
  return {
    placementType: "home",
    strategy: "trending",
    titleText: "Recommended for you",
    placementKey: "home_trending_now",
  };
}

export function defaultStrategyForPlacement(
  placementType: PlacementType,
  placementKey?: string | null,
): RecommendationStrategy {
  return getPlacementDefaults(placementType, placementKey).strategy;
}

export function defaultTitleForPlacement(
  placementType: PlacementType,
  placementKey?: string | null,
): string {
  return getPlacementDefaults(placementType, placementKey).titleText;
}

export function coercePlacementType(
  placementTypeOrKey: string,
): PlacementType | null {
  if (placementTypeOrKey in TYPE_DEFAULTS) {
    return placementTypeOrKey as PlacementType;
  }
  const defaults = KEY_DEFAULTS[placementTypeOrKey];
  return defaults?.placementType ?? null;
}
