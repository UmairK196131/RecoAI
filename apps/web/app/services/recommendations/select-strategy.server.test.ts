import { afterEach, describe, expect, it } from "vitest";

import { selectStrategies } from "./select-strategy.server";

describe("selectStrategies", () => {
  const originalOrder = process.env.COLD_START_ORDER_THRESHOLD;
  const originalProduct = process.env.COLD_START_PRODUCT_INTERACTION_THRESHOLD;
  const originalSession = process.env.COLD_START_SESSION_EVENT_THRESHOLD;

  afterEach(() => {
    if (originalOrder === undefined) delete process.env.COLD_START_ORDER_THRESHOLD;
    else process.env.COLD_START_ORDER_THRESHOLD = originalOrder;

    if (originalProduct === undefined) {
      delete process.env.COLD_START_PRODUCT_INTERACTION_THRESHOLD;
    } else {
      process.env.COLD_START_PRODUCT_INTERACTION_THRESHOLD = originalProduct;
    }

    if (originalSession === undefined) {
      delete process.env.COLD_START_SESSION_EVENT_THRESHOLD;
    } else {
      process.env.COLD_START_SESSION_EVENT_THRESHOLD = originalSession;
    }
  });

  it("selects content_similarity for a new product", () => {
    process.env.COLD_START_PRODUCT_INTERACTION_THRESHOLD = "1";
    process.env.COLD_START_ORDER_THRESHOLD = "50";

    const selection = selectStrategies({
      shopId: "shop",
      productId: "p1",
      orderCount: 200,
      productInteractionCount: 0,
      sessionEventCount: 10,
      customerId: "cust",
    });

    expect(selection.scenario).toBe("new_product");
    expect(selection.strategies).toEqual(["content_similarity"]);
  });

  it("selects content + trending for a new store with a product context", () => {
    process.env.COLD_START_ORDER_THRESHOLD = "50";
    process.env.COLD_START_PRODUCT_INTERACTION_THRESHOLD = "1";

    const selection = selectStrategies({
      shopId: "shop",
      productId: "p1",
      orderCount: 0,
      productInteractionCount: 5,
      sessionEventCount: 0,
    });

    expect(selection.scenario).toBe("new_store");
    expect(selection.strategies).toEqual(["content_similarity", "trending"]);
  });

  it("selects trending for a new store with zero orders and no product", () => {
    process.env.COLD_START_ORDER_THRESHOLD = "50";

    const selection = selectStrategies({
      shopId: "shop",
      orderCount: 0,
      productInteractionCount: 0,
      sessionEventCount: 0,
    });

    expect(selection.scenario).toBe("new_store");
    expect(selection.strategies).toContain("trending");
  });

  it("selects trending + content for anonymous shoppers", () => {
    process.env.COLD_START_ORDER_THRESHOLD = "50";
    process.env.COLD_START_SESSION_EVENT_THRESHOLD = "3";
    process.env.COLD_START_PRODUCT_INTERACTION_THRESHOLD = "1";

    const selection = selectStrategies({
      shopId: "shop",
      productId: "p1",
      orderCount: 100,
      productInteractionCount: 20,
      sessionEventCount: 0,
    });

    expect(selection.scenario).toBe("anonymous_shopper");
    expect(selection.strategies).toEqual(["trending", "content_similarity"]);
  });

  it("honors explicit recently_viewed requests", () => {
    const selection = selectStrategies({
      shopId: "shop",
      requestedStrategy: "recently_viewed",
      orderCount: 0,
    });

    expect(selection.strategies).toEqual(["recently_viewed"]);
  });

  it("honors placement strategy override over cold-start heuristics", () => {
    process.env.COLD_START_ORDER_THRESHOLD = "50";
    process.env.COLD_START_PRODUCT_INTERACTION_THRESHOLD = "1";

    const selection = selectStrategies({
      shopId: "shop",
      productId: "p1",
      orderCount: 0,
      productInteractionCount: 0,
      requestedStrategy: "association_rules",
    });

    expect(selection.strategies).toEqual(["association_rules"]);
  });
});
