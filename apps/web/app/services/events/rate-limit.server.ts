import { getRedisConnection } from "../queue.server";
import { logEventIngestion } from "./logger.server";

const RATE_LIMIT_WINDOW_SEC = 60;
const MAX_REQUESTS_PER_WINDOW = 120;
const MAX_EVENTS_PER_REQUEST = 50;

export { MAX_EVENTS_PER_REQUEST };

export async function checkEventIngestionRateLimit(
  shopId: string,
  eventCount: number,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  if (eventCount > MAX_EVENTS_PER_REQUEST) {
    return { allowed: false, retryAfterSec: RATE_LIMIT_WINDOW_SEC };
  }

  try {
    const redis = getRedisConnection();
    const key = `events:rate:${shopId}`;
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SEC);
    }

    if (count > MAX_REQUESTS_PER_WINDOW) {
      const ttl = await redis.ttl(key);
      return { allowed: false, retryAfterSec: ttl > 0 ? ttl : RATE_LIMIT_WINDOW_SEC };
    }

    return { allowed: true };
  } catch (error) {
    logEventIngestion({
      event: "rate_limit_redis_error",
      level: "warn",
      shopId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { allowed: true };
  }
}
