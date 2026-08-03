import { Worker, type Job } from "bullmq";
import { getRedisConnectionOptions, SYNC_QUEUE_NAME } from "../queue.server";
import { logSyncEvent } from "../logger.server";
import { runFullCatalogSync } from "./full-sync.server";
import { runNightlyReconciliation } from "./reconciliation.server";
import { runScheduledShopPurge } from "./purge.server";
import { ensureCronJobsScheduled } from "./cron.server";
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
import {
  handleCollectionUpsert,
  handleCustomerUpsert,
  handleGdprCustomerRedact,
  handleGdprDataRequest,
  handleGdprShopRedact,
  handleInventoryUpdate,
  handleOrderUpsert,
  handleProductDelete,
  handleProductUpsert,
} from "./webhook-handlers.server";

declare global {
  // eslint-disable-next-line no-var
  var __recoaiSyncWorkerStarted: boolean | undefined;
}

async function processJob(job: Job) {
  const name = job.name as SyncJobName;

  logSyncEvent({
    event: "sync_job_started",
    jobName: name,
    jobId: job.id,
    shop: (job.data as { shopDomain?: string }).shopDomain,
  });

  switch (name) {
    case "full-catalog-sync":
      return runFullCatalogSync(
        (job.data as FullCatalogSyncJobData).shopId,
        (job.data as FullCatalogSyncJobData).shopDomain,
      );
    case "product-upsert":
      return handleProductUpsert(job.data as ProductUpsertJobData);
    case "product-delete":
      return handleProductDelete(job.data as ProductDeleteJobData);
    case "collection-upsert":
      return handleCollectionUpsert(job.data as CollectionUpsertJobData);
    case "inventory-update":
      return handleInventoryUpdate(job.data as InventoryUpdateJobData);
    case "order-upsert":
      return handleOrderUpsert(job.data as OrderUpsertJobData);
    case "customer-upsert":
      return handleCustomerUpsert(job.data as CustomerUpsertJobData);
    case "gdpr-data-request":
      return handleGdprDataRequest(job.data as GdprDataRequestJobData);
    case "gdpr-customer-redact":
      return handleGdprCustomerRedact(job.data as GdprCustomerRedactJobData);
    case "gdpr-shop-redact":
      return handleGdprShopRedact(job.data as GdprShopRedactJobData);
    case "nightly-reconciliation":
      return runNightlyReconciliation();
    case "shop-purge":
      return runScheduledShopPurge();
    default:
      throw new Error(`Unknown sync job: ${name}`);
  }
}

export function ensureSyncWorkerStarted() {
  if (global.__recoaiSyncWorkerStarted) {
    return;
  }

  global.__recoaiSyncWorkerStarted = true;

  void ensureCronJobsScheduled();

  const worker = new Worker(SYNC_QUEUE_NAME, processJob, {
    connection: getRedisConnectionOptions(),
    concurrency: 2,
  });

  worker.on("completed", (job) => {
    logSyncEvent({
      event: "sync_job_completed",
      jobName: job.name,
      jobId: job.id,
      shop: (job.data as { shopDomain?: string }).shopDomain,
    });
  });

  worker.on("failed", (job, error) => {
    logSyncEvent({
      event: "sync_job_failed",
      jobName: job?.name,
      jobId: job?.id,
      shop: (job?.data as { shopDomain?: string } | undefined)?.shopDomain,
      error: error.message,
      level: "error",
    });
  });

  logSyncEvent({ event: "sync_worker_started" });
}
