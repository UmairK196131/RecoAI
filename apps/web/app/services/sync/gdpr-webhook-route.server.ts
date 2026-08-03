import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import { logSyncEvent } from "../logger.server";
import {
  enqueueGdprCustomerRedact,
  enqueueGdprDataRequest,
  enqueueGdprShopRedact,
} from "./enqueue.server";
import { getShopByDomain } from "./shop-lookup.server";
import { ensureSyncWorkerStarted } from "./worker.server";

export async function handleGdprDataRequestWebhook({ request }: ActionFunctionArgs) {
  ensureSyncWorkerStarted();
  const { shop, topic, payload } = await authenticate.webhook(request);

  logSyncEvent({ event: "webhook_received", topic, shop });

  const shopRecord = await getShopByDomain(shop);
  if (!shopRecord) {
    return new Response();
  }

  await enqueueGdprDataRequest({
    shopDomain: shop,
    shopId: shopRecord.id,
    payload: payload as Record<string, unknown>,
  });

  return new Response();
}

export async function handleGdprCustomerRedactWebhook({ request }: ActionFunctionArgs) {
  ensureSyncWorkerStarted();
  const { shop, topic, payload } = await authenticate.webhook(request);

  logSyncEvent({ event: "webhook_received", topic, shop });

  const shopRecord = await getShopByDomain(shop);
  if (!shopRecord) {
    return new Response();
  }

  await enqueueGdprCustomerRedact({
    shopDomain: shop,
    shopId: shopRecord.id,
    payload: payload as Record<string, unknown>,
  });

  return new Response();
}

export async function handleGdprShopRedactWebhook({ request }: ActionFunctionArgs) {
  ensureSyncWorkerStarted();
  const { shop, topic, payload } = await authenticate.webhook(request);

  logSyncEvent({ event: "webhook_received", topic, shop });

  await enqueueGdprShopRedact({
    shopDomain: shop,
    payload: payload as Record<string, unknown>,
  });

  return new Response();
}
