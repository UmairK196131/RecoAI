import { Worker, type Job } from "bullmq";
import { getRedisConnectionOptions, SYNC_QUEUE_NAME } from "../queue.server";
import { logSyncEvent } from "../logger.server";
import { runFullCatalogSync } from "./full-sync.server";
import type {
  CollectionUpsertJobData,
  FullCatalogSyncJobData,
  InventoryUpdateJobData,
  ProductDeleteJobData,
  ProductUpsertJobData,
  SyncJobName,
} from "./types";
import {
  handleCollectionUpsert,
  handleInventoryUpdate,
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
    default:
      throw new Error(`Unknown sync job: ${name}`);
  }
}

export function ensureSyncWorkerStarted() {
  if (global.__recoaiSyncWorkerStarted) {
    return;
  }

  global.__recoaiSyncWorkerStarted = true;

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
