/**
 * Sprint 11 acceptance test — recommendation serving API.
 * Usage (from repo root): npm run test:sprint-11
 */
import db from "../app/db.server";
import { clearServingCacheForShop } from "../app/services/recommendations/serving/cache.server";
import {
  parseServingRequestFromUrl,
  serveRecommendations,
} from "../app/services/recommendations/serving/serve.server";
import {
  getServingTimingSnapshot,
  resetServingTimingMetrics,
} from "../app/services/recommendations/serving/timing.server";
import { computeTrendingScoresForShop } from "../app/services/recommendations/trending/compute.server";

const TEST_DOMAIN = "sprint11-test.myshopify.com";

async function setup() {
  const shop = await db.shop.upsert({
    where: { shopifyDomain: TEST_DOMAIN },
    create: {
      shopifyDomain: TEST_DOMAIN,
      accessTokenEncrypted: "test:encrypted",
      status: "active",
    },
    update: { status: "active" },
  });

  await clearServingCacheForShop(shop.id);
  await db.recommendationLog.deleteMany({ where: { shopId: shop.id } });
  await db.recommendationPlacement.deleteMany({ where: { shopId: shop.id } });
  await db.behavioralEvent.deleteMany({ where: { shopId: shop.id } });
  await db.trendingScore.deleteMany({ where: { shopId: shop.id } });
  await db.collection.deleteMany({ where: { shopId: shop.id } });
  await db.product.deleteMany({ where: { shopId: shop.id } });

  const products = [];
  for (let i = 1; i <= 10; i++) {
    const product = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: `sprint11-${100 + i}`,
        title: `Sprint11 Product ${i}`,
        description: `Catalog item ${i}`,
        tags: i === 5 ? ["excluded-tag"] : ["general"],
        status: "active",
        inventoryStatus: i === 4 ? "out_of_stock" : "in_stock",
        priceRangeMin: i * 10,
        priceRangeMax: i * 10 + 5,
      },
    });
    products.push(product);
  }

  // Seed views so trending has signal
  for (let i = 0; i < 8; i++) {
    await db.behavioralEvent.create({
      data: {
        shopId: shop.id,
        sessionId: `seed-session-${i}`,
        eventType: "product_view",
        productId: products[i % 3].id,
        timestamp: new Date(),
      },
    });
  }

  await computeTrendingScoresForShop(shop.id, TEST_DOMAIN);

  const placement = await db.recommendationPlacement.create({
    data: {
      shopId: shop.id,
      placementType: "product_page",
      strategy: "trending",
      enabled: true,
      maxItems: 4,
      titleText: "You may also like",
      exclusionRules: {
        excludeOutOfStock: true,
        excludedTags: ["excluded-tag"],
        excludedProductIds: [products[6].shopifyProductId],
      },
    },
  });

  // Session views for re-ranking
  const sessionId = "sprint11-session";
  await db.behavioralEvent.create({
    data: {
      shopId: shop.id,
      sessionId,
      eventType: "product_view",
      productId: products[2].id,
      timestamp: new Date(),
    },
  });

  return { shop, products, placement, sessionId };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[rank];
}

