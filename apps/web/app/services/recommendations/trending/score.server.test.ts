import { describe, expect, it } from "vitest";

import {
  computeTrendingScores,
  normalizeSignal,
} from "./score.server";

describe("normalizeSignal", () => {
  it("returns 0 for empty max or zero value", () => {
    expect(normalizeSignal(5, 0)).toBe(0);
    expect(normalizeSignal(0, 10)).toBe(0);
  });

  it("scales relative to max", () => {
    expect(normalizeSignal(5, 10)).toBe(0.5);
    expect(normalizeSignal(10, 10)).toBe(1);
  });
});

describe("computeTrendingScores", () => {
  const weights = {
    orderVolume: 0.45,
    viewCount: 0.25,
    salesVelocity: 0.3,
  };

  it("ranks products with stronger blended signals higher", () => {
    const scored = computeTrendingScores(
      [
        {
          productId: "a",
          orderVolume: 10,
          viewCount: 100,
          salesVelocity: 2,
        },
        {
          productId: "b",
          orderVolume: 1,
          viewCount: 5,
          salesVelocity: 0.2,
        },
        {
          productId: "c",
          orderVolume: 0,
          viewCount: 0,
          salesVelocity: 0,
        },
      ],
      weights,
    );

    expect(scored[0].productId).toBe("a");
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
    expect(scored[2].score).toBe(0);
  });
});
