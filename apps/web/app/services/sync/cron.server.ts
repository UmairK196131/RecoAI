import type { JobsOptions } from "bullmq";
import { getSyncQueue } from "../queue.server";
import { logSyncEvent } from "../logger.server";
import {
  getAssociationRulesJobCron,
  getCfFullJobCron,
  getCfIncrementalJobCron,
  getTrendingJobCron,
} from "../recommendations/config.server";

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
  const cfIncrementalCron = getCfIncrementalJobCron();
  const cfFullCron = getCfFullJobCron();
  const associationCron = getAssociationRulesJobCron();

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
    "cf-incremental",
    {},
    {
      repeat: { pattern: cfIncrementalCron },
      jobId: "cron-cf-incremental",
    } as JobsOptions,
  );

  await queue.add(
    "cf-full",
    {},
    {
      repeat: { pattern: cfFullCron },
      jobId: "cron-cf-full",
    } as JobsOptions,
  );

  await queue.add(
    "association-rules",
    {},
    {
      repeat: { pattern: associationCron },
      jobId: "cron-association-rules",
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
    cfIncremental: cfIncrementalCron,
    cfFull: cfFullCron,
    associationRules: associationCron,
    shopPurge: SHOP_PURGE_CRON,
  });
}
