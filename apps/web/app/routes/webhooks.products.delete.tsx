import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logSyncEvent } from "../services/logger.server";
import { enqueueProductDelete } from "../services/sync/enqueue.server";
import { getShopByDomain } from "../services/sync/shop-lookup.server";
import { ensureSyncWorkerStarted } from "../services/sync/worker.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  ensureSyncWorkerStarted();
  const { shop, topic, payload } = await authenticate.webhook(request);

  logSyncEvent({ event: "webhook_received", topic, shop });

  const shopRecord = await getShopByDomain(shop);
  if (!shopRecord || shopRecord.status !== "active") {
    return new Response();
  }

  const product = payload as { id: number | string };
  await enqueueProductDelete({
    shopDomain: shop,
    shopId: shopRecord.id,
    shopifyProductId: String(product.id),
  });

  return new Response();
};
