/**
 * Pure co-purchase matrix builders for item–item collaborative filtering (FR-REC-01a).
 */

export interface CoPurchasePair {
  sourceProductId: string;
  targetProductId: string;
  coOccurrence: number;
  score: number;
}

export interface CoPurchaseMatrixResult {
  pairs: CoPurchasePair[];
  productSupport: Map<string, number>;
  basketCount: number;
}

/** Unique product IDs in a basket (order), preserving first-seen order. */
export function uniqueBasket(productIds: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of productIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Build undirected co-purchase counts from baskets, then score with cosine similarity:
 * score(A,B) = co(A,B) / sqrt(support(A) * support(B)).
 * Emits both directions so serving can look up by source product.
 */
export function buildCoPurchaseMatrix(
  baskets: string[][],
  options?: { minCoOccurrence?: number; maxNeighbors?: number },
): CoPurchaseMatrixResult {
  const minCo = options?.minCoOccurrence ?? 2;
  const maxNeighbors = options?.maxNeighbors ?? 50;

  const productSupport = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  let basketCount = 0;

  for (const raw of baskets) {
    const basket = uniqueBasket(raw);
    if (basket.length < 2) continue;
    basketCount++;

    for (const productId of basket) {
      productSupport.set(productId, (productSupport.get(productId) ?? 0) + 1);
    }

    for (let i = 0; i < basket.length; i++) {
      for (let j = i + 1; j < basket.length; j++) {
        const a = basket[i];
        const b = basket[j];
        const key = a < b ? `${a}\0${b}` : `${b}\0${a}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const neighborsBySource = new Map<string, CoPurchasePair[]>();

  for (const [key, coOccurrence] of pairCounts) {
    if (coOccurrence < minCo) continue;
    const [a, b] = key.split("\0");
    const supportA = productSupport.get(a) ?? 0;
    const supportB = productSupport.get(b) ?? 0;
    if (supportA <= 0 || supportB <= 0) continue;

    const score = coOccurrence / Math.sqrt(supportA * supportB);
    const forward: CoPurchasePair = {
      sourceProductId: a,
      targetProductId: b,
      coOccurrence,
      score,
    };
    const reverse: CoPurchasePair = {
      sourceProductId: b,
      targetProductId: a,
      coOccurrence,
      score,
    };

    const listA = neighborsBySource.get(a) ?? [];
    listA.push(forward);
    neighborsBySource.set(a, listA);

    const listB = neighborsBySource.get(b) ?? [];
    listB.push(reverse);
    neighborsBySource.set(b, listB);
  }

  const pairs: CoPurchasePair[] = [];
  for (const list of neighborsBySource.values()) {
    list.sort((x, y) => y.score - x.score || y.coOccurrence - x.coOccurrence);
    pairs.push(...list.slice(0, maxNeighbors));
  }

  return { pairs, productSupport, basketCount };
}

/**
 * Merge incremental pair deltas into an existing co-occurrence map.
 * Keys use sorted `a\0b` form; values are absolute co-occurrence counts.
 */
export function mergeCoOccurrenceCounts(
  existing: Map<string, number>,
  delta: Map<string, number>,
): Map<string, number> {
  const merged = new Map(existing);
  for (const [key, count] of delta) {
    merged.set(key, (merged.get(key) ?? 0) + count);
  }
  return merged;
}

/** Count undirected pairs from baskets (for incremental updates). */
export function countPairsFromBaskets(baskets: string[][]): {
  pairCounts: Map<string, number>;
  productSupport: Map<string, number>;
  basketCount: number;
} {
  const pairCounts = new Map<string, number>();
  const productSupport = new Map<string, number>();
  let basketCount = 0;

  for (const raw of baskets) {
    const basket = uniqueBasket(raw);
    if (basket.length < 2) continue;
    basketCount++;
    for (const productId of basket) {
      productSupport.set(productId, (productSupport.get(productId) ?? 0) + 1);
    }
    for (let i = 0; i < basket.length; i++) {
      for (let j = i + 1; j < basket.length; j++) {
        const a = basket[i];
        const b = basket[j];
        const key = a < b ? `${a}\0${b}` : `${b}\0${a}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  return { pairCounts, productSupport, basketCount };
}

/** Re-score absolute co-occurrence counts into directed neighbor lists. */
export function scoreCoOccurrenceCounts(
  pairCounts: Map<string, number>,
  productSupport: Map<string, number>,
  options?: { minCoOccurrence?: number; maxNeighbors?: number },
): CoPurchasePair[] {
  const minCo = options?.minCoOccurrence ?? 2;
  const maxNeighbors = options?.maxNeighbors ?? 50;
  const neighborsBySource = new Map<string, CoPurchasePair[]>();

  for (const [key, coOccurrence] of pairCounts) {
    if (coOccurrence < minCo) continue;
    const [a, b] = key.split("\0");
    const supportA = productSupport.get(a) ?? 0;
    const supportB = productSupport.get(b) ?? 0;
    if (supportA <= 0 || supportB <= 0) continue;
    const score = coOccurrence / Math.sqrt(supportA * supportB);

    for (const [source, target] of [
      [a, b],
      [b, a],
    ] as const) {
      const list = neighborsBySource.get(source) ?? [];
      list.push({
        sourceProductId: source,
        targetProductId: target,
        coOccurrence,
        score,
      });
      neighborsBySource.set(source, list);
    }
  }

  const pairs: CoPurchasePair[] = [];
  for (const list of neighborsBySource.values()) {
    list.sort((x, y) => y.score - x.score || y.coOccurrence - x.coOccurrence);
    pairs.push(...list.slice(0, maxNeighbors));
  }
  return pairs;
}
