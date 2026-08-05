/**
 * Sprint 5 acceptance test — runs against local Postgres.
 * Usage (from repo root): npm run test:sprint-5
 */
import db from "../app/db.server";
import { upsertOrderFromRestPayload } from "../app/services/sync/order-sync.server";
import { handleCustomerRedact } from "../app/services/sync/gdpr.server";
import { runScheduledShopPurge } from "../app/services/sync/purge.server";
import { runNightlyReconciliation } from "../app/services/sync/reconciliation.server";
import { BehavioralEventType } from "@prisma/client";

const TEST_DOMAIN = "sprint5-test.myshopify.com";
const SHOPIFY_CUSTOMER_ID = "9001";
const SHOPIFY_ORDER_ID = "5001";

async function setupShop() {
  return db.shop.upsert({
    where: { shopifyDomain: TEST_DOMAIN },
    create: {
      shopifyDomain: TEST_DOMAIN,
      accessTokenEncrypted: "test:encrypted",
      status: "active",
    },
    update: { status: "active", purgeScheduledAt: null, uninstalledAt: null },
  });
}

async function testOrderUpsert(shopId: string) {
  console.log("\n--- Test 1: Order upsert with line items ---");

  const order = await upsertOrderFromRestPayload(
    shopId,
    {
      id: SHOPIFY_ORDER_ID,
      customer: { id: SHOPIFY_CUSTOMER_ID },
      total_price: "59.98",
      created_at: new Date().toISOString(),
      line_items: [
        {
          id: 1,
          product_id: 1001,
          variant_id: 2001,
          quantity: 2,
          price: "29.99",
          title: "Test Widget",
        },
      ],
    },
    TEST_DOMAIN,
  );

  const shop = await db.shop.findUnique({ where: { id: shopId } });
  const lineItems = order.lineItems as Array<{ title: string; quantity: number }>;

  console.log("  Order ID:", order.id);
  console.log("  Line items:", JSON.stringify(lineItems));
  console.log("  last_order_sync:", shop?.lastOrderSyncAt?.toISOString() ?? null);

  if (lineItems.length !== 1 || lineItems[0].title !== "Test Widget") {
    throw new Error("Order line items not saved correctly");
  }
  if (!shop?.lastOrderSyncAt) {
    throw new Error("last_order_sync was not updated");
  }

  // Idempotency: run again, should not duplicate
  const beforeCount = await db.order.count({ where: { shopId } });
  await upsertOrderFromRestPayload(
    shopId,
    {
      id: SHOPIFY_ORDER_ID,
      customer: { id: SHOPIFY_CUSTOMER_ID },
      total_price: "59.98",
      line_items: order.lineItems as never,
    },
    TEST_DOMAIN,
  );
  const afterCount = await db.order.count({ where: { shopId } });
  if (beforeCount !== afterCount) {
    throw new Error("Order upsert is not idempotent");
  }

  console.log("  PASS");
}

async function testGdprRedact(shopId: string) {
  console.log("\n--- Test 2: GDPR customer redact ---");

  const customer = await db.customer.findFirst({
    where: { shopId, shopifyCustomerId: SHOPIFY_CUSTOMER_ID },
  });
  if (!customer) throw new Error("Customer not found from order sync");

  await db.behavioralEvent.create({
    data: {
      shopId,
      customerId: customer.id,
      sessionId: "sess-test-001",
      eventType: BehavioralEventType.product_view,
      metadata: {},
    },
  });

  const eventsBefore = await db.behavioralEvent.count({
    where: { shopId, customerId: customer.id },
  });
  console.log("  Events before redact:", eventsBefore);

  const result = await handleCustomerRedact(shopId, TEST_DOMAIN, {
    shop_domain: TEST_DOMAIN,
    customer: { id: SHOPIFY_CUSTOMER_ID },
    orders_to_redact: [SHOPIFY_ORDER_ID],
  });

  const eventsAfter = await db.behavioralEvent.count({
    where: { shopId, customerId: customer.id },
  });
  const redactedCustomer = await db.customer.findUnique({ where: { id: customer.id } });

  console.log("  Redacted:", result.redacted);
  console.log("  Events after redact:", eventsAfter);
  console.log("  Customer shopifyCustomerId:", redactedCustomer?.shopifyCustomerId ?? null);

  if (!result.redacted || eventsAfter !== 0) {
    throw new Error("GDPR redact did not delete behavioral events");
  }
  if (redactedCustomer?.shopifyCustomerId !== null) {
    throw new Error("Customer PII was not anonymized");
  }

  console.log("  PASS");
}

async function testNightlyReconciliation(shopId: string) {
  console.log("\n--- Test 3: Nightly reconciliation ---");

  const result = await runNightlyReconciliation();
  const shop = await db.shop.findUnique({ where: { id: shopId } });

  console.log("  Shops enqueued:", result.enqueuedCount);
  console.log("  last_reconciliation:", shop?.lastReconciliationAt?.toISOString() ?? null);

  if (!shop?.lastReconciliationAt) {
    throw new Error("last_reconciliation was not updated");
  }

  console.log("  PASS");
}

async function testShopPurge() {
  console.log("\n--- Test 4: Uninstalled shop purge ---");

  const purgeShop = await db.shop.create({
    data: {
      shopifyDomain: "purge-test.myshopify.com",
      accessTokenEncrypted: "",
      status: "uninstalled",
      uninstalledAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
      purgeScheduledAt: new Date(Date.now() - 60 * 60 * 1000),
    },
  });

  const result = await runScheduledShopPurge();
  const stillExists = await db.shop.findUnique({ where: { id: purgeShop.id } });

  console.log("  Purged count:", result.purgedCount);
  console.log("  Shop still exists:", stillExists !== null);

  if (stillExists) {
    throw new Error("Purge job did not delete uninstalled shop");
  }

  console.log("  PASS");
}

async function cleanup(shopId: string) {
  await db.shop.delete({ where: { id: shopId } }).catch(() => undefined);
}

async function main() {
  console.log("Sprint 5 acceptance tests");
  const shop = await setupShop();

  try {
    await testOrderUpsert(shop.id);
    await testGdprRedact(shop.id);
    await testNightlyReconciliation(shop.id);
    await testShopPurge();
    console.log("\nAll Sprint 5 tests passed.");
  } finally {
    await cleanup(shop.id);
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
