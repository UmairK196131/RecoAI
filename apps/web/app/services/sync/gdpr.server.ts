import db from "../../db.server";
import { logSyncEvent } from "../logger.server";

interface GdprCustomerRef {
  id: number | string;
  email?: string;
  phone?: string;
}

interface CustomerDataRequestPayload {
  shop_domain: string;
  customer: GdprCustomerRef;
  orders_requested?: Array<number | string>;
  data_request?: { id: number | string };
}

interface CustomerRedactPayload {
  shop_domain: string;
  customer: GdprCustomerRef;
  orders_to_redact?: Array<number | string>;
}

interface ShopRedactPayload {
  shop_domain: string;
}

export async function handleCustomerDataRequest(
  shopId: string,
  shopDomain: string,
  payload: CustomerDataRequestPayload,
) {
  const shopifyCustomerId = String(payload.customer.id);

  const customer = await db.customer.findFirst({
    where: { shopId, shopifyCustomerId },
    select: { id: true },
  });

  if (!customer) {
    logSyncEvent({
      event: "gdpr_data_request_no_data",
      shop: shopDomain,
      shopId,
      shopifyCustomerId,
      dataRequestId: payload.data_request?.id,
    });
    return { found: false };
  }

  const [behavioralEvents, orders] = await Promise.all([
    db.behavioralEvent.findMany({
      where: { shopId, customerId: customer.id },
      select: {
        eventType: true,
        sessionId: true,
        productId: true,
        timestamp: true,
        metadata: true,
      },
      orderBy: { timestamp: "asc" },
    }),
    db.order.findMany({
      where: { shopId, customerId: customer.id },
      select: {
        shopifyOrderId: true,
        lineItems: true,
        totalPrice: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const compiled = {
    shopDomain,
    shopifyCustomerId,
    dataRequestId: payload.data_request?.id ?? null,
    ordersRequested: (payload.orders_requested ?? []).map(String),
    behavioralEvents,
    orders,
    compiledAt: new Date().toISOString(),
  };

  logSyncEvent({
    event: "gdpr_data_request_compiled",
    shop: shopDomain,
    shopId,
    shopifyCustomerId,
    dataRequestId: payload.data_request?.id,
    eventCount: behavioralEvents.length,
    orderCount: orders.length,
    compiled,
  });

  return { found: true, compiled };
}

export async function handleCustomerRedact(
  shopId: string,
  shopDomain: string,
  payload: CustomerRedactPayload,
) {
  const shopifyCustomerId = String(payload.customer.id);
  const ordersToRedact = (payload.orders_to_redact ?? []).map(String);

  const customer = await db.customer.findFirst({
    where: { shopId, shopifyCustomerId },
    select: { id: true },
  });

  if (!customer) {
    logSyncEvent({
      event: "gdpr_customer_redact_no_data",
      shop: shopDomain,
      shopId,
      shopifyCustomerId,
    });
    return { redacted: false };
  }

  await db.$transaction([
    db.behavioralEvent.deleteMany({
      where: { shopId, customerId: customer.id },
    }),
    ...(ordersToRedact.length > 0
      ? [
          db.order.deleteMany({
            where: {
              shopId,
              shopifyOrderId: { in: ordersToRedact },
            },
          }),
        ]
      : []),
    db.order.updateMany({
      where: { shopId, customerId: customer.id },
      data: { customerId: null },
    }),
    db.customer.update({
      where: { id: customer.id },
      data: {
        shopifyCustomerId: null,
        sessionIds: [],
      },
    }),
  ]);

  logSyncEvent({
    event: "gdpr_customer_redacted",
    shop: shopDomain,
    shopId,
    shopifyCustomerId,
    ordersRedacted: ordersToRedact.length,
  });

  return { redacted: true };
}

export async function handleShopRedact(shopDomain: string, _payload: ShopRedactPayload) {
  const shop = await db.shop.findUnique({
    where: { shopifyDomain: shopDomain },
    select: { id: true },
  });

  if (!shop) {
    logSyncEvent({
      event: "gdpr_shop_redact_no_data",
      shop: shopDomain,
    });
    return { purged: false };
  }

  await purgeShopData(shop.id, shopDomain, "gdpr_shop_redact");
  return { purged: true };
}

export async function purgeShopData(
  shopId: string,
  shopDomain: string,
  reason: "scheduled_purge" | "gdpr_shop_redact",
) {
  await db.session.deleteMany({ where: { shop: shopDomain } });
  await db.shop.delete({ where: { id: shopId } });

  logSyncEvent({
    event: "shop_data_purged",
    shop: shopDomain,
    shopId,
    reason,
  });
}
