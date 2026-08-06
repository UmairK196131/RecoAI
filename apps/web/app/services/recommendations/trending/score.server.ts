import type { OrderLineItem } from "../../sync/order-sync.server";

export interface ProductSignalInput {
  productId: string;
  orderVolume: number;
  viewCount: number;
  salesVelocity: number;
}

export interface ScoredProduct extends ProductSignalInput {
  score: number;
}

export interface TrendingWeights {
  orderVolume: number;
  viewCount: number;
  salesVelocity: number;
}

/** Normalize a non-negative signal into [0, 1] using max as ceiling. */
export function normalizeSignal(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(1, value / max);
}

/**
 * Blended trending score from order volume, product views, and sales velocity.
 * Pure function for unit testing.
 */
export function computeTrendingScores(
  inputs: ProductSignalInput[],
  weights: TrendingWeights,
): ScoredProduct[] {
  const maxOrders = Math.max(0, ...inputs.map((item) => item.orderVolume));
  const maxViews = Math.max(0, ...inputs.map((item) => item.viewCount));
  const maxVelocity = Math.max(0, ...inputs.map((item) => item.salesVelocity));

  return inputs
    .map((item) => {
      const score =
        weights.orderVolume * normalizeSignal(item.orderVolume, maxOrders) +
        weights.viewCount * normalizeSignal(item.viewCount, maxViews) +
        weights.salesVelocity * normalizeSignal(item.salesVelocity, maxVelocity);

      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function parseOrderLineItems(raw: unknown): OrderLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is OrderLineItem => {
    return (
      item != null &&
      typeof item === "object" &&
      typeof (item as OrderLineItem).shopifyProductId === "string" &&
      typeof (item as OrderLineItem).quantity === "number"
    );
  });
}
