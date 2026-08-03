import type { JobsOptions } from "bullmq";
import { getSyncQueue } from "../queue.server";
import { logSyncEvent } from "../logger.server";

declare global {
  // eslint-disable-next-line no-var
  var __recoaiCronJobsScheduled: boolean | undefined;
}

const NIGHTLY_RECONCILIATION_CRON = "0 2 * * *";
const SHOP_PURGE_CRON = "0 * * * *";

export async function ensureCronJobsScheduled() {
  if (global.__recoaiCronJobsScheduled) {
    return;
  }

  global.__recoaiCronJobsScheduled = true;

  const queue = getSyncQueue();

  await queue.add(
    "nightly-reconciliation",
    {},
    {
      repeat: { pattern: NIGHTLY_RECONCILIATION_CRON },
      jobId: "cron-nightly-reconciliation",
    } as JobsOptions,
  );

  await queue.add(
    "shop-purge",
    {},
    {
      repeat: { pattern: SHOP_PURGE_CRON },
      jobId: "cron-shop-purge",
    } as JobsOptions,
  );

  logSyncEvent({
    event: "cron_jobs_scheduled",
    nightlyReconciliation: NIGHTLY_RECONCILIATION_CRON,
    shopPurge: SHOP_PURGE_CRON,
  });
}
