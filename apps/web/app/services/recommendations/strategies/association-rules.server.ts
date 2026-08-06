import db from "../../../db.server";
import { getCfMinOrderThreshold } from "../config.server";
import type { RecommendationItem, RecommendationRequest } from "../types";
import { cacheFbtBundle, getCachedFbtBundle } from "../cf/cache.server";
import { countShopOrders } from "../select-strategy.server";
import { frequentlyBoughtTogether } from "../association/apriori.server";

function decimalToNumber(
  value: { toNumber(): number } | number | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  return value.toNumber();
}

/**
 * "Frequently bought together" bundles from association rules (FR-REC-01c).
 * Returns [] when below order threshold or no matching rules (caller falls back).
 */
export async function getAssociationRuleRecommendations(
  request: RecommendationRequest,
): Promise<RecommendationItem[]> {
  if (!request.productId) return [];

  const orderCount = await countShopOrders(request.shopId);
  if (orderCount < getCfMinOrderThreshold()) {
    return [];
  }

  const limit = request.limit ?? 8;
  const exclude = [
    request.productId,
    ...(request.excludeProductIds ?? []),
  ];

  const cached = await getCachedFbtBundle(request.shopId, request.productId);
  if (cached && cached.length > 0) {
    const excluded = new Set(exclude);
    return cached.filter((item) => !excluded.has(item.productId)).slice(0, limit);
  }

  const rules = await db.associationRule.findMany({
    where: {
      shopId: request.shopId,
      antecedentProductIds: { has: request.productId },
    },
    orderBy: [{ confidence: "desc" }, { lift: "desc" }],
    take: 200,
  });

  const ranked = frequentlyBoughtTogether(
    rules.map((rule) => ({
      antecedent: rule.antecedentProductIds,
      consequent: rule.consequentProductIds,
      support: rule.support,
      confidence: rule.confidence,
      lift: rule.lift,
    })),
    request.productId,
    limit,
    request.excludeProductIds,
  );

  if (ranked.length === 0) return [];

  const products = await db.product.findMany({
    where: {
      shopId: request.shopId,
      id: { in: ranked.map((r) => r.productId) },
      status: "active",
      inventoryStatus: { not: "out_of_stock" },
    },
    select: {
      id: true,
      shopifyProductId: true,
      title: true,
      imageUrls: true,
      priceRangeMin: true,
      priceRangeMax: true,
    },
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  const items: RecommendationItem[] = [];

  for (const entry of ranked) {
    const product = byId.get(entry.productId);
    if (!product) continue;
    items.push({
      productId: product.id,
      shopifyProductId: product.shopifyProductId,
      title: product.title,
      score: entry.score,
      imageUrls: product.imageUrls,
      priceRangeMin: decimalToNumber(product.priceRangeMin),
      priceRangeMax: decimalToNumber(product.priceRangeMax),
      strategy: "association_rules",
    });
  }

  if (items.length > 0) {
    await cacheFbtBundle(request.shopId, request.productId, items);
  }

  return items.slice(0, limit);
}
