import db from "../../../db.server";
import { logSyncEvent } from "../../logger.server";
import {
  getCfMaxNeighbors,
  getCfMinCoOccurrence,
  getCfMinOrderThreshold,
} from "../config.server";
import {
  buildModelVersion,
  MODEL_TYPE_COLLABORATIVE_FILTERING,
  registerAndActivateModel,
} from "../model-registry.server";
import { parseOrderLineItems } from "../trending/score.server";
import { clearCfCaches } from "./cache.server";
import {
  buildCoPurchaseMatrix,
  countPairsFromBaskets,
  mergeCoOccurrenceCounts,
  scoreCoOccurrenceCounts,
} from "./matrix.server";

export type CfTrainMode = "incremental" | "full";

async function loadShopifyIdMap(
  shopId: string,
): Promise<Map<string, string>> {
  const products = await db.product.findMany({
    where: { shopId, status: "active" },
    select: { id: true, shopifyProductId: true },
  });
  return new Map(products.map((p) => [p.shopifyProductId, p.id]));
}

async function loadOrderBaskets(
  shopId: string,
  shopifyIdToProductId: Map<string, string>,
  since?: Date,
): Promise<string[][]> {
  const orders = await db.order.findMany({
    where: {
      shopId,
      ...(since ? { createdAt: { gt: since } } : {}),
    },
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

async function lastCfTrainedAt(shopId: string): Promise<Date | null> {
  const entry = await db.modelRegistryEntry.findFirst({
    where: {
      shopId,
      modelType: MODEL_TYPE_COLLABORATIVE_FILTERING,
      status: "active",
    },
    orderBy: { trainedAt: "desc" },
    select: { trainedAt: true },
  });
  return entry?.trainedAt ?? null;
}

/**
 * Train item–item collaborative filtering for one shop.
 * - full: rebuild from all orders
 * - incremental: merge new orders since last train into existing co-occurrence
 */
export async function computeCollaborativeFilteringForShop(
  shopId: string,
  shopDomain: string,
  mode: CfTrainMode = "full",
): Promise<{
  pairs: number;
  orderCount: number;
  skipped: boolean;
  reason?: string;
  modelVersion: string | null;
}> {
  const orderCount = await db.order.count({ where: { shopId } });
  const threshold = getCfMinOrderThreshold();

  if (orderCount < threshold) {
    logSyncEvent({
      event: "cf_train_skipped_below_threshold",
      shop: shopDomain,
      shopId,
      orderCount,
      threshold,
    });
    return {
      pairs: 0,
      orderCount,
      skipped: true,
      reason: `orders ${orderCount} < threshold ${threshold}`,
      modelVersion: null,
    };
  }

  const shopifyIdToProductId = await loadShopifyIdMap(shopId);
  const minCo = getCfMinCoOccurrence();
  const maxNeighbors = getCfMaxNeighbors();
  const trainedAt = new Date();
  const modelVersion = buildModelVersion(
    MODEL_TYPE_COLLABORATIVE_FILTERING,
    mode,
    trainedAt,
  );

  let pairs;
  let basketCount = 0;

  if (mode === "incremental") {
    const since = await lastCfTrainedAt(shopId);
    const newBaskets = await loadOrderBaskets(
      shopId,
      shopifyIdToProductId,
      since ?? undefined,
    );

    if (!since || newBaskets.length === 0) {
      // No prior model or no new orders — fall back to full rebuild.
      const allBaskets = await loadOrderBaskets(shopId, shopifyIdToProductId);
      const matrix = buildCoPurchaseMatrix(allBaskets, {
        minCoOccurrence: minCo,
        maxNeighbors,
      });
      pairs = matrix.pairs;
      basketCount = matrix.basketCount;
    } else {
      const existingRows = await db.coPurchaseScore.findMany({
        where: { shopId },
        select: {
          sourceProductId: true,
          targetProductId: true,
          coOccurrence: true,
        },
      });

      const existingPairs = new Map<string, number>();
      const existingSupport = new Map<string, number>();

      // Reconstruct undirected counts from directed rows (halve by using sorted keys once).
      for (const row of existingRows) {
        const a = row.sourceProductId;
        const b = row.targetProductId;
        const key = a < b ? `${a}\0${b}` : `${b}\0${a}`;
        if (!existingPairs.has(key)) {
          existingPairs.set(key, row.coOccurrence);
        }
      }

      // Approximate support from all baskets when merging incrementally
      const allBaskets = await loadOrderBaskets(shopId, shopifyIdToProductId);
      for (const basket of allBaskets) {
        const unique = [...new Set(basket.filter(Boolean))];
        if (unique.length < 2) continue;
        basketCount++;
        for (const id of unique) {
          existingSupport.set(id, (existingSupport.get(id) ?? 0) + 1);
        }
      }

      const delta = countPairsFromBaskets(newBaskets);
      const mergedPairs = mergeCoOccurrenceCounts(existingPairs, delta.pairCounts);
      pairs = scoreCoOccurrenceCounts(mergedPairs, existingSupport, {
        minCoOccurrence: minCo,
        maxNeighbors,
      });
    }
  } else {
    const baskets = await loadOrderBaskets(shopId, shopifyIdToProductId);
    const matrix = buildCoPurchaseMatrix(baskets, {
      minCoOccurrence: minCo,
      maxNeighbors,
    });
    pairs = matrix.pairs;
    basketCount = matrix.basketCount;
  }

  const validProductIds = new Set(shopifyIdToProductId.values());
  const filtered = pairs.filter(
    (pair) =>
      validProductIds.has(pair.sourceProductId) &&
      validProductIds.has(pair.targetProductId),
  );

  await db.$transaction([
    db.coPurchaseScore.deleteMany({ where: { shopId } }),
    ...(filtered.length > 0
      ? [
          db.coPurchaseScore.createMany({
            data: filtered.map((pair) => ({
              shopId,
              sourceProductId: pair.sourceProductId,
              targetProductId: pair.targetProductId,
              coOccurrence: pair.coOccurrence,
              score: pair.score,
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
    modelType: MODEL_TYPE_COLLABORATIVE_FILTERING,
    version: modelVersion,
    metrics: {
      pairCount: filtered.length,
      orderCount,
      basketCount,
      mode,
    },
    artifactMeta: {
      storage: "co_purchase_scores",
      minCoOccurrence: minCo,
      maxNeighbors,
    },
    trainedAt,
  });

  logSyncEvent({
    event: "cf_train_completed",
    shop: shopDomain,
    shopId,
    mode,
    pairs: filtered.length,
    orderCount,
    modelVersion,
  });

  return {
    pairs: filtered.length,
    orderCount,
    skipped: false,
    modelVersion,
  };
}

export async function runCollaborativeFilteringJob(mode: CfTrainMode = "full") {
  const activeShops = await db.shop.findMany({
    where: { status: "active" },
    select: { id: true, shopifyDomain: true },
  });

  logSyncEvent({
    event: "cf_job_started",
    mode,
    shopCount: activeShops.length,
  });

  let shopsProcessed = 0;
  let pairsStored = 0;
  let shopsSkipped = 0;

  for (const shop of activeShops) {
    try {
      const result = await computeCollaborativeFilteringForShop(
        shop.id,
        shop.shopifyDomain,
        mode,
      );
      shopsProcessed++;
      if (result.skipped) shopsSkipped++;
      pairsStored += result.pairs;
    } catch (error) {
      logSyncEvent({
        event: "cf_job_shop_failed",
        shop: shop.shopifyDomain,
        shopId: shop.id,
        mode,
        error: error instanceof Error ? error.message : "Unknown error",
        level: "error",
      });
    }
  }

  logSyncEvent({
    event: "cf_job_completed",
    mode,
    shopCount: activeShops.length,
    shopsProcessed,
    shopsSkipped,
    pairsStored,
  });

  return { shopCount: activeShops.length, shopsProcessed, shopsSkipped, pairsStored };
}
