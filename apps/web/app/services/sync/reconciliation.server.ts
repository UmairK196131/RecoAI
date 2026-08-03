import db from "../../db.server";
import { logSyncEvent } from "../logger.server";
import { enqueueFullCatalogSync } from "./enqueue.server";

export async function runNightlyReconciliation() {
  const activeShops = await db.shop.findMany({
    where: { status: "active" },
    select: {
      id: true,
      shopifyDomain: true,
    },
  });

  logSyncEvent({
    event: "nightly_reconciliation_started",
    shopCount: activeShops.length,
  });

  const reconciledAt = new Date();
  let enqueuedCount = 0;

  for (const shop of activeShops) {
    await enqueueFullCatalogSync({
      shopId: shop.id,
      shopDomain: shop.shopifyDomain,
    });

    await db.shop.update({
      where: { id: shop.id },
      data: { lastReconciliationAt: reconciledAt },
    });

    enqueuedCount++;
  }

  logSyncEvent({
    event: "nightly_reconciliation_completed",
    enqueuedCount,
  });

  return { enqueuedCount };
}
