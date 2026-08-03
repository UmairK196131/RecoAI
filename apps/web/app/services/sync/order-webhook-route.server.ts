import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import { logSyncEvent } from "../logger.server";
import { enqueueOrderUpsert } from "./enqueue.server";
import { getShopByDomain } from "./shop-lookup.server";
import { ensureSyncWorkerStarted } from "./worker.server";

export async function handleOrderWebhook({ request }: ActionFunctionArgs) {
  ensureSyncWorkerStarted();
  const { shop, topic, payload } = await authenticate.webhook(request);

  logSyncEvent({ event: "webhook_received", topic, shop });

  const shopRecord = await getShopByDomain(shop);
  if (!shopRecord || shopRecord.status !== "active") {
    return new Response();
  }

  const order = payload as { id: number | string };
  await enqueueOrderUpsert({
    shopDomain: shop,
    shopId: shopRecord.id,
    shopifyOrderId: String(order.id),
    payload: payload as Record<string, unknown>,
  });

  return new Response();
}
