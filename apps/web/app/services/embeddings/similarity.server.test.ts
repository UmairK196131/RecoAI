import { afterAll, beforeAll, describe, expect, it } from "vitest";

import db from "../../db.server";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_VERSION } from "./constants.server";
import { findSimilarProducts } from "./similarity.server";
import { vectorToLiteral } from "./store.server";

const TEST_DOMAIN = "sprint8-vitest.myshopify.com";

function sampleVector(seed: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) =>
    Math.sin(seed + index * 0.1),
  );
}

async function upsertSeedEmbedding(
  shopId: string,
  productId: string,
  vector: number[],
) {
  await db.$executeRawUnsafe(
    `INSERT INTO product_embeddings (product_id, shop_id, embedding_vector, model_version, updated_at)
     VALUES ($1, $2, $3::vector, $4, NOW())
     ON CONFLICT (product_id) DO UPDATE
     SET embedding_vector = EXCLUDED.embedding_vector,
         model_version = EXCLUDED.model_version,
         updated_at = NOW()`,
    productId,
    shopId,
    vectorToLiteral(vector),
    EMBEDDING_MODEL_VERSION,
  );
}

describe("findSimilarProducts", () => {
  let shopId = "";
  let sourceProductId = "";
  let similarProductId = "";
  let distantProductId = "";
  let outOfStockProductId = "";

  beforeAll(async () => {
    const shop = await db.shop.upsert({
      where: { shopifyDomain: TEST_DOMAIN },
      create: {
        shopifyDomain: TEST_DOMAIN,
        accessTokenEncrypted: "test:encrypted",
        status: "active",
      },
      update: { status: "active" },
    });
    shopId = shop.id;

    const sourceVector = sampleVector(1);
    const similarVector = sourceVector.map((value, index) =>
      index % 5 === 0 ? value + 0.01 : value,
    );
    const distantVector = sampleVector(99);

    const sourceProduct = await db.product.create({
      data: {
        shopId,
        shopifyProductId: "sprint8-source",
        title: "Source Hoodie",
        description: "Warm fleece hoodie",
        tags: ["hoodie", "winter"],
        productType: "Apparel",
        status: "active",
        inventoryStatus: "in_stock",
      },
    });
    sourceProductId = sourceProduct.id;

    const similarProduct = await db.product.create({
      data: {
        shopId,
        shopifyProductId: "sprint8-similar",
        title: "Similar Hoodie",
        description: "Another warm hoodie",
        tags: ["hoodie"],
        productType: "Apparel",
        status: "active",
        inventoryStatus: "in_stock",
      },
    });
    similarProductId = similarProduct.id;

    const distantProduct = await db.product.create({
      data: {
        shopId,
        shopifyProductId: "sprint8-distant",
        title: "Ceramic Mug",
        description: "Coffee mug",
        tags: ["kitchen"],
        productType: "Home",
        status: "active",
        inventoryStatus: "in_stock",
      },
    });
    distantProductId = distantProduct.id;

    const outOfStockProduct = await db.product.create({
      data: {
        shopId,
        shopifyProductId: "sprint8-oos",
        title: "Sold Out Hoodie",
        description: "Unavailable hoodie",
        tags: ["hoodie"],
        productType: "Apparel",
        status: "active",
        inventoryStatus: "out_of_stock",
      },
    });
    outOfStockProductId = outOfStockProduct.id;

    await upsertSeedEmbedding(shopId, sourceProductId, sourceVector);
    await upsertSeedEmbedding(shopId, similarProductId, similarVector);
    await upsertSeedEmbedding(shopId, distantProductId, distantVector);
    await upsertSeedEmbedding(shopId, outOfStockProductId, similarVector);
  });

  afterAll(async () => {
    if (!shopId) {
      return;
    }

    await db.productEmbedding.deleteMany({ where: { shopId } });
    await db.product.deleteMany({ where: { shopId } });
    await db.shop.deleteMany({ where: { id: shopId } });
    await db.$disconnect();
  });

  it("returns nearest in-stock neighbors ordered by similarity", async () => {
    const results = await findSimilarProducts({
      shopId,
      productId: sourceProductId,
      limit: 3,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].productId).toBe(similarProductId);
    expect(results.some((item) => item.productId === outOfStockProductId)).toBe(false);
    expect(results[0].similarity).toBeGreaterThan(
      results.find((item) => item.productId === distantProductId)?.similarity ?? 0,
    );
  });

  it("excludes the source product from results", async () => {
    const results = await findSimilarProducts({
      shopId,
      productId: sourceProductId,
      limit: 5,
    });

    expect(results.some((item) => item.productId === sourceProductId)).toBe(false);
  });
});
