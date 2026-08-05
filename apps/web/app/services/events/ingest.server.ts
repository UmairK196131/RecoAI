import type { BehavioralEventType, Prisma } from "@prisma/client";
import db from "../../db.server";
import { getShopByDomain } from "../sync/shop-lookup.server";
import { logEventIngestion } from "./logger.server";
import { checkEventIngestionRateLimit } from "./rate-limit.server";
import {
  BEHAVIORAL_EVENT_TYPES,
  type EventBatchPayload,
  type IncomingBehavioralEvent,
  type IngestionResult,
} from "./types";

const EVENT_TYPE_SET = new Set<string>(BEHAVIORAL_EVENT_TYPES);

function normalizeShopDomain(shop: string): string {
  return shop.trim().toLowerCase();
}

function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}

function parseTimestamp(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function extractShopifyProductId(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const productId = metadata.productId;
  if (typeof productId === "string" || typeof productId === "number") {
    return String(productId);
  }
  return null;
}

async function resolveProductIds(
  shopId: string,
  shopifyProductIds: string[],
): Promise<Map<string, string>> {
  if (shopifyProductIds.length === 0) return new Map();

  const products = await db.product.findMany({
    where: {
      shopId,
      shopifyProductId: { in: shopifyProductIds },
    },
    select: { id: true, shopifyProductId: true },
  });

  return new Map(products.map((product) => [product.shopifyProductId, product.id]));
}

async function resolveCustomerIds(
  shopId: string,
  shopifyCustomerIds: string[],
): Promise<Map<string, string>> {
  if (shopifyCustomerIds.length === 0) return new Map();

  const customers = await db.customer.findMany({
    where: {
      shopId,
      shopifyCustomerId: { in: shopifyCustomerIds },
    },
    select: { id: true, shopifyCustomerId: true },
  });

  return new Map(
    customers
      .filter((customer) => customer.shopifyCustomerId !== null)
      .map((customer) => [customer.shopifyCustomerId as string, customer.id]),
  );
}

function validateBatchPayload(body: unknown): EventBatchPayload | IngestionResult {
  if (!body || typeof body !== "object") {
    return { ok: false, inserted: 0, rejected: 0, error: "invalid_payload", message: "Body required" };
  }

  const payload = body as Partial<EventBatchPayload>;
  if (!payload.shop || typeof payload.shop !== "string") {
    return { ok: false, inserted: 0, rejected: 0, error: "invalid_payload", message: "shop required" };
  }

  const shop = normalizeShopDomain(payload.shop);
  if (!isValidShopDomain(shop)) {
    return { ok: false, inserted: 0, rejected: 0, error: "invalid_payload", message: "Invalid shop domain" };
  }

  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    return { ok: false, inserted: 0, rejected: 0, error: "invalid_payload", message: "events array required" };
  }

  return { shop, events: payload.events };
}

function detectCrossShopInjection(shop: string, events: IncomingBehavioralEvent[]): boolean {
  return events.some((event) => {
    if (!event.shop) return false;
    return normalizeShopDomain(event.shop) !== shop;
  });
}

export async function ingestBehavioralEvents(body: unknown): Promise<IngestionResult> {
  const startMs = Date.now();
  const validated = validateBatchPayload(body);

  if ("ok" in validated) {
    return validated;
  }

  const { shop, events } = validated;

  if (detectCrossShopInjection(shop, events)) {
    logEventIngestion({
      event: "events_rejected",
      level: "warn",
      shop,
      reason: "cross_shop_injection",
      batchSize: events.length,
    });
    return {
      ok: false,
      inserted: 0,
      rejected: events.length,
      error: "cross_shop_injection",
      message: "Event shop does not match batch shop",
    };
  }

  const shopRecord = await getShopByDomain(shop);
  if (!shopRecord) {
    return {
      ok: false,
      inserted: 0,
      rejected: events.length,
      error: "shop_not_found",
      message: "Shop not found",
    };
  }

  if (shopRecord.status !== "active") {
    return {
      ok: false,
      inserted: 0,
      rejected: events.length,
      error: "shop_inactive",
      message: "Shop is not active",
    };
  }

  const rateLimit = await checkEventIngestionRateLimit(shopRecord.id, events.length);
  if (!rateLimit.allowed) {
    logEventIngestion({
      event: "events_rate_limited",
      level: "warn",
      shop,
      shopId: shopRecord.id,
      batchSize: events.length,
    });
    return {
      ok: false,
      inserted: 0,
      rejected: events.length,
      error: "rate_limited",
      message: "Rate limit exceeded",
      retryAfterSec: rateLimit.retryAfterSec,
    };
  }

  const shopifyProductIds = new Set<string>();
  const shopifyCustomerIds = new Set<string>();

  for (const event of events) {
    if (!event.eventType || !EVENT_TYPE_SET.has(event.eventType)) {
      return {
        ok: false,
        inserted: 0,
        rejected: events.length,
        error: "invalid_event_type",
        message: `Invalid event type: ${event.eventType ?? "missing"}`,
      };
    }

    if (!event.sessionId || typeof event.sessionId !== "string") {
      return {
        ok: false,
        inserted: 0,
        rejected: events.length,
        error: "missing_session_id",
        message: "sessionId required for all events",
      };
    }

    const productId = extractShopifyProductId(event.metadata);
    if (productId) shopifyProductIds.add(productId);

    if (event.customerId) {
      shopifyCustomerIds.add(String(event.customerId));
    }
  }

  const [productIdMap, customerIdMap] = await Promise.all([
    resolveProductIds(shopRecord.id, [...shopifyProductIds]),
    resolveCustomerIds(shopRecord.id, [...shopifyCustomerIds]),
  ]);

  const rows: Prisma.BehavioralEventCreateManyInput[] = events.map((event) => {
    const shopifyProductId = extractShopifyProductId(event.metadata);
    const internalCustomerId = event.customerId
      ? customerIdMap.get(String(event.customerId)) ?? null
      : null;

    return {
      shopId: shopRecord.id,
      sessionId: event.sessionId,
      customerId: internalCustomerId,
      eventType: event.eventType as BehavioralEventType,
      productId: shopifyProductId ? productIdMap.get(shopifyProductId) ?? null : null,
      timestamp: parseTimestamp(event.timestamp),
      metadata: (event.metadata ?? {}) as Prisma.InputJsonValue,
    };
  });

  const result = await db.behavioralEvent.createMany({ data: rows });
  const durationMs = Date.now() - startMs;

  logEventIngestion({
    event: "events_ingested",
    shop,
    shopId: shopRecord.id,
    batchSize: events.length,
    inserted: result.count,
    durationMs,
    eventTypes: [...new Set(events.map((event) => event.eventType))],
  });

  return {
    ok: true,
    inserted: result.count,
    rejected: events.length - result.count,
  };
}
