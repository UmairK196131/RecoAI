/**
 * Cold-start and trending configuration (FR-REC-04, SRS 5.2 / 5.3).
 * All thresholds are overridable via environment variables.
 */

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveFloat(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** New store uses content + trending until this many orders exist. */
export function getColdStartOrderThreshold(): number {
  return parsePositiveInt(process.env.COLD_START_ORDER_THRESHOLD, 50);
}

/** Product with fewer interactions is treated as a new product. */
export function getColdStartProductInteractionThreshold(): number {
  return parsePositiveInt(process.env.COLD_START_PRODUCT_INTERACTION_THRESHOLD, 1);
}

/** Anonymous shopper until session accumulates this many events. */
export function getColdStartSessionEventThreshold(): number {
  return parsePositiveInt(process.env.COLD_START_SESSION_EVENT_THRESHOLD, 3);
}

/** Rolling window length for trending score recalculation (hours). */
export function getTrendingWindowHours(): number {
  return parsePositiveInt(process.env.TRENDING_WINDOW_HOURS, 168);
}

/** BullMQ cron for trending job — default every 3 hours. */
export function getTrendingJobCron(): string {
  return process.env.TRENDING_JOB_CRON?.trim() || "0 */3 * * *";
}

/** Signal weights for blended trending score (must sum ~1). */
export function getTrendingSignalWeights() {
  const orderVolume = parsePositiveFloat(process.env.TRENDING_WEIGHT_ORDER_VOLUME, 0.45);
  const viewCount = parsePositiveFloat(process.env.TRENDING_WEIGHT_VIEW_COUNT, 0.25);
  const salesVelocity = parsePositiveFloat(process.env.TRENDING_WEIGHT_SALES_VELOCITY, 0.3);
  const total = orderVolume + viewCount + salesVelocity;
  return {
    orderVolume: orderVolume / total,
    viewCount: viewCount / total,
    salesVelocity: salesVelocity / total,
  };
}

/** Redis TTL for cached trending ranked lists (seconds). */
export function getTrendingCacheTtlSec(): number {
  return parsePositiveInt(process.env.TRENDING_CACHE_TTL_SEC, 3 * 60 * 60);
}

/** Minimum orders before CF / association strategies activate (SRS 5.2). */
export function getCfMinOrderThreshold(): number {
  return parsePositiveInt(
    process.env.CF_MIN_ORDER_THRESHOLD ?? process.env.COLD_START_ORDER_THRESHOLD,
    50,
  );
}

/** Minimum co-occurrence count to keep a CF pair. */
export function getCfMinCoOccurrence(): number {
  return parsePositiveInt(process.env.CF_MIN_CO_OCCURRENCE, 2);
}

/** Max neighbors stored per source product for CF. */
export function getCfMaxNeighbors(): number {
  return parsePositiveInt(process.env.CF_MAX_NEIGHBORS, 50);
}

/** BullMQ cron: CF incremental daily (default 04:00 UTC). */
export function getCfIncrementalJobCron(): string {
  return process.env.CF_INCREMENTAL_JOB_CRON?.trim() || "0 4 * * *";
}

/** BullMQ cron: CF full weekly retrain (default Sunday 05:00 UTC). */
export function getCfFullJobCron(): string {
  return process.env.CF_FULL_JOB_CRON?.trim() || "0 5 * * 0";
}

/** BullMQ cron: association rules daily (default 04:30 UTC). */
export function getAssociationRulesJobCron(): string {
  return process.env.ASSOCIATION_RULES_JOB_CRON?.trim() || "30 4 * * *";
}

/** Apriori minimum support (fraction of multi-item baskets). */
export function getAssociationMinSupport(): number {
  return parsePositiveFloat(process.env.ASSOCIATION_MIN_SUPPORT, 0.02);
}

/** Apriori minimum confidence. */
export function getAssociationMinConfidence(): number {
  return parsePositiveFloat(process.env.ASSOCIATION_MIN_CONFIDENCE, 0.1);
}

/** Apriori minimum lift. */
export function getAssociationMinLift(): number {
  return parsePositiveFloat(process.env.ASSOCIATION_MIN_LIFT, 1.0);
}

/** Redis TTL for CF / association caches (seconds). */
export function getCfCacheTtlSec(): number {
  return parsePositiveInt(process.env.CF_CACHE_TTL_SEC, 24 * 60 * 60);
}
