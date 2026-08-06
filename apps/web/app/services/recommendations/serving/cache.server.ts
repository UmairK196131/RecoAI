import type { PlacementType } from "@prisma/client";
import { getRedisConnection } from "../../queue.server";
import { getServingCacheTtlSec } from "../config.server";
import type { CachedServingPayload } from "./types.server";

export interface ServingCacheKeyParts {
  placementType: PlacementType;
  /** Distinguishes YMAL vs FBT / trending vs picks under the same PlacementType. */
  placementKey?: string | null;
  productId: string | null;
  collectionId?: string | null;
  strategy?: string | null;
}

function servingCacheKey(shopId: string, parts: ServingCacheKeyParts): string {
  const key = parts.placementKey || parts.placementType;
  const strategy = parts.strategy || "default";
  const collection = parts.collectionId || "none";
  return `reco:serve:${shopId}:${key}:${strategy}:${parts.productId ?? "none"}:c:${collection}`;
}

export async function getCachedServingResult(
  shopId: string,
  parts: ServingCacheKeyParts,
): Promise<CachedServingPayload | null> {
  try {
    const redis = getRedisConnection();
    const raw = await redis.get(servingCacheKey(shopId, parts));
    if (!raw) return null;
    return JSON.parse(raw) as CachedServingPayload;
  } catch {
    return null;
  }
}

export async function setCachedServingResult(
  shopId: string,
  parts: ServingCacheKeyParts,
  payload: CachedServingPayload,
): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.set(
      servingCacheKey(shopId, parts),
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
