/**
 * Sprint 9 acceptance test — trending scores + cold-start fallback.
 * Usage (from repo root): npm run test:sprint-9
 */
import { Prisma } from "@prisma/client";
import db from "../app/db.server";
import { EMBEDDING_MODEL_VERSION } from "../app/services/embeddings/constants.server";
import { vectorToLiteral } from "../app/services/embeddings/store.server";
import {
  getBestSellerRecommendations,
  getRecentlyViewedRecommendations,
  getRecommendationsWithColdStart,
  getTrendingRecommendations,
  selectStrategies,
} from "../app/services/recommendations/index.server";
import { computeTrendingScoresForShop } from "../app/services/recommendations/trending/compute.server";

const TEST_DOMAIN = "sprint9-test.myshopify.com";

function sampleVector(seed: number): number[] {
  return Array.from({ length: 384 }, (_, index) => Math.sin(seed + index * 0.05));
}

async function setupShopCatalog() {
  const shop = await db.shop.upsert({
    where: { shopifyDomain: TEST_DOMAIN },
    create: {
      shopifyDomain: TEST_DOMAIN,
      accessTokenEncrypted: "test:encrypted",
      status: "active",
    },
    update: { status: "active" },
  });

  await db.trendingScore.deleteMany({ where: { shopId: shop.id } });
  await db.behavioralEvent.deleteMany({ where: { shopId: shop.id } });
  await db.order.deleteMany({ where: { shopId: shop.id } });
  await db.productEmbedding.deleteMany({ where: { shopId: shop.id } });
  await db.product.deleteMany({ where: { shopId: shop.id } });

  const products = [];
  for (let i = 1; i <= 12; i++) {
    const product = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: `sprint9-${100 + i}`,
        title: `Sprint9 Product ${i}`,
        description: i <= 2 ? "Running shoes for athletes" : `Catalog item ${i}`,
        tags: i <= 2 ? ["running"] : ["general"],
        productType: i <= 2 ? "Footwear" : "Misc",
        status: "active",
        inventoryStatus: "in_stock",
      },
    });
    products.push(product);
  }

  const source = products[0];
  const similar = products[1];
  const sourceVector = sampleVector(3);
  const similarVector = sourceVector.map((value, index) =>
    index % 7 === 0 ? value + 0.02 : value,
  );

  for (const [productId, vector] of [
    [source.id, sourceVector],
    [similar.id, similarVector],
    ...products.slice(2).map((product, index) => [product.id, sampleVector(50 + index)] as const),
  ] as const) {
    await db.$executeRawUnsafe(
      `INSERT INTO product_embeddings (product_id, shop_id, embedding_vector, model_version, updated_at)
       VALUES ($1, $2, $3::vector, $4, NOW())
       ON CONFLICT (product_id) DO UPDATE
       SET embedding_vector = EXCLUDED.embedding_vector,
           model_version = EXCLUDED.model_version,
           updated_at = NOW()`,
      productId,
      shop.id,
      vectorToLiteral(vector as number[]),
      EMBEDDING_MODEL_VERSION,
    );
  }

  return { shop, products, source, similar };
}

async function seedOrdersAndViews(
  shopId: string,
  products: Array<{ id: string; shopifyProductId: string }>,
) {
  // Hot product: many units sold + views
  await db.order.create({
    data: {
      shopId,
      shopifyOrderId: "sprint9-order-1",
      totalPrice: new Prisma.Decimal("199.00"),
      lineItems: [
        {
          shopifyLineItemId: "1",
          shopifyProductId: products[2].shopifyProductId,
          shopifyVariantId: "v1",
          quantity: 8,
          price: "20.00",
          title: products[2].title,
        },
      ],
    },
  });

  await db.order.create({
    data: {
      shopId,
      shopifyOrderId: "sprint9-order-2",
      totalPrice: new Prisma.Decimal("49.00"),
      lineItems: [
        {
          shopifyLineItemId: "2",
          shopifyProductId: products[3].shopifyProductId,
          shopifyVariantId: "v2",
          quantity: 2,
          price: "24.50",
          title: products[3].title,
        },
      ],
    },
  });

  const sessionId = "sprint9-session-views";
  const now = Date.now();
  await db.behavioralEvent.createMany({
    data: [
      {
        shopId,
        sessionId,
        eventType: "product_view",
        productId: products[2].id,
        timestamp: new Date(now - 1000),
      },
      {
        shopId,
        sessionId,
        eventType: "product_view",
        productId: products[2].id,
        timestamp: new Date(now - 900),
      },
      {
        shopId,
        sessionId,
        eventType: "product_view",
        productId: products[4].id,
        timestamp: new Date(now - 800),
      },
      {
        shopId,
        sessionId: "sprint9-recently-viewed",
        eventType: "product_view",
        productId: products[5].id,
        timestamp: new Date(now - 300),
      },
      {
        shopId,
        sessionId: "sprint9-recently-viewed",
        eventType: "product_view",
        productId: products[6].id,
        timestamp: new Date(now - 200),
      },
      {
        shopId,
        sessionId: "sprint9-recently-viewed",
        eventType: "product_view",
        productId: products[5].id,
        timestamp: new Date(now - 100),
      },
      {
        shopId,
        sessionId: "sprint9-recently-viewed",
        eventType: "product_view",
        productId: products[7].id,
        timestamp: new Date(now),
      },
    ],
  });
}

