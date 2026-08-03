import { getSyncQueue } from "../queue.server";
import type {
  CollectionUpsertJobData,
  FullCatalogSyncJobData,
  InventoryUpdateJobData,
  ProductDeleteJobData,
  ProductUpsertJobData,
  SyncJobName,
} from "./types";

function jobId(name: SyncJobName, key: string) {
  return `${name}:${key}`;
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
