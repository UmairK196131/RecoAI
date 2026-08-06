import { describe, expect, it } from "vitest";

import {
  buildCoPurchaseMatrix,
  countPairsFromBaskets,
  mergeCoOccurrenceCounts,
  scoreCoOccurrenceCounts,
  uniqueBasket,
} from "./matrix.server";

describe("uniqueBasket", () => {
  it("dedupes while preserving order", () => {
    expect(uniqueBasket(["a", "b", "a", "", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("buildCoPurchaseMatrix", () => {
  it("scores co-purchased neighbors for customers-also-bought", () => {
    const baskets = [
      ["p1", "p2"],
      ["p1", "p2", "p3"],
      ["p1", "p2"],
      ["p2", "p3"],
      ["p1", "p4"],
    ];

    const { pairs, basketCount } = buildCoPurchaseMatrix(baskets, {
      minCoOccurrence: 2,
      maxNeighbors: 10,
    });

    expect(basketCount).toBe(5);

    const fromP1 = pairs
      .filter((pair) => pair.sourceProductId === "p1")
      .sort((a, b) => b.score - a.score);

    expect(fromP1.length).toBeGreaterThan(0);
    expect(fromP1[0].targetProductId).toBe("p2");
    expect(fromP1[0].coOccurrence).toBe(3);
  });

  it("emits both directions for a pair", () => {
    const { pairs } = buildCoPurchaseMatrix(
      [
        ["a", "b"],
        ["a", "b"],
      ],
      { minCoOccurrence: 2 },
    );

    const keys = new Set(
      pairs.map((pair) => `${pair.sourceProductId}->${pair.targetProductId}`),
    );
    expect(keys.has("a->b")).toBe(true);
    expect(keys.has("b->a")).toBe(true);
  });
});

describe("incremental merge", () => {
  it("merges pair counts and re-scores", () => {
    const base = countPairsFromBaskets([
      ["a", "b"],
      ["a", "b"],
    ]);
    const delta = countPairsFromBaskets([["a", "b", "c"]]);
    const merged = mergeCoOccurrenceCounts(base.pairCounts, delta.pairCounts);

    const support = new Map<string, number>();
    for (const [id, count] of base.productSupport) {
      support.set(id, count);
    }
    for (const [id, count] of delta.productSupport) {
      support.set(id, (support.get(id) ?? 0) + count);
    }

    const pairs = scoreCoOccurrenceCounts(merged, support, {
      minCoOccurrence: 2,
    });

    const ab = pairs.find(
      (pair) => pair.sourceProductId === "a" && pair.targetProductId === "b",
    );
    expect(ab?.coOccurrence).toBe(3);
  });
});
