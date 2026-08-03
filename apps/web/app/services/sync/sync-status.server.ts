import db from "../../db.server";

export async function getSyncStatus(shopDomain: string) {
  const shop = await db.shop.findUnique({
    where: { shopifyDomain: shopDomain },
    select: {
      id: true,
      catalogSyncStatus: true,
      lastCatalogSyncAt: true,
      lastCatalogSyncError: true,
    },
  });

  if (!shop) {
    return null;
  }

  const [productCount, collectionCount, variantCount] = await Promise.all([
    db.product.count({ where: { shopId: shop.id } }),
    db.collection.count({ where: { shopId: shop.id } }),
    db.productVariant.count({
      where: { product: { shopId: shop.id } },
    }),
  ]);

  return {
    status: shop.catalogSyncStatus,
    lastSyncAt: shop.lastCatalogSyncAt?.toISOString() ?? null,
    productCount,
    collectionCount,
    variantCount,
    error: shop.lastCatalogSyncError,
  };
}
