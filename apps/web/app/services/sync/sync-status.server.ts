import db from "../../db.server";

export async function getSyncStatus(shopDomain: string) {
  const shop = await db.shop.findUnique({
    where: { shopifyDomain: shopDomain },
    select: {
      id: true,
      catalogSyncStatus: true,
      lastCatalogSyncAt: true,
      lastCatalogSyncError: true,
      lastOrderSyncAt: true,
      lastReconciliationAt: true,
    },
  });

  if (!shop) {
    return null;
  }

  const [productCount, collectionCount, variantCount, orderCount] = await Promise.all([
    db.product.count({ where: { shopId: shop.id } }),
    db.collection.count({ where: { shopId: shop.id } }),
    db.productVariant.count({
      where: { product: { shopId: shop.id } },
    }),
    db.order.count({ where: { shopId: shop.id } }),
  ]);

  return {
    status: shop.catalogSyncStatus,
    lastSyncAt: shop.lastCatalogSyncAt?.toISOString() ?? null,
    lastOrderSyncAt: shop.lastOrderSyncAt?.toISOString() ?? null,
    lastReconciliationAt: shop.lastReconciliationAt?.toISOString() ?? null,
    productCount,
    collectionCount,
    variantCount,
    orderCount,
    error: shop.lastCatalogSyncError,
  };
}
