import { Prisma } from "@prisma/client";
import db from "../../db.server";
import { logSyncEvent } from "../logger.server";
import { resolveCustomerId } from "./customer-sync.server";

export interface OrderLineItem {
  shopifyLineItemId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  quantity: number;
  price: string;
  title: string;
}

interface RestOrderLineItem {
  id: number | string;
  product_id: number | string | null;
  variant_id: number | string | null;
  quantity: number;
  price: string;
  title: string;
}

export interface RestOrderPayload {
  id: number | string;
  customer?: { id: number | string } | null;
  line_items?: RestOrderLineItem[];
  total_price: string;
  created_at?: string;
}

function normalizeLineItems(items: RestOrderLineItem[] | undefined): OrderLineItem[] {
  return (items ?? []).map((item) => ({
    shopifyLineItemId: String(item.id),
    shopifyProductId: item.product_id != null ? String(item.product_id) : "",
    shopifyVariantId: item.variant_id != null ? String(item.variant_id) : "",
    quantity: item.quantity,
    price: item.price,
    title: item.title,
  }));
}

export async function upsertOrderFromRestPayload(
  shopId: string,
  payload: RestOrderPayload,
  shopDomain: string,
) {
  const shopifyOrderId = String(payload.id);
  const lineItems = normalizeLineItems(payload.line_items);
  const totalPrice = new Prisma.Decimal(payload.total_price);

  let customerId: string | null = null;
  if (payload.customer?.id != null) {
    customerId = await resolveCustomerId(shopId, String(payload.customer.id));
  }

  const orderCreatedAt = payload.created_at ? new Date(payload.created_at) : new Date();

  const order = await db.order.upsert({
    where: {
      shopId_shopifyOrderId: {
        shopId,
        shopifyOrderId,
      },
    },
    create: {
      shopId,
      shopifyOrderId,
      customerId,
      lineItems: lineItems as unknown as Prisma.InputJsonValue,
      totalPrice,
      createdAt: orderCreatedAt,
    },
    update: {
      customerId,
      lineItems: lineItems as unknown as Prisma.InputJsonValue,
      totalPrice,
    },
  });

  await db.shop.update({
    where: { id: shopId },
    data: { lastOrderSyncAt: new Date() },
  });

  logSyncEvent({
    event: "order_upserted",
    shop: shopDomain,
    shopId,
    shopifyOrderId,
    lineItemCount: lineItems.length,
  });

  return order;
}
