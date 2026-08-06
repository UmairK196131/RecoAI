import { getRedisConnection } from "../../queue.server";
import { getCfCacheTtlSec } from "../config.server";
import type { RecommendationItem } from "../types";

function cfNeighborsKey(shopId: string, productId: string): string {
  return `cf:neighbors:${shopId}:${productId}`;
}

function fbtKey(shopId: string, productId: string): string {
  return `fbt:bundle:${shopId}:${productId}`;
}

export async function cacheCfNeighbors(
  shopId: string,
  productId: string,
  items: RecommendationItem[],
): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.set(
      cfNeighborsKey(shopId, productId),
      JSON.stringify(items),
      "EX",
      getCfCacheTtlSec(),
    );
  } catch {
    // best-effort
  }
}

export async function getCachedCfNeighbors(
  shopId: string,
  productId: string,
): Promise<RecommendationItem[] | null> {
  try {
    const redis = getRedisConnection();
    const raw = await redis.get(cfNeighborsKey(shopId, productId));
    if (!raw) return null;
    return JSON.parse(raw) as RecommendationItem[];
  } catch {
    return null;
  }
}

export async function cacheFbtBundle(
  shopId: string,
  productId: string,
  items: RecommendationItem[],
): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.set(
      fbtKey(shopId, productId),
      JSON.stringify(items),
      "EX",
      getCfCacheTtlSec(),
    );
  } catch {
    // best-effort
  }
}

export async function getCachedFbtBundle(
  shopId: string,
  productId: string,
): Promise<RecommendationItem[] | null> {
  try {
    const redis = getRedisConnection();
    const raw = await redis.get(fbtKey(shopId, productId));
    if (!raw) return null;
    return JSON.parse(raw) as RecommendationItem[];
  } catch {
    return null;
  }
}

export async function clearCfCaches(shopId: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    const patterns = [`cf:neighbors:${shopId}:*`, `fbt:bundle:${shopId}:*`];
    for (const pattern of patterns) {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = next;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== "0");
    }
  } catch {
    // ignore
  }
}
