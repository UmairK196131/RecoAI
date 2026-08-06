/**
 * Sprint 10 acceptance test — CF + association rules.
 * Usage (from repo root): npm run test:sprint-10
 *
 * CLI triggers (dev):
 *   npx tsx apps/web/scripts/test-sprint-10.ts
 *   POST /api/cron/jobs?job=cf-full|cf-incremental|association-rules
 */
import { Prisma } from "@prisma/client";
import db from "../app/db.server";
import { EMBEDDING_MODEL_VERSION } from "../app/services/embeddings/constants.server";
import { vectorToLiteral } from "../app/services/embeddings/store.server";
import { computeAssociationRulesForShop } from "../app/services/recommendations/association/compute.server";
import { computeCollaborativeFilteringForShop } from "../app/services/recommendations/cf/compute.server";
import {
  getAssociationRuleRecommendations,
  getCollaborativeFilteringRecommendations,
  getRecommendationsWithColdStart,
} from "../app/services/recommendations/index.server";
import {
  MODEL_TYPE_ASSOCIATION_RULES,
  MODEL_TYPE_COLLABORATIVE_FILTERING,
} from "../app/services/recommendations/model-registry.server";
import { computeTrendingScoresForShop } from "../app/services/recommendations/trending/compute.server";

const TEST_DOMAIN = "sprint10-test.myshopify.com";

function sampleVector(seed: number): number[] {
  return Array.from({ length: 384 }, (_, index) => Math.sin(seed + index * 0.05));
}

async function setupShop() {
  const shop = await db.shop.upsert({
    where: { shopifyDomain: TEST_DOMAIN },
    create: {
      shopifyDomain: TEST_DOMAIN,
      accessTokenEncrypted: "test:encrypted",
      status: "active",
    },
    update: { status: "active" },
  });

  await db.coPurchaseScore.deleteMany({ where: { shopId: shop.id } });
  await db.associationRule.deleteMany({ where: { shopId: shop.id } });
  await db.modelRegistryEntry.deleteMany({ where: { shopId: shop.id } });
  await db.trendingScore.deleteMany({ where: { shopId: shop.id } });
  await db.behavioralEvent.deleteMany({ where: { shopId: shop.id } });
  await db.order.deleteMany({ where: { shopId: shop.id } });
  await db.productEmbedding.deleteMany({ where: { shopId: shop.id } });
  await db.product.deleteMany({ where: { shopId: shop.id } });

  const titles = [
    "Running Shoes",
    "Athletic Socks",
    "Shoe Cleaner",
    "Water Bottle",
    "Yoga Mat",
    "Resistance Bands",
  ];

  const products = [];
  for (let i = 0; i < titles.length; i++) {
    const product = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: `sprint10-${100 + i}`,
        title: titles[i],
        description: titles[i],
        tags: ["fitness"],
        status: "active",
        inventoryStatus: "in_stock",
      },
    });
    products.push(product);
  }

  // Embeddings so content fallback is non-empty
  const sourceVector = sampleVector(1);
  for (let i = 0; i < products.length; i++) {
    const vector =
      i === 1
        ? sourceVector.map((v, idx) => (idx % 5 === 0 ? v + 0.01 : v))
        : sampleVector(10 + i);
    await db.$executeRawUnsafe(
      `INSERT INTO product_embeddings (product_id, shop_id, embedding_vector, model_version, updated_at)
       VALUES ($1, $2, $3::vector, $4, NOW())
       ON CONFLICT (product_id) DO UPDATE
       SET embedding_vector = EXCLUDED.embedding_vector,
           model_version = EXCLUDED.model_version,
           updated_at = NOW()`,
      products[i].id,
      shop.id,
      vectorToLiteral(vector),
      EMBEDDING_MODEL_VERSION,
    );
  }

  return { shop, products };
}

/** Seed enough multi-item orders for CF + FBT (above default threshold of 50). */
async function seedOrders(
  shopId: string,
  products: Array<{ id: string; shopifyProductId: string; title: string }>,
) {
  const [shoes, socks, cleaner, bottle, mat, bands] = products;
  const patterns: Array<Array<{ product: typeof shoes; qty: number }>> = [
    // Strong co-purchase: shoes + socks + cleaner
    ...Array.from({ length: 25 }, () => [
      { product: shoes, qty: 1 },
      { product: socks, qty: 2 },
    ]),
    ...Array.from({ length: 15 }, () => [
      { product: shoes, qty: 1 },
      { product: socks, qty: 1 },
      { product: cleaner, qty: 1 },
    ]),
    ...Array.from({ length: 10 }, () => [
      { product: mat, qty: 1 },
      { product: bands, qty: 1 },
    ]),
    ...Array.from({ length: 5 }, () => [
      { product: bottle, qty: 1 },
      { product: mat, qty: 1 },
    ]),
  ];

  let orderIndex = 0;
  for (const lines of patterns) {
    orderIndex++;
    await db.order.create({
      data: {
        shopId,
        shopifyOrderId: `sprint10-order-${orderIndex}`,
        totalPrice: new Prisma.Decimal("99.00"),
        lineItems: lines.map((line, idx) => ({
          shopifyLineItemId: `${orderIndex}-${idx}`,
          shopifyProductId: line.product.shopifyProductId,
          shopifyVariantId: `v-${line.product.shopifyProductId}`,
          quantity: line.qty,
          price: "10.00",
          title: line.product.title,
        })),
      },
    });
  }

  return patterns.length;
}

