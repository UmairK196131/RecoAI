/**
 * Sprint 8 acceptance test — runs against local Postgres.
 * Usage (from repo root): npm run test:sprint-8
 */
import db from "../app/db.server";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_VERSION } from "../app/services/embeddings/constants.server";
import { generateAndStoreProductEmbedding } from "../app/services/embeddings/generate.server";
import { findSimilarProducts } from "../app/services/embeddings/similarity.server";
import { getContentSimilarityRecommendations } from "../app/services/recommendations/strategies/content-similarity.server";
import { buildProductEmbeddingText } from "../app/services/embeddings/text.server";
import { vectorToLiteral } from "../app/services/embeddings/store.server";

const TEST_DOMAIN = "sprint8-test.myshopify.com";

function sampleVector(seed: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) =>
    Math.sin(seed + index * 0.05),
  );
}

async function setupShopAndProducts() {
  const shop = await db.shop.upsert({
    where: { shopifyDomain: TEST_DOMAIN },
    create: {
      shopifyDomain: TEST_DOMAIN,
      accessTokenEncrypted: "test:encrypted",
      status: "active",
    },
    update: { status: "active" },
  });

  const source = await db.product.upsert({
    where: {
      shopId_shopifyProductId: {
        shopId: shop.id,
        shopifyProductId: "sprint8-100",
      },
    },
    create: {
      shopId: shop.id,
      shopifyProductId: "sprint8-100",
      title: "Trail Running Shoes",
      description: "Lightweight shoes for trail runners",
      tags: ["running", "outdoor"],
      productType: "Footwear",
      status: "active",
      inventoryStatus: "in_stock",
    },
    update: {
      title: "Trail Running Shoes",
      description: "Lightweight shoes for trail runners",
      tags: ["running", "outdoor"],
      productType: "Footwear",
      status: "active",
      inventoryStatus: "in_stock",
    },
  });

  const similar = await db.product.upsert({
    where: {
      shopId_shopifyProductId: {
        shopId: shop.id,
        shopifyProductId: "sprint8-101",
      },
    },
    create: {
      shopId: shop.id,
      shopifyProductId: "sprint8-101",
      title: "Road Running Shoes",
      description: "Cushioned shoes for daily runs",
      tags: ["running"],
      productType: "Footwear",
      status: "active",
      inventoryStatus: "in_stock",
    },
    update: {
      status: "active",
      inventoryStatus: "in_stock",
    },
  });

  const unrelated = await db.product.upsert({
    where: {
      shopId_shopifyProductId: {
        shopId: shop.id,
        shopifyProductId: "sprint8-102",
      },
    },
    create: {
      shopId: shop.id,
      shopifyProductId: "sprint8-102",
      title: "Stainless Water Bottle",
      description: "Insulated bottle",
      tags: ["kitchen"],
      productType: "Home",
      status: "active",
      inventoryStatus: "in_stock",
    },
    update: {
      status: "active",
      inventoryStatus: "in_stock",
    },
  });

  const sourceVector = sampleVector(3);
  const similarVector = sourceVector.map((value, index) =>
    index % 7 === 0 ? value + 0.02 : value,
  );

  for (const [productId, vector] of [
    [source.id, sourceVector],
    [similar.id, similarVector],
    [unrelated.id, sampleVector(42)],
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
      vectorToLiteral(vector),
      EMBEDDING_MODEL_VERSION,
    );
  }

  return { shop, source, similar, unrelated };
}

async function testEmbeddingText() {
  console.log("\n--- Test 1: Product embedding text ---");
  const text = buildProductEmbeddingText({
    title: "Trail Running Shoes",
    description: "Lightweight shoes",
    tags: ["running"],
    productType: "Footwear",
  });

  if (!text.includes("Trail Running Shoes") || !text.includes("Footwear")) {
    throw new Error("Embedding text builder failed");
  }

  console.log("  Text:", text);
}

async function testSimilarityQuery(
  shopId: string,
  sourceProductId: string,
  similarProductId: string,
) {
  console.log("\n--- Test 2: pgvector similarity query ---");

  const startedAt = performance.now();
  const similar = await findSimilarProducts({
    shopId,
    productId: sourceProductId,
    limit: 4,
  });
  const elapsedMs = performance.now() - startedAt;

  console.log("  Query time (ms):", elapsedMs.toFixed(2));
  console.log(
    "  Results:",
    similar.map((item) => ({
      title: item.title,
      similarity: Number(item.similarity.toFixed(4)),
    })),
  );

  if (similar.length === 0) {
    throw new Error("Similarity query returned no results");
  }

  if (similar[0].productId !== similarProductId) {
    throw new Error("Expected nearest neighbor to be the similar running shoe");
  }

  if (elapsedMs > 50) {
    console.warn("  Warning: similarity query exceeded 50ms target");
  }
}

async function testContentSimilarityStrategy(
  shopId: string,
  sourceProductId: string,
  similarProductId: string,
) {
  console.log("\n--- Test 3: content_similarity strategy ---");

  const recommendations = await getContentSimilarityRecommendations({
    shopId,
    strategy: "content_similarity",
    productId: sourceProductId,
    limit: 3,
  });

  console.log(
    "  Recommendations:",
    recommendations.map((item) => ({
      title: item.title,
      score: Number(item.score.toFixed(4)),
    })),
  );

  if (!recommendations.some((item) => item.productId === similarProductId)) {
    throw new Error("content_similarity strategy did not return the similar product");
  }
}

async function testLiveEmbeddingGeneration(shopId: string, productId: string) {
  if (process.env.SPRINT8_SKIP_MODEL === "1") {
    console.log("\n--- Test 4: Live embedding generation (skipped) ---");
    return;
  }

  console.log("\n--- Test 4: Live embedding generation ---");
  const result = await generateAndStoreProductEmbedding(shopId, productId, TEST_DOMAIN);

  if (!result || result.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error("Live embedding generation failed");
  }

  const row = await db.productEmbedding.findUnique({
    where: { productId },
    select: { modelVersion: true },
  });

  if (row?.modelVersion !== EMBEDDING_MODEL_VERSION) {
    throw new Error("model_version was not persisted");
  }

  console.log("  Model version:", row.modelVersion);
  console.log("  Dimensions:", result.dimensions);
}

async function main() {
  const { shop, source, similar } = await setupShopAndProducts();

  await testEmbeddingText();
  await testSimilarityQuery(shop.id, source.id, similar.id);
  await testContentSimilarityStrategy(shop.id, source.id, similar.id);
  await testLiveEmbeddingGeneration(shop.id, source.id);

  console.log("\nSprint 8 acceptance tests passed.");
}

main()
  .catch((error) => {
    console.error("\nSprint 8 acceptance tests failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