async function testTrendingJob(
  shopId: string,
  hotProductId: string,
) {
  console.log("\n--- Test 1: Trending job ranked list ---");
  const result = await computeTrendingScoresForShop(shopId, TEST_DOMAIN);
  console.log("  Scored products:", result.scored);

  const trending = await getTrendingRecommendations({
    shopId,
    strategy: "trending",
    limit: 10,
  });

  console.log(
    "  Trending top-10:",
    trending.map((item, index) => ({
      rank: index + 1,
      title: item.title,
      score: Number(item.score.toFixed(4)),
    })),
  );

  if (trending.length === 0) {
    throw new Error("Trending job produced an empty ranked list");
  }

  if (trending[0].productId !== hotProductId) {
    throw new Error(
      `Expected hot product at rank 1, got ${trending[0].title}`,
    );
  }

  const bestSellers = await getBestSellerRecommendations({
    shopId,
    strategy: "trending",
    limit: 5,
  });
  if (bestSellers[0]?.productId !== hotProductId) {
    throw new Error("Best sellers did not surface the highest order-volume product");
  }
}

async function testNewStoreZeroOrders(shopId: string) {
  console.log("\n--- Test 2: New store with zero orders ---");

  await db.order.deleteMany({ where: { shopId } });
  await computeTrendingScoresForShop(shopId, TEST_DOMAIN);

  const selection = selectStrategies({
    shopId,
    orderCount: 0,
    productInteractionCount: 5,
    sessionEventCount: 0,
  });
  console.log("  Selection:", selection);

  if (selection.scenario !== "new_store" || !selection.strategies.includes("trending")) {
    throw new Error("Expected new_store → trending selection");
  }

  const { items } = await getRecommendationsWithColdStart({
    shopId,
    strategy: "trending",
    limit: 8,
  });

  console.log(
    "  Cold-start recommendations:",
    items.map((item) => item.title),
  );

  if (items.length === 0) {
    throw new Error("New store with zero orders returned empty recommendations");
  }
}

async function testNewProductContent(
  shopId: string,
  sourceProductId: string,
  similarProductId: string,
) {
  console.log("\n--- Test 3: New product → content similarity ---");

  const selection = selectStrategies({
    shopId,
    productId: sourceProductId,
    orderCount: 100,
    productInteractionCount: 0,
    sessionEventCount: 10,
    customerId: "cust-1",
  });

  console.log("  Selection:", selection);
  if (selection.scenario !== "new_product") {
    throw new Error("Expected new_product scenario");
  }

  const { items } = await getRecommendationsWithColdStart({
    shopId,
    strategy: "content_similarity",
    productId: sourceProductId,
    limit: 4,
  });

  console.log(
    "  Content recommendations:",
    items.map((item) => ({ title: item.title, score: Number(item.score.toFixed(4)) })),
  );

  if (!items.some((item) => item.productId === similarProductId)) {
    throw new Error("New product did not receive content-based neighbors");
  }
}

async function testRecentlyViewed(shopId: string, products: Array<{ id: string; title: string }>) {
  console.log("\n--- Test 4: Recently viewed session order ---");

  const items = await getRecentlyViewedRecommendations({
    shopId,
    strategy: "recently_viewed",
    sessionId: "sprint9-recently-viewed",
    limit: 5,
  });

  console.log(
    "  Recently viewed:",
    items.map((item) => item.title),
  );

  // Most recent unique order: product 7, then 5, then 6
  const expectedOrder = [products[7].id, products[5].id, products[6].id];
  const actualOrder = items.map((item) => item.productId);

  if (actualOrder.join(",") !== expectedOrder.join(",")) {
    throw new Error(
      `Recently viewed order mismatch. expected=${expectedOrder.join(",")} actual=${actualOrder.join(",")}`,
    );
  }
}

async function testConfigurableThresholds() {
  console.log("\n--- Test 5: Configurable cold-start thresholds ---");
  const previous = process.env.COLD_START_ORDER_THRESHOLD;
  process.env.COLD_START_ORDER_THRESHOLD = "10";

  try {
    const selection = selectStrategies({
      shopId: "shop",
      orderCount: 9,
      productInteractionCount: 5,
    });
    if (selection.scenario !== "new_store") {
      throw new Error("Threshold override COLD_START_ORDER_THRESHOLD=10 not applied");
    }
    console.log("  Override applied: order threshold 10 → new_store at 9 orders");
  } finally {
    if (previous === undefined) delete process.env.COLD_START_ORDER_THRESHOLD;
    else process.env.COLD_START_ORDER_THRESHOLD = previous;
  }
}

async function main() {
  const { shop, products, source, similar } = await setupShopCatalog();
  await seedOrdersAndViews(shop.id, products);

  await testTrendingJob(shop.id, products[2].id);
  await testNewStoreZeroOrders(shop.id);
  await testNewProductContent(shop.id, source.id, similar.id);
  await testRecentlyViewed(shop.id, products);
  await testConfigurableThresholds();

  console.log("\nSprint 9 acceptance tests passed.");
}

main()
  .catch((error) => {
    console.error("\nSprint 9 acceptance tests failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
