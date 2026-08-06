import type { JobsOptions } from "bullmq";
import { getSyncQueue } from "../queue.server";
import { logSyncEvent } from "../logger.server";
import { getTrendingJobCron } from "../recommendations/config.server";

declare global {
  // eslint-disable-next-line no-var
  var __recoaiCronJobsScheduled: boolean | undefined;
}

const NIGHTLY_RECONCILIATION_CRON = "0 2 * * *";
const NIGHTLY_REEMBED_CRON = "0 3 * * *";
const SHOP_PURGE_CRON = "0 * * * *";

export async function ensureCronJobsScheduled() {
  if (global.__recoaiCronJobsScheduled) {
    return;
  }

  global.__recoaiCronJobsScheduled = true;

  const queue = getSyncQueue();
  const trendingCron = getTrendingJobCron();

  await queue.add(
    "nightly-reconciliation",
    {},
    {
      repeat: { pattern: NIGHTLY_RECONCILIATION_CRON },
      jobId: "cron-nightly-reconciliation",
    } as JobsOptions,
  );

  await queue.add(
    "nightly-reembed",
    {},
    {
      repeat: { pattern: NIGHTLY_REEMBED_CRON },
      jobId: "cron-nightly-reembed",
    } as JobsOptions,
  );

  await queue.add(
    "trending-scores",
    {},
    {
      repeat: { pattern: trendingCron },
      jobId: "cron-trending-scores",
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
    nightlyReembed: NIGHTLY_REEMBED_CRON,
    trendingScores: trendingCron,
    shopPurge: SHOP_PURGE_CRON,
  });
}
