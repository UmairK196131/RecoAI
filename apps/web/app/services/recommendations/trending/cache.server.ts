import { getRedisConnection } from "../../queue.server";
import {
  getTrendingCacheTtlSec,
} from "../config.server";
import type { RecommendationItem } from "../types";

function trendingListKey(shopId: string): string {
  return `trending:list:${shopId}`;
}

function bestSellersListKey(shopId: string): string {
  return `trending:bestsellers:${shopId}`;
}

export async function cacheTrendingList(
  shopId: string,
  items: RecommendationItem[],
): Promise<void> {
  try {
    const redis = getRedisConnection();
    const ttl = getTrendingCacheTtlSec();
    const payload = JSON.stringify(items);
    await redis.set(trendingListKey(shopId), payload, "EX", ttl);
  } catch {
    // Cache is best-effort; DB remains source of truth.
  }
}

export async function cacheBestSellersList(
  shopId: string,
  items: RecommendationItem[],
): Promise<void> {
  try {
    const redis = getRedisConnection();
    const ttl = getTrendingCacheTtlSec();
    const payload = JSON.stringify(items);
    await redis.set(bestSellersListKey(shopId), payload, "EX", ttl);
  } catch {
    // Cache is best-effort.
  }
}

export async function getCachedTrendingList(
  shopId: string,
): Promise<RecommendationItem[] | null> {
  try {
    const redis = getRedisConnection();
    const raw = await redis.get(trendingListKey(shopId));
    if (!raw) return null;
    return JSON.parse(raw) as RecommendationItem[];
  } catch {
    return null;
  }
}

export async function getCachedBestSellersList(
  shopId: string,
): Promise<RecommendationItem[] | null> {
  try {
    const redis = getRedisConnection();
    const raw = await redis.get(bestSellersListKey(shopId));
    if (!raw) return null;
    return JSON.parse(raw) as RecommendationItem[];
  } catch {
    return null;
  }
}

export async function clearTrendingCache(shopId: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.del(trendingListKey(shopId), bestSellersListKey(shopId));
  } catch {
    // ignore
  }
}