async function testBelowThresholdFallback(
  shopId: string,
  productId: string,
) {
  console.log("\n--- Test 1: Below order threshold → content/trending fallback ---");
  const previous = process.env.CF_MIN_ORDER_THRESHOLD;
  process.env.CF_MIN_ORDER_THRESHOLD = "1000";

  try {
    await computeTrendingScoresForShop(shopId, TEST_DOMAIN);

    const cfDirect = await getCollaborativeFilteringRecommendations({
      shopId,
      strategy: "collaborative_filtering",
      productId,
      limit: 4,
    });
    if (cfDirect.length !== 0) {
      throw new Error("Expected empty CF result below threshold");
    }

    const { items } = await getRecommendationsWithColdStart({
      shopId,
      strategy: "collaborative_filtering",
      productId,
      limit: 4,
    });

    console.log(
      "  Fallback recommendations:",
      items.map((item) => ({ title: item.title, strategy: item.strategy })),
    );

    if (items.length === 0) {
      throw new Error("Below-threshold CF request returned empty results");
    }
  } finally {
    if (previous === undefined) delete process.env.CF_MIN_ORDER_THRESHOLD;
    else process.env.CF_MIN_ORDER_THRESHOLD = previous;
  }
}

async function testCfAndFbt(
  shopId: string,
  products: Array<{ id: string; title: string }>,
) {
  console.log("\n--- Test 2: CF co-purchase recommendations ---");
  process.env.CF_MIN_ORDER_THRESHOLD = "50";
  process.env.CF_MIN_CO_OCCURRENCE = "2";
  process.env.ASSOCIATION_MIN_SUPPORT = "0.05";
  process.env.ASSOCIATION_MIN_CONFIDENCE = "0.3";

  const cfTrain = await computeCollaborativeFilteringForShop(
    shopId,
    TEST_DOMAIN,
    "full",
  );
  console.log("  CF train:", cfTrain);

  if (cfTrain.skipped || cfTrain.pairs === 0) {
    throw new Error("CF training produced no pairs");
  }

  const shoes = products[0];
  const socks = products[1];

  const cfItems = await getCollaborativeFilteringRecommendations({
    shopId,
    strategy: "collaborative_filtering",
    productId: shoes.id,
    limit: 5,
  });

  console.log(
    "  Sample CF (Customers also bought) for Running Shoes:",
    cfItems.map((item) => ({
      title: item.title,
      score: Number(item.score.toFixed(4)),
    })),
  );

  if (!cfItems.some((item) => item.productId === socks.id)) {
    throw new Error("CF did not recommend Athletic Socks with Running Shoes");
  }

  console.log("\n--- Test 3: Association rules / FBT ---");
  const arTrain = await computeAssociationRulesForShop(shopId, TEST_DOMAIN);
  console.log("  Association train:", arTrain);

  if (arTrain.skipped || arTrain.rules === 0) {
    throw new Error("Association training produced no rules");
  }

  const fbtItems = await getAssociationRuleRecommendations({
    shopId,
    strategy: "association_rules",
    productId: shoes.id,
    limit: 5,
  });

  console.log(
    "  Sample FBT (Frequently bought together) for Running Shoes:",
    fbtItems.map((item) => ({
      title: item.title,
      score: Number(item.score.toFixed(4)),
    })),
  );

  if (fbtItems.length === 0) {
    throw new Error("FBT returned empty set for shoes");
  }

  const cfModel = await db.modelRegistryEntry.findFirst({
    where: {
      shopId,
      modelType: MODEL_TYPE_COLLABORATIVE_FILTERING,
      status: "active",
    },
  });
  const arModel = await db.modelRegistryEntry.findFirst({
    where: {
      shopId,
      modelType: MODEL_TYPE_ASSOCIATION_RULES,
      status: "active",
    },
  });

  console.log("\n--- Test 4: Model registry versions ---");
  console.log("  CF model:", cfModel?.version);
  console.log("  Association model:", arModel?.version);

  if (!cfModel || !arModel) {
    throw new Error("Model registry missing active CF or association entry");
  }

  // Incremental retrain smoke
  const incremental = await computeCollaborativeFilteringForShop(
    shopId,
    TEST_DOMAIN,
    "incremental",
  );
  console.log("  CF incremental:", incremental);
  if (incremental.skipped) {
    throw new Error("Unexpected skip on incremental CF retrain");
  }
}

async function main() {
  const { shop, products } = await setupShop();
  const orderCount = await seedOrders(shop.id, products);
  console.log(`Seeded ${orderCount} orders for ${TEST_DOMAIN}`);

  await testBelowThresholdFallback(shop.id, products[0].id);
  await testCfAndFbt(shop.id, products);

  console.log("\nSprint 10 acceptance tests passed.");
}

main()
  .catch((error) => {
    console.error("\nSprint 10 acceptance tests failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
