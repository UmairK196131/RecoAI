import db from "../../../db.server";
import { logSyncEvent } from "../../logger.server";
import {
  getTrendingSignalWeights,
  getTrendingWindowHours,
} from "../config.server";
import type { RecommendationItem } from "../types";
import { cacheBestSellersList, cacheTrendingList } from "./cache.server";
import {
  computeTrendingScores,
  parseOrderLineItems,
  type ProductSignalInput,
} from "./score.server";

interface ProductRow {
  id: string;
  shopifyProductId: string;
  title: string;
  imageUrls: string[];
  priceRangeMin: { toNumber(): number } | number | null;
  priceRangeMax: { toNumber(): number } | number | null;
}

function decimalToNumber(
  value: { toNumber(): number } | number | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  return value.toNumber();
}

function toRecommendationItem(
  product: ProductRow,
  score: number,
  strategy: "trending" | "best_sellers",
): RecommendationItem {
  return {
    productId: product.id,
    shopifyProductId: product.shopifyProductId,
    title: product.title,
    score,
    imageUrls: product.imageUrls,
    priceRangeMin: decimalToNumber(product.priceRangeMin),
    priceRangeMax: decimalToNumber(product.priceRangeMax),
    strategy,
  };
}

async function collectOrderVolumes(
  shopId: string,
  windowStart: Date,
  shopifyIdToProductId: Map<string, string>,
): Promise<Map<string, number>> {
  const orders = await db.order.findMany({
    where: {
      shopId,
      createdAt: { gte: windowStart },
    },
    select: { lineItems: true },
  });

  const volumes = new Map<string, number>();

  for (const order of orders) {
    for (const line of parseOrderLineItems(order.lineItems)) {
      if (!line.shopifyProductId || line.quantity <= 0) continue;
      const productId = shopifyIdToProductId.get(line.shopifyProductId);
      if (!productId) continue;
      volumes.set(productId, (volumes.get(productId) ?? 0) + line.quantity);
    }
  }

  return volumes;
}

async function collectViewCounts(
  shopId: string,
  windowStart: Date,
): Promise<Map<string, number>> {
  const grouped = await db.behavioralEvent.groupBy({
    by: ["productId"],
    where: {
      shopId,
      eventType: "product_view",
      timestamp: { gte: windowStart },
      productId: { not: null },
    },
    _count: { _all: true },
  });

  const views = new Map<string, number>();
  for (const row of grouped) {
    if (!row.productId) continue;
    views.set(row.productId, row._count._all);
  }
  return views;
}

/**
 * Recalculate rolling-window trending scores for one shop.
 * Signals: recent order volume, product_view events, sales velocity.
 */
export async function computeTrendingScoresForShop(
  shopId: string,
  shopDomain: string,
): Promise<{ scored: number; topScore: number }> {
  const windowHours = getTrendingWindowHours();
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - windowHours * 60 * 60 * 1000);
  const windowDays = Math.max(windowHours / 24, 1 / 24);
  const weights = getTrendingSignalWeights();

  const products = await db.product.findMany({
    where: {
      shopId,
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

  if (products.length === 0) {
    await db.trendingScore.deleteMany({ where: { shopId } });
    await cacheTrendingList(shopId, []);
    await cacheBestSellersList(shopId, []);
    return { scored: 0, topScore: 0 };
  }

  const shopifyIdToProductId = new Map(
    products.map((product) => [product.shopifyProductId, product.id]),
  );
  const productById = new Map(products.map((product) => [product.id, product]));

  const [orderVolumes, viewCounts] = await Promise.all([
    collectOrderVolumes(shopId, windowStart, shopifyIdToProductId),
    collectViewCounts(shopId, windowStart),
  ]);

  const signalInputs: ProductSignalInput[] = products.map((product) => {
    const orderVolume = orderVolumes.get(product.id) ?? 0;
    const viewCount = viewCounts.get(product.id) ?? 0;
    return {
      productId: product.id,
      orderVolume,
      viewCount,
      salesVelocity: orderVolume / windowDays,
    };
  });

  const scored = computeTrendingScores(signalInputs, weights);

  // When catalog has no order/view signal yet, give every active product a
  // uniform baseline so cold-start stores still get non-empty rankings.
  const hasAnySignal = scored.some(
    (item) => item.orderVolume > 0 || item.viewCount > 0,
  );
  const finalScores = hasAnySignal
    ? scored
    : scored.map((item, index) => ({
        ...item,
        score: 1 / (index + 1),
      }));

  await db.$transaction([
    db.trendingScore.deleteMany({ where: { shopId } }),
    db.trendingScore.createMany({
      data: finalScores.map((item) => ({
        shopId,
        productId: item.productId,
        score: item.score,
        orderVolume: item.orderVolume,
        viewCount: item.viewCount,
        salesVelocity: item.salesVelocity,
        windowStart,
        windowEnd,
        computedAt: windowEnd,
      })),
    }),
  ]);

  const trendingItems: RecommendationItem[] = [];
  const bestSellerItems: RecommendationItem[] = [];

  for (const item of finalScores) {
    const product = productById.get(item.productId);
    if (!product) continue;
    trendingItems.push(toRecommendationItem(product, item.score, "trending"));
  }

  const byOrderVolume = [...finalScores].sort((a, b) => {
    if (b.orderVolume !== a.orderVolume) return b.orderVolume - a.orderVolume;
    return b.score - a.score;
  });

  for (const item of byOrderVolume) {
    const product = productById.get(item.productId);
    if (!product) continue;
    const score = item.orderVolume > 0 ? item.orderVolume : item.score;
    bestSellerItems.push(toRecommendationItem(product, score, "best_sellers"));
  }

  await cacheTrendingList(shopId, trendingItems);
  await cacheBestSellersList(shopId, bestSellerItems);

  logSyncEvent({
    event: "trending_scores_computed",
    shop: shopDomain,
    shopId,
    scored: finalScores.length,
    windowHours,
    hasAnySignal,
    topScore: finalScores[0]?.score ?? 0,
  });

  return {
    scored: finalScores.length,
    topScore: finalScores[0]?.score ?? 0,
  };
}

/** Recalculate trending scores for every active shop. */
export async function runTrendingScoreJob() {
  const activeShops = await db.shop.findMany({
    where: { status: "active" },
    select: { id: true, shopifyDomain: true },
  });

  logSyncEvent({
    event: "trending_job_started",
    shopCount: activeShops.length,
  });

  let shopsProcessed = 0;
  let productsScored = 0;

  for (const shop of activeShops) {
    try {
      const result = await computeTrendingScoresForShop(shop.id, shop.shopifyDomain);
      shopsProcessed++;
      productsScored += result.scored;
    } catch (error) {
      logSyncEvent({
        event: "trending_job_shop_failed",
        shop: shop.shopifyDomain,
        shopId: shop.id,
        error: error instanceof Error ? error.message : "Unknown error",
        level: "error",
      });
    }
  }

  logSyncEvent({
    event: "trending_job_completed",
    shopCount: activeShops.length,
    shopsProcessed,
    productsScored,
  });

  return { shopCount: activeShops.length, shopsProcessed, productsScored };
}
