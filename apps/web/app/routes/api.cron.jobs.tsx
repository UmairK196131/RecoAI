import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  enqueueNightlyReconciliation,
  enqueueNightlyReembed,
  enqueueShopPurge,
  enqueueTrendingScores,
} from "../services/sync/enqueue.server";
import { ensureSyncWorkerStarted } from "../services/sync/worker.server";

function authorizeCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  return authHeader.slice("Bearer ".length) === secret;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!authorizeCronRequest(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  ensureSyncWorkerStarted();

  const url = new URL(request.url);
  const job = url.searchParams.get("job");

  if (job === "purge") {
    await enqueueShopPurge();
    return json({ ok: true, job: "shop-purge" });
  }

  if (job === "reembed") {
    await enqueueNightlyReembed();
    return json({ ok: true, job: "nightly-reembed" });
  }

  if (job === "trending") {
    await enqueueTrendingScores();
    return json({ ok: true, job: "trending-scores" });
  }

  await enqueueNightlyReconciliation();
  return json({ ok: true, job: "nightly-reconciliation" });
};
