import { getRedisConnection } from "../../queue.server";
import { getServingCacheTtlSec } from "../config.server";
import type { CachedServingPayload } from "./types.server";
import type { PlacementType } from "@prisma/client";

function servingCacheKey(
  shopId: string,
  placementType: PlacementType,
  productId: string | null,
): string {
  return `reco:serve:${shopId}:${placementType}:${productId ?? "none"}`;
}

export async function getCachedServingResult(
  shopId: string,
  placementType: PlacementType,
  productId: string | null,
): Promise<CachedServingPayload | null> {
  try {
    const redis = getRedisConnection();
    const raw = await redis.get(servingCacheKey(shopId, placementType, productId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedServingPayload;
  } catch {
    return null;
  }
}

export async function setCachedServingResult(
  shopId: string,
  placementType: PlacementType,
  productId: string | null,
  payload: CachedServingPayload,
): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.set(
      servingCacheKey(shopId, placementType, productId),
      JSON.stringify(payload),
      "EX",
      getServingCacheTtlSec(),
    );
  } catch {
    // best-effort — serving must not fail if Redis is down
  }
}

export async function clearServingCacheForShop(shopId: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    const pattern = `reco:serve:${shopId}:*`;
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } catch {
    // ignore
  }
}
