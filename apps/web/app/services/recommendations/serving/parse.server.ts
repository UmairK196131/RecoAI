import type { PlacementType, RecommendationStrategy } from "@prisma/client";
import {
  coercePlacementType,
  isPlacementKey,
} from "./placement-defaults.server";
import type { ExclusionRules } from "./types.server";

const PLACEMENT_TYPES = new Set<string>([
  "product_page",
  "cart",
  "home",
  "collection",
  "search",
]);

const STRATEGIES = new Set<string>([
  "collaborative_filtering",
  "content_similarity",
  "association_rules",
  "trending",
  "recently_viewed",
  "personalized_blend",
]);

export function isPlacementType(value: string): value is PlacementType {
  return PLACEMENT_TYPES.has(value);
}

export function isRecommendationStrategy(
  value: string,
): value is RecommendationStrategy {
  return STRATEGIES.has(value);
}

/** Normalize Shopify GID or numeric ID to the numeric string stored in DB. */
export function normalizeShopifyId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes("/")) {
    return trimmed.split("/").pop() ?? trimmed;
  }
  return trimmed;
}

/** @deprecated Prefer normalizeShopifyId — kept for existing call sites. */
export function normalizeShopifyProductId(raw: string): string {
  return normalizeShopifyId(raw);
}

/**
 * Accept coarse placement_type or fine-grained placement_key values from the widget.
 */
export function resolvePlacementTypeParam(
  placementTypeRaw: string,
): PlacementType | null {
  if (isPlacementType(placementTypeRaw)) return placementTypeRaw;
  return coercePlacementType(placementTypeRaw);
}

export function normalizePlacementKeyParam(
  placementKeyRaw: string | null,
  placementTypeRaw: string,
): string | undefined {
  if (placementKeyRaw && isPlacementKey(placementKeyRaw)) {
    return placementKeyRaw;
  }
  if (isPlacementKey(placementTypeRaw)) {
    return placementTypeRaw;
  }
  return undefined;
}

export function toShopifyProductGid(shopifyProductId: string): string {
  if (shopifyProductId.startsWith("gid://")) return shopifyProductId;
  return `gid://shopify/Product/${shopifyProductId}`;
}

export function parseCartProductIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => normalizeShopifyId(part))
    .filter(Boolean);
}

export function parseExclusionRules(raw: unknown): ExclusionRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { excludeOutOfStock: true };
  }

  const obj = raw as Record<string, unknown>;

  const excludedProductIds = asStringArray(
    obj.excludedProductIds ?? obj.excluded_product_ids ?? obj.products,
  );
  const excludedCollectionIds = asStringArray(
    obj.excludedCollectionIds ??
      obj.excluded_collection_ids ??
      obj.collections,
  );
  const excludedTags = asStringArray(
    obj.excludedTags ?? obj.excluded_tags ?? obj.tags,
  );

  const priceMin = asOptionalNumber(obj.priceMin ?? obj.price_min);
  const priceMax = asOptionalNumber(obj.priceMax ?? obj.price_max);

  const excludeOutOfStock =
    typeof obj.excludeOutOfStock === "boolean"
      ? obj.excludeOutOfStock
      : typeof obj.exclude_out_of_stock === "boolean"
        ? obj.exclude_out_of_stock
        : true;

  return {
    excludeOutOfStock,
    excludedProductIds,
    excludedCollectionIds,
    excludedTags,
    priceMin,
    priceMax,
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string | number => typeof item === "string" || typeof item === "number")
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function asOptionalNumber(value: unknown): number | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const STRATEGY_REASON_TAGS: Record<string, string[]> = {
  collaborative_filtering: ["frequently_bought_together"],
  association_rules: ["frequently_bought_together"],
  content_similarity: ["similar_category"],
  trending: ["trending"],
  best_sellers: ["best_seller"],
  recently_viewed: ["recently_viewed"],
  personalized_blend: ["personalized"],
};

export function reasonTagsForStrategy(
  strategy: RecommendationStrategy | "best_sellers" | string | undefined,
): string[] {
  if (!strategy) return ["recommended"];
  return STRATEGY_REASON_TAGS[strategy] ?? ["recommended"];
}

export function placementResponseKey(
  placementType: PlacementType,
  titleText: string,
): string {
  const slug = titleText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return slug ? `${placementType}_${slug}` : placementType;
}

export function strategyUsedLabel(
  strategies: Array<RecommendationStrategy | "best_sellers" | string>,
): string {
  if (strategies.length === 0) return "trending";
  if (strategies.length === 1) return strategies[0];
  const unique = [...new Set(strategies)];
  if (unique.length === 1) return unique[0];
  return `hybrid_${unique.join("_")}`;
}
