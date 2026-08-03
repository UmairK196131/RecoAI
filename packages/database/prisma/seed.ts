import { PrismaClient } from "@prisma/client";

import { encryptField } from "../src/encryption.js";

const prisma = new PrismaClient();

const EMBEDDING_DIMENSIONS = 384;

function sampleVector(): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => Math.sin(i * 0.1));
}

async function main() {
  const accessTokenEncrypted = process.env.TOKEN_ENCRYPTION_KEY
    ? encryptField("shpat_test_seed_token")
    : "placeholder:encrypted:token";

  const shop = await prisma.shop.upsert({
    where: { shopifyDomain: "recoai-test.myshopify.com" },
    create: {
      shopifyDomain: "recoai-test.myshopify.com",
      accessTokenEncrypted,
      planTier: "free",
      status: "active",
    },
    update: {},
  });

  const product = await prisma.product.upsert({
    where: {
      shopId_shopifyProductId: {
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/1001",
      },
    },
    create: {
      shopId: shop.id,
      shopifyProductId: "gid://shopify/Product/1001",
      title: "Seed Test Product",
      description: "Minimal seed product for Sprint 2 verification",
      tags: ["seed", "test"],
      productType: "Test",
      vendor: "RecoAI",
      priceRangeMin: 19.99,
      priceRangeMax: 29.99,
      imageUrls: ["https://cdn.shopify.com/seed-product.jpg"],
      status: "active",
      inventoryStatus: "in_stock",
    },
    update: {},
  });

  await prisma.productVariant.upsert({
    where: {
      productId_shopifyVariantId: {
        productId: product.id,
        shopifyVariantId: "gid://shopify/ProductVariant/2001",
      },
    },
    create: {
      productId: product.id,
      shopifyVariantId: "gid://shopify/ProductVariant/2001",
      price: 24.99,
      sku: "SEED-001",
      inventoryQty: 100,
    },
    update: {},
  });

  const vectorLiteral = `[${sampleVector().join(",")}]`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO product_embeddings (product_id, shop_id, embedding_vector, model_version, updated_at)
     VALUES ($1, $2, $3::vector, $4, NOW())
     ON CONFLICT (product_id) DO UPDATE
     SET embedding_vector = EXCLUDED.embedding_vector,
         model_version = EXCLUDED.model_version,
         updated_at = NOW()`,
    product.id,
    shop.id,
    vectorLiteral,
    "seed-v1",
  );

  const rows = await prisma.$queryRawUnsafe<Array<{ product_id: string; distance: number }>>(
    `SELECT product_id, embedding_vector <=> $1::vector AS distance
     FROM product_embeddings
     WHERE shop_id = $2
     ORDER BY distance
     LIMIT 1`,
    vectorLiteral,
    shop.id,
  );

  if (rows.length === 0) {
    throw new Error("pgvector insert/query verification failed: no rows returned");
  }

  console.log(`Seed complete: shop=${shop.id}, product=${product.id}`);
  console.log(`pgvector OK: nearest neighbor distance=${rows[0].distance}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
