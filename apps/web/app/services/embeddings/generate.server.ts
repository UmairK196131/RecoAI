import db from "../../db.server";
import { logSyncEvent } from "../logger.server";

import { EMBEDDING_MODEL_VERSION } from "./constants.server";
import { embedText } from "./model.server";
import { buildProductEmbeddingText } from "./text.server";
import { upsertProductEmbedding } from "./store.server";

export async function generateAndStoreProductEmbedding(
  shopId: string,
  productId: string,
  shopDomain?: string,
): Promise<{ modelVersion: string; dimensions: number } | null> {
  const product = await db.product.findFirst({
    where: { id: productId, shopId },
    select: {
      id: true,
      title: true,
      description: true,
      tags: true,
      productType: true,
      status: true,
    },
  });

  if (!product) {
    logSyncEvent({
      event: "product_embedding_skipped",
      reason: "product_not_found",
      shop: shopDomain,
      shopId,
      productId,
      level: "warn",
    });
    return null;
  }

  if (product.status === "archived") {
    logSyncEvent({
      event: "product_embedding_skipped",
      reason: "product_archived",
      shop: shopDomain,
      shopId,
      productId,
    });
    return null;
  }

  const text = buildProductEmbeddingText(product);
  if (!text) {
    logSyncEvent({
      event: "product_embedding_skipped",
      reason: "empty_product_text",
      shop: shopDomain,
      shopId,
      productId,
      level: "warn",
    });
    return null;
  }

  const vector = await embedText(text);
  await upsertProductEmbedding(shopId, productId, vector, EMBEDDING_MODEL_VERSION);

  logSyncEvent({
    event: "product_embedding_stored",
    shop: shopDomain,
    shopId,
    productId,
    modelVersion: EMBEDDING_MODEL_VERSION,
    dimensions: vector.length,
  });

  return {
    modelVersion: EMBEDDING_MODEL_VERSION,
    dimensions: vector.length,
  };
}
