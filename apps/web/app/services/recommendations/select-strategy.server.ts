import db from "../../db.server";
import {
  getColdStartOrderThreshold,
  getColdStartProductInteractionThreshold,
  getColdStartSessionEventThreshold,
} from "./config.server";
import type {
  StrategySelection,
  StrategySelectionContext,
} from "./types";

export async function countShopOrders(shopId: string): Promise<number> {
  return db.order.count({ where: { shopId } });
}

export async function countProductInteractions(
  shopId: string,
  productId: string,
): Promise<number> {
  const [eventCount, orderMentions] = await Promise.all([
    db.behavioralEvent.count({
      where: { shopId, productId },
    }),
    db.trendingScore.findUnique({
      where: { productId },
      select: { orderVolume: true },
    }),
  ]);

  return eventCount + Math.floor(orderMentions?.orderVolume ?? 0);
}

export async function countSessionEvents(
  shopId: string,
  sessionId: string,
): Promise<number> {
  return db.behavioralEvent.count({
    where: { shopId, sessionId },
  });
}

/**
 * Picks recommendation strategies from data-availability thresholds (FR-REC-04).
 *
 * - New store (< order threshold): content_similarity + trending
 * - New product (no/low interactions): content_similarity
 * - Anonymous shopper: trending + content based on current product view
 */
export function selectStrategies(
  context: StrategySelectionContext,
): StrategySelection {
  const orderThreshold = getColdStartOrderThreshold();
  const productThreshold = getColdStartProductInteractionThreshold();
  const sessionThreshold = getColdStartSessionEventThreshold();

  const orderCount = context.orderCount ?? 0;
  const productInteractions = context.productInteractionCount ?? 0;
  const sessionEvents = context.sessionEventCount ?? 0;
  const isAnonymous =
    !context.customerId && sessionEvents < sessionThreshold;

  if (context.requestedStrategy === "recently_viewed") {
    return {
      scenario: "none",
      strategies: ["recently_viewed"],
      reason: "Explicit recently_viewed strategy requested",
    };
  }

  // Placement / merchant strategy wins; CF & association still fall back inside runStrategy
  if (context.requestedStrategy) {
    return {
      scenario: "none",
      strategies: [context.requestedStrategy],
      reason: `Using requested strategy ${context.requestedStrategy}`,
    };
  }

  // New product: content similarity immediately (SRS 5.2)
  if (
    context.productId &&
    productInteractions < productThreshold
  ) {
    return {
      scenario: "new_product",
      strategies: ["content_similarity"],
      reason: `Product has ${productInteractions} interactions (< ${productThreshold})`,
    };
  }

  // New store: content + trending until order threshold
  if (orderCount < orderThreshold) {
    const strategies =
      context.productId
        ? (["content_similarity", "trending"] as const)
        : (["trending", "best_sellers"] as const);

    return {
      scenario: "new_store",
      strategies: [...strategies],
      reason: `Shop has ${orderCount} orders (< ${orderThreshold})`,
    };
  }

  // Anonymous / thin session: trending + content on current product
  if (isAnonymous) {
    const strategies = context.productId
      ? (["trending", "content_similarity"] as const)
      : (["trending", "best_sellers"] as const);

    return {
      scenario: "anonymous_shopper",
      strategies: [...strategies],
      reason: context.customerId
        ? `Session has ${sessionEvents} events (< ${sessionThreshold})`
        : "Anonymous shopper with thin session history",
    };
  }

  return {
    scenario: "none",
    strategies: ["trending"],
    reason: "Default trending strategy",
  };
}

/** Load live thresholds and select strategies for a request context. */
export async function selectStrategiesForRequest(
  context: Omit<
    StrategySelectionContext,
    "orderCount" | "productInteractionCount" | "sessionEventCount"
  > &
    Partial<
      Pick<
        StrategySelectionContext,
        "orderCount" | "productInteractionCount" | "sessionEventCount"
      >
    >,
): Promise<StrategySelection> {
  const [orderCount, productInteractionCount, sessionEventCount] =
    await Promise.all([
      context.orderCount != null
        ? Promise.resolve(context.orderCount)
        : countShopOrders(context.shopId),
      context.productId && context.productInteractionCount == null
        ? countProductInteractions(context.shopId, context.productId)
        : Promise.resolve(context.productInteractionCount ?? 0),
      context.sessionId && context.sessionEventCount == null
        ? countSessionEvents(context.shopId, context.sessionId)
        : Promise.resolve(context.sessionEventCount ?? 0),
    ]);

  return selectStrategies({
    ...context,
    orderCount,
    productInteractionCount,
    sessionEventCount,
  });
}
