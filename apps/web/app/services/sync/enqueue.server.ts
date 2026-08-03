import { getSyncQueue } from "../queue.server";
import type {
  CollectionUpsertJobData,
  CustomerUpsertJobData,
  FullCatalogSyncJobData,
  GdprCustomerRedactJobData,
  GdprDataRequestJobData,
  GdprShopRedactJobData,
  InventoryUpdateJobData,
  OrderUpsertJobData,
  ProductDeleteJobData,
  ProductUpsertJobData,
  SyncJobName,
} from "./types";

function jobId(name: SyncJobName, key: string) {
  return `${name}--${key.replace(/:/g, "-")}`;
}

export async function enqueueFullCatalogSync(data: FullCatalogSyncJobData) {
  const queue = getSyncQueue();
  await queue.add("full-catalog-sync", data, {
    jobId: jobId("full-catalog-sync", data.shopId),
  });
}

export async function enqueueProductUpsert(data: ProductUpsertJobData) {
  const queue = getSyncQueue();
  await queue.add("product-upsert", data, {
    jobId: jobId("product-upsert", `${data.shopId}:${data.shopifyProductId}`),
  });
}

export async function enqueueProductDelete(data: ProductDeleteJobData) {
  const queue = getSyncQueue();
  await queue.add("product-delete", data, {
    jobId: jobId("product-delete", `${data.shopId}:${data.shopifyProductId}`),
  });
}

export async function enqueueCollectionUpsert(data: CollectionUpsertJobData) {
  const queue = getSyncQueue();
  await queue.add("collection-upsert", data, {
    jobId: jobId("collection-upsert", `${data.shopId}:${data.shopifyCollectionId}`),
  });
}

export async function enqueueInventoryUpdate(data: InventoryUpdateJobData) {
  const queue = getSyncQueue();
  await queue.add("inventory-update", data, {
    jobId: jobId(
      "inventory-update",
      `${data.shopId}:${data.inventoryItemId}`,
    ),
  });
}

export async function enqueueOrderUpsert(data: OrderUpsertJobData) {
  const queue = getSyncQueue();
  await queue.add("order-upsert", data, {
    jobId: jobId("order-upsert", `${data.shopId}:${data.shopifyOrderId}`),
  });
}

export async function enqueueCustomerUpsert(data: CustomerUpsertJobData) {
  const queue = getSyncQueue();
  await queue.add("customer-upsert", data, {
    jobId: jobId("customer-upsert", `${data.shopId}:${data.shopifyCustomerId}`),
  });
}

export async function enqueueGdprDataRequest(data: GdprDataRequestJobData) {
  const queue = getSyncQueue();
  await queue.add("gdpr-data-request", data, {
    jobId: jobId(
      "gdpr-data-request",
      `${data.shopId}:${(data.payload as { data_request?: { id?: string | number } }).data_request?.id ?? "unknown"}`,
    ),
  });
}

export async function enqueueGdprCustomerRedact(data: GdprCustomerRedactJobData) {
  const queue = getSyncQueue();
  await queue.add("gdpr-customer-redact", data, {
    jobId: jobId(
      "gdpr-customer-redact",
      `${data.shopId}:${(data.payload as { customer?: { id?: string | number } }).customer?.id ?? "unknown"}`,
    ),
  });
}

export async function enqueueGdprShopRedact(data: GdprShopRedactJobData) {
  const queue = getSyncQueue();
  await queue.add("gdpr-shop-redact", data, {
    jobId: jobId("gdpr-shop-redact", data.shopDomain),
  });
}

export async function enqueueNightlyReconciliation() {
  const queue = getSyncQueue();
  await queue.add("nightly-reconciliation", {}, {
    jobId: jobId("nightly-reconciliation", String(Date.now())),
  });
}

export async function enqueueShopPurge() {
  const queue = getSyncQueue();
  await queue.add("shop-purge", {}, {
    jobId: jobId("shop-purge", String(Date.now())),
  });
}
