/**
 * Lightweight Apriori-style association rule mining for market baskets (FR-REC-01c).
 * Mines 1– and 2-item frequent sets (optionally 3) and emits rules with support/confidence/lift.
 */

export interface AssociationRuleCandidate {
  antecedent: string[];
  consequent: string[];
  support: number;
  confidence: number;
  lift: number;
}

export interface AprioriOptions {
  minSupport?: number;
  minConfidence?: number;
  minLift?: number;
  maxItemsetSize?: 2 | 3;
  maxRules?: number;
}

function itemsetKey(items: string[]): string {
  return [...items].sort().join("\0");
}

function parseKey(key: string): string[] {
  return key.length === 0 ? [] : key.split("\0");
}

/** Unique sorted product IDs per basket. */
export function normalizeBasket(productIds: string[]): string[] {
  return [...new Set(productIds.filter(Boolean))].sort();
}

function countItemsets(
  baskets: string[][],
  size: number,
  candidates: string[][],
): Map<string, number> {
  const counts = new Map<string, number>();
  if (candidates.length === 0) return counts;

  const candidateKeys = new Set(candidates.map(itemsetKey));

  for (const basket of baskets) {
    if (basket.length < size) continue;
    // Generate combinations of `size` from basket and count if candidate
    const combos = combinations(basket, size);
    for (const combo of combos) {
      const key = itemsetKey(combo);
      if (!candidateKeys.has(key)) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function combinations(items: string[], size: number): string[][] {
  if (size <= 0 || size > items.length) return [];
  const result: string[][] = [];

  function walk(start: number, path: string[]) {
    if (path.length === size) {
      result.push([...path]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      path.push(items[i]);
      walk(i + 1, path);
      path.pop();
    }
  }

  walk(0, []);
  return result;
}

/** Join frequent (k-1)-itemsets into k-itemset candidates (Apriori join). */
export function generateCandidates(
  frequentKeys: string[],
  nextSize: number,
): string[][] {
  const frequent = frequentKeys.map(parseKey);
  const candidates: string[][] = [];
  const seen = new Set<string>();

  for (let i = 0; i < frequent.length; i++) {
    for (let j = i + 1; j < frequent.length; j++) {
      const a = frequent[i];
      const b = frequent[j];
      const prefixOk =
        nextSize === 2 ||
        a.slice(0, nextSize - 2).join("\0") === b.slice(0, nextSize - 2).join("\0");
      if (!prefixOk) continue;

      const merged = [...new Set([...a, ...b])].sort();
      if (merged.length !== nextSize) continue;
      const key = itemsetKey(merged);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(merged);
    }
  }

  return candidates;
}

/**
 * Mine association rules from order baskets.
 * Default thresholds are permissive enough for mid-size catalogs in MVP tests.
 */
export function mineAssociationRules(
  rawBaskets: string[][],
  options: AprioriOptions = {},
): AssociationRuleCandidate[] {
  const minSupport = options.minSupport ?? 0.02;
  const minConfidence = options.minConfidence ?? 0.1;
  const minLift = options.minLift ?? 1.0;
  const maxItemsetSize = options.maxItemsetSize ?? 2;
  const maxRules = options.maxRules ?? 500;

  const baskets = rawBaskets
    .map(normalizeBasket)
    .filter((basket) => basket.length >= 2);
  const n = baskets.length;
  if (n === 0) return [];

  const minCount = Math.max(1, Math.ceil(minSupport * n));

  // 1-itemsets
  const singleCounts = new Map<string, number>();
  for (const basket of baskets) {
    for (const item of basket) {
      singleCounts.set(item, (singleCounts.get(item) ?? 0) + 1);
    }
  }

  const frequent = new Map<string, number>();
  for (const [item, count] of singleCounts) {
    if (count >= minCount) frequent.set(item, count);
  }

  if (frequent.size === 0) return [];

  // Higher-order itemsets
  let prevKeys = [...frequent.keys()];
  for (let size = 2; size <= maxItemsetSize; size++) {
    const candidates = generateCandidates(prevKeys, size);
    if (candidates.length === 0) break;
    const counts = countItemsets(baskets, size, candidates);
    const nextKeys: string[] = [];
    for (const [key, count] of counts) {
      if (count >= minCount) {
        frequent.set(key, count);
        nextKeys.push(key);
      }
    }
    prevKeys = nextKeys;
    if (prevKeys.length === 0) break;
  }

  const supportOf = (items: string[]): number => {
    const key = itemsetKey(items);
    const count = frequent.get(key);
    if (count != null) return count / n;
    // Singles always stored by item id
    if (items.length === 1) {
      return (singleCounts.get(items[0]) ?? 0) / n;
    }
    return 0;
  };

  const rules: AssociationRuleCandidate[] = [];

  for (const [key, count] of frequent) {
    const items = parseKey(key);
    if (items.length < 2) continue;
    const itemsetSupport = count / n;

    // For each non-empty proper subset as antecedent
    for (let mask = 1; mask < (1 << items.length) - 1; mask++) {
      const antecedent: string[] = [];
      const consequent: string[] = [];
      for (let bit = 0; bit < items.length; bit++) {
        if (mask & (1 << bit)) antecedent.push(items[bit]);
        else consequent.push(items[bit]);
      }

      const antSupport = supportOf(antecedent);
      if (antSupport <= 0) continue;
      const confidence = itemsetSupport / antSupport;
      if (confidence < minConfidence) continue;

      const consSupport = supportOf(consequent);
      if (consSupport <= 0) continue;
      const lift = confidence / consSupport;
      if (lift < minLift) continue;

      rules.push({
        antecedent: antecedent.sort(),
        consequent: consequent.sort(),
        support: itemsetSupport,
        confidence,
        lift,
      });
    }
  }

  rules.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.lift - a.lift ||
      b.support - a.support,
  );

  return rules.slice(0, maxRules);
}

/**
 * Given a product id, pick consequent products from matching rules
 * (antecedent contains the product), ranked by confidence then lift.
 */
export function frequentlyBoughtTogether(
  rules: AssociationRuleCandidate[],
  productId: string,
  limit: number,
  excludeProductIds: string[] = [],
): Array<{ productId: string; score: number }> {
  const excluded = new Set([productId, ...excludeProductIds]);
  const scores = new Map<string, number>();

  for (const rule of rules) {
    if (!rule.antecedent.includes(productId)) continue;
    for (const consequentId of rule.consequent) {
      if (excluded.has(consequentId)) continue;
      const score = rule.confidence * rule.lift;
      const existing = scores.get(consequentId) ?? 0;
      if (score > existing) scores.set(consequentId, score);
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ productId: id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
