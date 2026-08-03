export type SyncJobName =
  | "full-catalog-sync"
  | "product-upsert"
  | "product-delete"
  | "collection-upsert"
  | "inventory-update";

export interface FullCatalogSyncJobData {
  shopDomain: string;
  shopId: string;
}

export interface ProductUpsertJobData {
  shopDomain: string;
  shopId: string;
  shopifyProductId: string;
  payload?: Record<string, unknown>;
}

export interface ProductDeleteJobData {
  shopDomain: string;
  shopId: string;
  shopifyProductId: string;
}

export interface CollectionUpsertJobData {
  shopDomain: string;
  shopId: string;
  shopifyCollectionId: string;
  payload?: Record<string, unknown>;
}

export interface InventoryUpdateJobData {
  shopDomain: string;
  shopId: string;
  inventoryItemId: string;
  available: number;
}

export type SyncJobData =
  | FullCatalogSyncJobData
  | ProductUpsertJobData
  | ProductDeleteJobData
  | CollectionUpsertJobData
  | InventoryUpdateJobData;

export interface GraphQLThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

export interface GraphQLCostExtensions {
  requestedQueryCost?: number;
  actualQueryCost?: number;
  throttleStatus?: GraphQLThrottleStatus;
}
