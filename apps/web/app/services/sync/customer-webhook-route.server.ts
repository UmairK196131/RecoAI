import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import { logSyncEvent } from "../logger.server";
import { enqueueCustomerUpsert } from "./enqueue.server";
import { getShopByDomain } from "./shop-lookup.server";
import { ensureSyncWorkerStarted } from "./worker.server";

export async function handleCustomerWebhook({ request }: ActionFunctionArgs) {
  ensureSyncWorkerStarted();
  const { shop, topic, payload } = await authenticate.webhook(request);

  logSyncEvent({ event: "webhook_received", topic, shop });

  const shopRecord = await getShopByDomain(shop);
  if (!shopRecord || shopRecord.status !== "active") {
    return new Response();
  }

  const customer = payload as { id: number | string };
  await enqueueCustomerUpsert({
    shopDomain: shop,
    shopId: shopRecord.id,
    shopifyCustomerId: String(customer.id),
    payload: payload as Record<string, unknown>,
  });

  return new Response();
}
