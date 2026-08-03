import db from "../../db.server";
import { logSyncEvent } from "../logger.server";

interface RestCustomerPayload {
  id: number | string;
}

export async function resolveCustomerId(
  shopId: string,
  shopifyCustomerId: string,
): Promise<string> {
  const customer = await db.customer.upsert({
    where: {
      shopId_shopifyCustomerId: {
        shopId,
        shopifyCustomerId,
      },
    },
    create: {
      shopId,
      shopifyCustomerId,
    },
    update: {},
  });

  return customer.id;
}

export async function upsertCustomerFromRestPayload(
  shopId: string,
  payload: RestCustomerPayload,
  shopDomain: string,
) {
  const shopifyCustomerId = String(payload.id);

  const customer = await db.customer.upsert({
    where: {
      shopId_shopifyCustomerId: {
        shopId,
        shopifyCustomerId,
      },
    },
    create: {
      shopId,
      shopifyCustomerId,
    },
    update: {},
  });

  logSyncEvent({
    event: "customer_upserted",
    shop: shopDomain,
    shopId,
    shopifyCustomerId,
  });

  return customer;
}
