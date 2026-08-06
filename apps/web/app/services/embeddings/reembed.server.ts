import db from "../../db.server";
import { logSyncEvent } from "../logger.server";

import { EMBEDDING_MODEL_VERSION } from "./constants.server";
import { generateAndStoreProductEmbedding } from "./generate.server";

export async function runNightlyReembedding() {
  const activeShops = await db.shop.findMany({
    where: { status: "active" },
    select: {
      id: true,
      shopifyDomain: true,
    },
  });

  logSyncEvent({
    event: "nightly_reembed_started",
    shopCount: activeShops.length,
  });

  let embeddedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const shop of activeShops) {
    const products = await db.product.findMany({
      where: {
        shopId: shop.id,
        status: { not: "archived" },
      },
      select: { id: true },
      orderBy: { updatedAt: "asc" },
    });

    for (const product of products) {
      try {
        const result = await generateAndStoreProductEmbedding(
          shop.id,
          product.id,
          shop.shopifyDomain,
        );
        if (result) {
          embeddedCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        failedCount++;
        logSyncEvent({
          event: "product_embedding_failed",
          shop: shop.shopifyDomain,
          shopId: shop.id,
          productId: product.id,
          modelVersion: EMBEDDING_MODEL_VERSION,
          error: error instanceof Error ? error.message : "Unknown error",
          level: "error",
        });
      }
    }
  }

  logSyncEvent({
    event: "nightly_reembed_completed",
    shopCount: activeShops.length,
    embeddedCount,
    skippedCount,
    failedCount,
  });

  return { shopCount: activeShops.length, embeddedCount, skippedCount, failedCount };
}

export async function reembedShopProducts(shopId: string, shopDomain: string) {
  const products = await db.product.findMany({
    where: {
      shopId,
      status: { not: "archived" },
    },
    select: { id: true },
  });

  let embeddedCount = 0;

  for (const product of products) {
    const result = await generateAndStoreProductEmbedding(shopId, product.id, shopDomain);
    if (result) {
      embeddedCount++;
    }
  }

  return { embeddedCount, productCount: products.length };
}
