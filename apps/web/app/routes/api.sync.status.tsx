import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getSyncStatus } from "../services/sync/sync-status.server";
import { ensureSyncWorkerStarted } from "../services/sync/worker.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  ensureSyncWorkerStarted();
  const { session } = await authenticate.admin(request);
  const status = await getSyncStatus(session.shop);

  if (!status) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  return json(status);
};
