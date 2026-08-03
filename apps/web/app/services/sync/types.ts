export type SyncJobName =
  | "full-catalog-sync"
  | "product-upsert"
  | "product-delete"
  | "collection-upsert"
  | "inventory-update"
  | "order-upsert"
  | "customer-upsert"
  | "gdpr-data-request"
  | "gdpr-customer-redact"
  | "gdpr-shop-redact"
  | "nightly-reconciliation"
  | "shop-purge";

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

export interface OrderUpsertJobData {
  shopDomain: string;
  shopId: string;
  shopifyOrderId: string;
  payload: Record<string, unknown>;
}

export interface CustomerUpsertJobData {
  shopDomain: string;
  shopId: string;
  shopifyCustomerId: string;
  payload: Record<string, unknown>;
}

export interface GdprDataRequestJobData {
  shopDomain: string;
  shopId: string;
  payload: Record<string, unknown>;
}

export interface GdprCustomerRedactJobData {
  shopDomain: string;
  shopId: string;
  payload: Record<string, unknown>;
}

export interface GdprShopRedactJobData {
  shopDomain: string;
  payload: Record<string, unknown>;
}

export type SyncJobData =
  | FullCatalogSyncJobData
  | ProductUpsertJobData
  | ProductDeleteJobData
  | CollectionUpsertJobData
  | InventoryUpdateJobData
  | OrderUpsertJobData
  | CustomerUpsertJobData
  | GdprDataRequestJobData
  | GdprCustomerRedactJobData
  | GdprShopRedactJobData;

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
