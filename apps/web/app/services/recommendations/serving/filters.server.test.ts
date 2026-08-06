import { describe, expect, it } from "vitest";
import {
  filterRecommendationsSync,
  type ProductFilterContext,
} from "./filters.server";
import {
  parseExclusionRules,
  reasonTagsForStrategy,
  toShopifyProductGid,
} from "./parse.server";
import { applySessionViewBoost } from "./rerank.server";
import { computePercentile } from "./timing.server";
import type { RecommendationItem } from "../types";

function item(
  id: string,
  score: number,
  overrides: Partial<RecommendationItem> = {},
): RecommendationItem {
  return {
    productId: id,
    shopifyProductId: id.replace("p", ""),
    title: `Product ${id}`,
    score,
    imageUrls: [],
    priceRangeMin: 10,
    priceRangeMax: 20,
    strategy: "trending",
    ...overrides,
  };
}

function ctx(
  partial: Partial<ProductFilterContext> & { shopifyProductId: string },
): ProductFilterContext {
  return {
    inventoryStatus: "in_stock",
    status: "active",
    tags: [],
    priceRangeMin: 10,
    priceRangeMax: 20,
    ...partial,
  };
}

describe("parseExclusionRules", () => {
  it("defaults excludeOutOfStock to true", () => {
    expect(parseExclusionRules({})).toEqual({
      excludeOutOfStock: true,
      excludedProductIds: [],
      excludedCollectionIds: [],
      excludedTags: [],
      priceMin: null,
      priceMax: null,
    });
  });

  it("parses snake_case and camelCase keys", () => {
    const rules = parseExclusionRules({
      exclude_out_of_stock: false,
      excluded_tags: ["sale"],
      price_min: 5,
      price_max: 50,
    });
    expect(rules.excludeOutOfStock).toBe(false);
    expect(rules.excludedTags).toEqual(["sale"]);
    expect(rules.priceMin).toBe(5);
    expect(rules.priceMax).toBe(50);
  });
});

describe("filterRecommendationsSync", () => {
  const items = [
    item("p1", 0.9),
    item("p2", 0.8),
    item("p3", 0.7),
    item("p4", 0.6),
  ];

  const contexts = new Map<string, ProductFilterContext>([
    ["p1", ctx({ shopifyProductId: "1", inventoryStatus: "out_of_stock" })],
    ["p2", ctx({ shopifyProductId: "2", tags: ["clearance"] })],
    ["p3", ctx({ shopifyProductId: "3", priceRangeMin: 100, priceRangeMax: 120 })],
    ["p4", ctx({ shopifyProductId: "4" })],
  ]);

  it("excludes out-of-stock products", () => {
    const filtered = filterRecommendationsSync(
      items,
      contexts,
      { excludeOutOfStock: true },
      new Set(),
      10,
    );
    expect(filtered.map((r) => r.productId)).toEqual(["p2", "p3", "p4"]);
  });

  it("excludes cart items and tagged products", () => {
    const filtered = filterRecommendationsSync(
      items,
      contexts,
      { excludeOutOfStock: true, excludedTags: ["clearance"] },
      new Set(["p4"]),
      10,
    );
    expect(filtered.map((r) => r.productId)).toEqual(["p3"]);
  });

  it("applies price range constraints", () => {
    const filtered = filterRecommendationsSync(
      items,
      contexts,
      { excludeOutOfStock: false, priceMax: 50 },
      new Set(),
      10,
    );
    expect(filtered.map((r) => r.productId)).toEqual(["p1", "p2", "p4"]);
  });
});

describe("applySessionViewBoost", () => {
  it("boosts viewed products to the top", () => {
    const reranked = applySessionViewBoost(
      [item("p1", 0.5), item("p2", 0.4), item("p3", 0.35)],
      new Set(["p3"]),
      0.2,
    );
    expect(reranked[0].productId).toBe("p3");
    expect(reranked[0].score).toBeCloseTo(0.55);
  });
});

describe("serving helpers", () => {
  it("formats Shopify GIDs", () => {
    expect(toShopifyProductGid("123")).toBe("gid://shopify/Product/123");
    expect(toShopifyProductGid("gid://shopify/Product/123")).toBe(
      "gid://shopify/Product/123",
    );
  });

  it("maps strategies to reason tags", () => {
    expect(reasonTagsForStrategy("content_similarity")).toEqual([
      "similar_category",
    ]);
    expect(reasonTagsForStrategy("association_rules")).toEqual([
      "frequently_bought_together",
    ]);
  });

  it("computes p95 from sorted samples", () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(computePercentile(samples, 95)).toBe(95);
  });
});