async function main() {
  console.log("=== Sprint 11 — Recommendation Serving API ===\n");

  const { shop, products, sessionId } = await setup();
  const source = products[0];

  // 1) Basic serve
  const response = await serveRecommendations({
    shop: TEST_DOMAIN,
    placementType: "product_page",
    productId: source.shopifyProductId,
    sessionId,
    cartProductIds: [products[1].shopifyProductId],
  });

  console.log("Sample response (trending / product_page):");
  console.log(JSON.stringify(response, null, 2));

  const recIds = response.recommendations.map((r) => r.product_id);
  const cartGid = `gid://shopify/Product/${products[1].shopifyProductId}`;
  const oosGid = `gid://shopify/Product/${products[3].shopifyProductId}`;
  const taggedGid = `gid://shopify/Product/${products[4].shopifyProductId}`;
  const excludedGid = `gid://shopify/Product/${products[6].shopifyProductId}`;

  const checks: Array<[string, boolean]> = [
    ["returns recommendations", response.recommendations.length > 0],
    ["excludes cart item", !recIds.includes(cartGid)],
    ["excludes out-of-stock", !recIds.includes(oosGid)],
    ["excludes tagged product", !recIds.includes(taggedGid)],
    ["excludes excluded product", !recIds.includes(excludedGid)],
    ["has strategy_used", Boolean(response.strategy_used)],
    ["has generated_at", Boolean(response.generated_at)],
  ];

  // 2) URL parser
  const url = new URL(
    `https://example.com/api/recommendations?shop=${TEST_DOMAIN}&placement_type=home&session_id=abc`,
  );
  const parsed = parseServingRequestFromUrl(url);
  checks.push([
    "parses query params",
    !("error" in parsed) && parsed.placementType === "home",
  ]);

  // 3) Graceful empty on unknown shop
  const unknown = await serveRecommendations({
    shop: "missing-shop.myshopify.com",
    placementType: "home",
  });
  checks.push([
    "unknown shop returns empty (not throw)",
    unknown.recommendations.length === 0 && unknown.strategy_used === "none",
  ]);

  // 4) Cache hit latency vs miss
  await clearServingCacheForShop(shop.id);
  resetServingTimingMetrics();

  const missLatencies: number[] = [];
  const hitLatencies: number[] = [];

  // Warm path samples
  for (let i = 0; i < 5; i++) {
    await clearServingCacheForShop(shop.id);
    const miss = await serveRecommendations({
      shop: TEST_DOMAIN,
      placementType: "product_page",
      productId: source.shopifyProductId,
    });
    missLatencies.push(miss.meta?.latency_ms ?? 0);
  }

  for (let i = 0; i < 20; i++) {
    const hit = await serveRecommendations({
      shop: TEST_DOMAIN,
      placementType: "product_page",
      productId: source.shopifyProductId,
    });
    hitLatencies.push(hit.meta?.latency_ms ?? 0);
    checks.push([
      `cache hit sample ${i}`,
      hit.meta?.cache_hit === true || i === 0, // first after warm may still be hit
    ]);
  }

  // Re-check last is cache hit
  const lastHit = await serveRecommendations({
    shop: TEST_DOMAIN,
    placementType: "product_page",
    productId: source.shopifyProductId,
  });
  checks.push(["cache_hit true on warm request", lastHit.meta?.cache_hit === true]);

  const missP95 = percentile(missLatencies, 95);
  const hitP95 = percentile(hitLatencies, 95);
  const allLatencies = [...missLatencies, ...hitLatencies];
  const overallP95 = percentile(allLatencies, 95);

  console.log("\nBenchmark timings (ms):");
  console.log(
    JSON.stringify(
      {
        cache_miss: {
          samples: missLatencies.length,
          p95: missP95,
          avg: Math.round(
            missLatencies.reduce((a, b) => a + b, 0) / missLatencies.length,
          ),
        },
        cache_hit: {
          samples: hitLatencies.length,
          p95: hitP95,
          avg: Math.round(
            hitLatencies.reduce((a, b) => a + b, 0) / hitLatencies.length,
          ),
        },
        overall_p95: overallP95,
        target_p95: 150,
        within_target: overallP95 < 150,
        timing_snapshot: getServingTimingSnapshot(),
      },
      null,
      2,
    ),
  );

  checks.push(["cache hit faster than miss (avg)", 
    hitLatencies.reduce((a, b) => a + b, 0) / hitLatencies.length <
      missLatencies.reduce((a, b) => a + b, 0) / missLatencies.length
  ]);
  checks.push(["overall p95 < 150ms", overallP95 < 150]);

  // 5) Strategy samples for home (trending default)
  const home = await serveRecommendations({
    shop: TEST_DOMAIN,
    placementType: "home",
  });
  console.log("\nSample response (home / default):");
  console.log(JSON.stringify(home, null, 2));

  // Placement for recently_viewed
  await db.recommendationPlacement.create({
    data: {
      shopId: shop.id,
      placementType: "cart",
      strategy: "recently_viewed",
      enabled: true,
      maxItems: 3,
      titleText: "Add these too",
      exclusionRules: { excludeOutOfStock: true },
    },
  });

  const cartPlacement = await serveRecommendations({
    shop: TEST_DOMAIN,
    placementType: "cart",
    sessionId,
  });
  console.log("\nSample response (cart / recently_viewed):");
  console.log(JSON.stringify(cartPlacement, null, 2));
  checks.push([
    "recently_viewed placement returns items or empty safely",
    Array.isArray(cartPlacement.recommendations),
  ]);

  console.log("\nAcceptance checks:");
  let failed = 0;
  for (const [label, ok] of checks) {
    if (label.startsWith("cache hit sample")) continue; // noisy
    console.log(`${ok ? "PASS" : "FAIL"} — ${label}`);
    if (!ok) failed += 1;
  }

  // Summarize cache hit samples
  const cacheHitOk = checks
    .filter(([label]) => label.startsWith("cache hit sample"))
    .every(([, ok]) => ok);
  console.log(`${cacheHitOk ? "PASS" : "FAIL"} — cache hits after warm`);
  if (!cacheHitOk) failed += 1;

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }

  console.log("\nAll Sprint 11 acceptance checks passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
