import db from "../../../db.server";
import { logSyncEvent } from "../../logger.server";
import {
  getAssociationMinConfidence,
  getAssociationMinLift,
  getAssociationMinSupport,
  getCfMinOrderThreshold,
} from "../config.server";
import {
  buildModelVersion,
  MODEL_TYPE_ASSOCIATION_RULES,
  registerAndActivateModel,
} from "../model-registry.server";
import { parseOrderLineItems } from "../trending/score.server";
import { clearCfCaches } from "../cf/cache.server";
import { mineAssociationRules } from "./apriori.server";

async function loadShopifyIdMap(shopId: string): Promise<Map<string, string>> {
  const products = await db.product.findMany({
    where: { shopId, status: "active" },
    select: { id: true, shopifyProductId: true },
  });
  return new Map(products.map((p) => [p.shopifyProductId, p.id]));
}

async function loadOrderBaskets(
  shopId: string,
  shopifyIdToProductId: Map<string, string>,
): Promise<string[][]> {
  const orders = await db.order.findMany({
    where: { shopId },
    select: { lineItems: true },
  });

  const baskets: string[][] = [];
  for (const order of orders) {
    const productIds: string[] = [];
    for (const line of parseOrderLineItems(order.lineItems)) {
      if (!line.shopifyProductId) continue;
      const productId = shopifyIdToProductId.get(line.shopifyProductId);
      if (productId) productIds.push(productId);
    }
    baskets.push(productIds);
  }
  return baskets;
}

/** Daily association-rule mining for one shop (FR-REC-01c / SRS 5.3). */
export async function computeAssociationRulesForShop(
  shopId: string,
  shopDomain: string,
): Promise<{
  rules: number;
  orderCount: number;
  skipped: boolean;
  reason?: string;
  modelVersion: string | null;
}> {
  const orderCount = await db.order.count({ where: { shopId } });
  const threshold = getCfMinOrderThreshold();

  if (orderCount < threshold) {
    logSyncEvent({
      event: "association_train_skipped_below_threshold",
      shop: shopDomain,
      shopId,
      orderCount,
      threshold,
    });
    return {
      rules: 0,
      orderCount,
      skipped: true,
      reason: `orders ${orderCount} < threshold ${threshold}`,
      modelVersion: null,
    };
  }

  const shopifyIdToProductId = await loadShopifyIdMap(shopId);
  const baskets = await loadOrderBaskets(shopId, shopifyIdToProductId);
  const trainedAt = new Date();
  const modelVersion = buildModelVersion(
    MODEL_TYPE_ASSOCIATION_RULES,
    "daily",
    trainedAt,
  );

  const mined = mineAssociationRules(baskets, {
    minSupport: getAssociationMinSupport(),
    minConfidence: getAssociationMinConfidence(),
    minLift: getAssociationMinLift(),
    maxItemsetSize: 2,
    maxRules: 1000,
  });

  const validIds = new Set(shopifyIdToProductId.values());
  const filtered = mined.filter(
    (rule) =>
      rule.antecedent.every((id) => validIds.has(id)) &&
      rule.consequent.every((id) => validIds.has(id)),
  );

  await db.$transaction([
    db.associationRule.deleteMany({ where: { shopId } }),
    ...(filtered.length > 0
      ? [
          db.associationRule.createMany({
            data: filtered.map((rule) => ({
              shopId,
              antecedentProductIds: rule.antecedent,
              consequentProductIds: rule.consequent,
              support: rule.support,
              confidence: rule.confidence,
              lift: rule.lift,
              modelVersion,
              computedAt: trainedAt,
            })),
          }),
        ]
      : []),
  ]);

  await clearCfCaches(shopId);

  await registerAndActivateModel({
    shopId,
    modelType: MODEL_TYPE_ASSOCIATION_RULES,
    version: modelVersion,
    metrics: {
      ruleCount: filtered.length,
      orderCount,
      basketCount: baskets.filter((b) => new Set(b).size >= 2).length,
    },
    artifactMeta: {
      storage: "association_rules",
      minSupport: getAssociationMinSupport(),
      minConfidence: getAssociationMinConfidence(),
      minLift: getAssociationMinLift(),
    },
    trainedAt,
  });

  logSyncEvent({
    event: "association_train_completed",
    shop: shopDomain,
    shopId,
    rules: filtered.length,
    orderCount,
    modelVersion,
  });

  return {
    rules: filtered.length,
    orderCount,
    skipped: false,
    modelVersion,
  };
}

export async function runAssociationRulesJob() {
  const activeShops = await db.shop.findMany({
    where: { status: "active" },
    select: { id: true, shopifyDomain: true },
  });

  logSyncEvent({
    event: "association_job_started",
    shopCount: activeShops.length,
  });

  let shopsProcessed = 0;
  let rulesStored = 0;
  let shopsSkipped = 0;

  for (const shop of activeShops) {
    try {
      const result = await computeAssociationRulesForShop(
        shop.id,
        shop.shopifyDomain,
      );
      shopsProcessed++;
      if (result.skipped) shopsSkipped++;
      rulesStored += result.rules;
    } catch (error) {
      logSyncEvent({
        event: "association_job_shop_failed",
        shop: shop.shopifyDomain,
        shopId: shop.id,
        error: error instanceof Error ? error.message : "Unknown error",
        level: "error",
      });
    }
  }

  logSyncEvent({
    event: "association_job_completed",
    shopCount: activeShops.length,
    shopsProcessed,
    shopsSkipped,
    rulesStored,
  });

  return { shopCount: activeShops.length, shopsProcessed, shopsSkipped, rulesStored };
}
