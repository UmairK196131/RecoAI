import db from "../../db.server";
import { logSyncEvent } from "../logger.server";
import { purgeShopData } from "./gdpr.server";

export async function runScheduledShopPurge() {
  const now = new Date();

  const shopsToPurge = await db.shop.findMany({
    where: {
      status: "uninstalled",
      purgeScheduledAt: { lte: now },
    },
    select: {
      id: true,
      shopifyDomain: true,
    },
  });

  logSyncEvent({
    event: "shop_purge_job_started",
    shopCount: shopsToPurge.length,
  });

  let purgedCount = 0;

  for (const shop of shopsToPurge) {
    await purgeShopData(shop.id, shop.shopifyDomain, "scheduled_purge");
    purgedCount++;
  }

  logSyncEvent({
    event: "shop_purge_job_completed",
    purgedCount,
  });

  return { purgedCount };
}
