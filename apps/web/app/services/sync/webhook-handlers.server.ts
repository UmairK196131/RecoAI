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
import { upsertOrderFromRestPayload } from "./order-sync.server";
import { upsertCustomerFromRestPayload } from "./customer-sync.server";
import {
  handleCustomerDataRequest,
  handleCustomerRedact,
  handleShopRedact,
} from "./gdpr.server";
import type {
  CollectionUpsertJobData,
  CustomerUpsertJobData,
  GdprCustomerRedactJobData,
  GdprDataRequestJobData,
  GdprShopRedactJobData,
  InventoryUpdateJobData,
  OrderUpsertJobData,
  ProductDeleteJobData,
  ProductUpsertJobData,
} from "./types";

export async function handleProductUpsert(data: ProductUpsertJobData) {
  const { shopId, shopDomain, shopifyProductId, payload } = data;

  if (payload && typeof payload.id !== "undefined") {
    return upsertProductFromRestPayload(
      shopId,
      payload as unknown as Parameters<typeof upsertProductFromRestPayload>[1],
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
      payload as unknown as Parameters<typeof upsertCollectionFromRestPayload>[1],
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

export async function handleOrderUpsert(data: OrderUpsertJobData) {
  return upsertOrderFromRestPayload(
    data.shopId,
    data.payload as unknown as Parameters<typeof upsertOrderFromRestPayload>[1],
    data.shopDomain,
  );
}

export async function handleCustomerUpsert(data: CustomerUpsertJobData) {
  return upsertCustomerFromRestPayload(
    data.shopId,
    data.payload as unknown as Parameters<typeof upsertCustomerFromRestPayload>[1],
    data.shopDomain,
  );
}

export async function handleGdprDataRequest(data: GdprDataRequestJobData) {
  return handleCustomerDataRequest(
    data.shopId,
    data.shopDomain,
    data.payload as unknown as Parameters<typeof handleCustomerDataRequest>[2],
  );
}

export async function handleGdprCustomerRedact(data: GdprCustomerRedactJobData) {
  return handleCustomerRedact(
    data.shopId,
    data.shopDomain,
    data.payload as unknown as Parameters<typeof handleCustomerRedact>[2],
  );
}

export async function handleGdprShopRedact(data: GdprShopRedactJobData) {
  return handleShopRedact(
    data.shopDomain,
    data.payload as unknown as Parameters<typeof handleShopRedact>[1],
  );
}
