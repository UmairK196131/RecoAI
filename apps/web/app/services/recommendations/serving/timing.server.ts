/**
 * In-process response timing + rolling p95 for the serving API (NFR-PERF-01).
 * Shared across workers only within a single Node process — sufficient for local benchmarks
 * and per-instance observability.
 */

const MAX_SAMPLES = 500;
const LOG_EVERY_N = 25;

const latenciesMs: number[] = [];
let requestCount = 0;

export function recordServingLatency(latencyMs: number): void {
  latenciesMs.push(latencyMs);
  if (latenciesMs.length > MAX_SAMPLES) {
    latenciesMs.shift();
  }
  requestCount += 1;

  if (requestCount % LOG_EVERY_N === 0) {
    logServingTimingMetrics();
  }
}

export function computePercentile(sortedAsc: number[], percentile: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sortedAsc.length) - 1),
  );
  return sortedAsc[rank];
}

export function getServingTimingSnapshot(): {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
} {
  if (latenciesMs.length === 0) {
    return { count: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }

  const sorted = [...latenciesMs].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: computePercentile(sorted, 50),
    p95: computePercentile(sorted, 95),
    p99: computePercentile(sorted, 99),
    max: sorted[sorted.length - 1],
  };
}

export function logServingTimingMetrics(): void {
  const snapshot = getServingTimingSnapshot();
  console.log(
    JSON.stringify({
      event: "recommendation_serving_timing",
      component: "recommendation-serving",
      level: "info",
      timestamp: new Date().toISOString(),
      ...snapshot,
      target_p95_ms: 150,
      within_target: snapshot.p95 < 150,
    }),
  );
}

/** Reset samples — used by benchmarks / tests. */
export function resetServingTimingMetrics(): void {
  latenciesMs.length = 0;
  requestCount = 0;
}
