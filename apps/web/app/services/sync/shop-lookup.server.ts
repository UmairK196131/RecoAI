import db from "../../db.server";

export async function getShopByDomain(shopDomain: string) {
  return db.shop.findUnique({
    where: { shopifyDomain: shopDomain },
    select: { id: true, shopifyDomain: true, status: true },
  });
}
