/**
 * Sprint 7 acceptance test — runs against local Postgres.
 * Usage (from repo root): npm run test:sprint-7
 */
import db from "../app/db.server";
import { ingestBehavioralEvents } from "../app/services/events/ingest.server";

const TEST_DOMAIN = "sprint7-test.myshopify.com";
const OTHER_DOMAIN = "other-shop.myshopify.com";

async function setupShop(domain: string) {
  return db.shop.upsert({
    where: { shopifyDomain: domain },
    create: {
      shopifyDomain: domain,
      accessTokenEncrypted: "test:encrypted",
      status: "active",
    },
    update: { status: "active", purgeScheduledAt: null, uninstalledAt: null },
  });
}

async function setupProduct(shopId: string) {
  return db.product.upsert({
    where: {
      shopId_shopifyProductId: { shopId, shopifyProductId: "1001" },
    },
    create: {
      shopId,
      shopifyProductId: "1001",
      title: "Sprint 7 Test Product",
    },
    update: { title: "Sprint 7 Test Product" },
  });
}

async function testBatchIngestion(shopId: string, productId: string) {
  console.log("\n--- Test 1: Batch event ingestion ---");

  const sessionId = "sess-sprint7-001";
  const result = await ingestBehavioralEvents({
    shop: TEST_DOMAIN,
    events: [
      {
        eventType: "product_view",
        sessionId,
        timestamp: new Date().toISOString(),
        metadata: { productId: "1001" },
      },
      {
        eventType: "search",
        sessionId,
        metadata: { query: "shoes" },
      },
    ],
  });

  console.log("  Result:", JSON.stringify(result));

  if (!result.ok || result.inserted !== 2) {
    throw new Error("Batch ingestion failed");
  }

  const events = await db.behavioralEvent.findMany({
    where: { shopId, sessionId },
    orderBy: { timestamp: "asc" },
  });

  console.log("  Events in DB:", events.length);
  console.log("  Product linked:", events[0]?.productId === productId);

  if (events.length !== 2 || events[0]?.productId !== productId) {
    throw new Error("Events not stored with correct shop_id / product resolution");
  }

  console.log("  PASS");
}

async function testCrossShopRejection() {
  console.log("\n--- Test 2: Cross-shop injection rejected ---");

  const result = await ingestBehavioralEvents({
    shop: TEST_DOMAIN,
    events: [
      {
        eventType: "product_view",
        sessionId: "sess-cross-shop",
        shop: OTHER_DOMAIN,
        metadata: {},
      },
    ],
  });

  console.log("  Result:", JSON.stringify(result));

  if (result.ok || result.error !== "cross_shop_injection") {
    throw new Error("Cross-shop injection was not rejected");
  }

  console.log("  PASS");
}

async function testUnknownShop() {
  console.log("\n--- Test 3: Unknown shop rejected ---");

  const result = await ingestBehavioralEvents({
    shop: "unknown-shop.myshopify.com",
    events: [
      {
        eventType: "product_view",
        sessionId: "sess-unknown",
        metadata: {},
      },
    ],
  });

  console.log("  Result:", JSON.stringify(result));

  if (result.ok || result.error !== "shop_not_found") {
    throw new Error("Unknown shop was not rejected");
  }

  console.log("  PASS");
}

async function testRecommendationEventTypes(shopId: string) {
  console.log("\n--- Test 4: Recommendation event types ---");

  const sessionId = "sess-reco-events";
  const result = await ingestBehavioralEvents({
    shop: TEST_DOMAIN,
    events: [
      {
        eventType: "recommendation_impression",
        sessionId,
        metadata: { placementId: "test-placement" },
      },
      {
        eventType: "recommendation_click",
        sessionId,
        metadata: { placementId: "test-placement", productId: "1001" },
      },
    ],
  });

  console.log("  Result:", JSON.stringify(result));

  const events = await db.behavioralEvent.findMany({
    where: { shopId, sessionId },
  });

  console.log("  Events in DB:", events.map((e) => e.eventType).join(", "));

  if (!result.ok || events.length !== 2) {
    throw new Error("Recommendation event types not ingested");
  }

  console.log("  PASS");
}

async function cleanup(shopId: string, otherShopId: string) {
  await db.shop.delete({ where: { id: shopId } }).catch(() => undefined);
  await db.shop.delete({ where: { id: otherShopId } }).catch(() => undefined);
}

async function main() {
  console.log("Sprint 7 acceptance tests");
  const shop = await setupShop(TEST_DOMAIN);
  const otherShop = await setupShop(OTHER_DOMAIN);
  const product = await setupProduct(shop.id);

  try {
    await testBatchIngestion(shop.id, product.id);
    await testCrossShopRejection();
    await testUnknownShop();
    await testRecommendationEventTypes(shop.id);
    console.log("\nAll Sprint 7 tests passed.");
  } finally {
    await cleanup(shop.id, otherShop.id);
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
