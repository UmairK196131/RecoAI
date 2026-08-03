import type { Session } from "@shopify/shopify-api";
import { encryptField } from "@recoai/database";
import db from "../db.server";

/** Hours after uninstall before shop data is purged (SRS Section 6 retention policy). */
export const PURGE_DELAY_HOURS = 48;

export async function upsertShopFromSession(session: Session) {
  const accessTokenEncrypted = encryptField(session.accessToken);

  return db.shop.upsert({
    where: { shopifyDomain: session.shop },
    create: {
      shopifyDomain: session.shop,
      accessTokenEncrypted,
      status: "active",
      installedAt: new Date(),
    },
    update: {
      accessTokenEncrypted,
      status: "active",
      uninstalledAt: null,
      purgeScheduledAt: null,
    },
  });
}

export async function markShopUninstalled(shopifyDomain: string) {
  const uninstalledAt = new Date();
  const purgeScheduledAt = new Date(
    uninstalledAt.getTime() + PURGE_DELAY_HOURS * 60 * 60 * 1000,
  );

  const result = await db.shop.updateMany({
    where: { shopifyDomain },
    data: {
      status: "uninstalled",
      uninstalledAt,
      purgeScheduledAt,
      accessTokenEncrypted: "",
    },
  });

  if (result.count > 0) {
    console.log(
      JSON.stringify({
        event: "shop_purge_scheduled",
        shop: shopifyDomain,
        uninstalledAt: uninstalledAt.toISOString(),
        purgeScheduledAt: purgeScheduledAt.toISOString(),
        purgeDelayHours: PURGE_DELAY_HOURS,
      }),
    );
  }

  return { uninstalledAt, purgeScheduledAt, updated: result.count > 0 };
}
