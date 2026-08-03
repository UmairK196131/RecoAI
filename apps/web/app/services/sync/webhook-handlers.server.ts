import { getAdminGraphqlClient } from "./admin-client.server";
import {
  archiveProduct,
  fetchAndUpsertProduct,
  upsertProductFromRestPayload,
} from "./product-sync.server";
import {
  fetchAndUpsertCollection,
  upsertCollectionFromRestPayload,
} from "./collection-sync.server";
import { updateInventoryFromWebhook } from "./inventory-sync.server";
import type {
  CollectionUpsertJobData,
  InventoryUpdateJobData,
  ProductDeleteJobData,
  ProductUpsertJobData,
} from "./types";

export async function handleProductUpsert(data: ProductUpsertJobData) {
  const { shopId, shopDomain, shopifyProductId, payload } = data;

  if (payload && typeof payload.id !== "undefined") {
    return upsertProductFromRestPayload(
      shopId,
      payload as Parameters<typeof upsertProductFromRestPayload>[1],
      shopDomain,
    );
  }

  const client = await getAdminGraphqlClient(shopDomain);
  return fetchAndUpsertProduct(shopId, shopDomain, shopifyProductId, client);
}

export async function handleProductDelete(data: ProductDeleteJobData) {
  return archiveProduct(data.shopId, data.shopifyProductId, data.shopDomain);
}

export async function handleCollectionUpsert(data: CollectionUpsertJobData) {
  const { shopId, shopDomain, shopifyCollectionId, payload } = data;

  if (payload && typeof payload.id !== "undefined") {
    return upsertCollectionFromRestPayload(
      shopId,
      payload as Parameters<typeof upsertCollectionFromRestPayload>[1],
      shopDomain,
    );
  }

  const client = await getAdminGraphqlClient(shopDomain);
  return fetchAndUpsertCollection(shopId, shopDomain, shopifyCollectionId, client);
}

export async function handleInventoryUpdate(data: InventoryUpdateJobData) {
  const client = await getAdminGraphqlClient(data.shopDomain);
  return updateInventoryFromWebhook(
    data.shopId,
    data.shopDomain,
    data.inventoryItemId,
    data.available,
    client,
  );
}
