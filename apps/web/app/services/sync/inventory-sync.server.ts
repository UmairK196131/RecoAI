import db from "../../db.server";
import { logSyncEvent } from "../logger.server";
import { mapInventoryStatus } from "./product-sync.server";

const INVENTORY_ITEM_QUERY = `#graphql
  query InventoryItem($id: ID!) {
    inventoryItem(id: $id) {
      id
      variant {
        id
        inventoryQuantity
        product {
          id
        }
      }
    }
  }
`;

export async function updateInventoryFromWebhook(
  shopId: string,
  shopDomain: string,
  inventoryItemId: string,
  available: number,
  client: { request: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<unknown> },
) {
  const { graphqlRequest } = await import("./graphql-client.server");
  const data = await graphqlRequest<{
    inventoryItem: {
      variant: {
        id: string;
        inventoryQuantity: number;
        product: { id: string };
      } | null;
    } | null;
  }>(
    client as Parameters<typeof graphqlRequest>[0],
    INVENTORY_ITEM_QUERY,
    { id: `gid://shopify/InventoryItem/${inventoryItemId}` },
    shopDomain,
  );

  const variant = data.inventoryItem?.variant;
  if (!variant) {
    logSyncEvent({
      event: "inventory_item_not_found",
      shop: shopDomain,
      shopId,
      inventoryItemId,
      level: "warn",
    });
    return;
  }

  const shopifyVariantId = variant.id.split("/").pop() ?? variant.id;
  const shopifyProductId = variant.product.id.split("/").pop() ?? variant.product.id;

  const product = await db.product.findUnique({
    where: { shopId_shopifyProductId: { shopId, shopifyProductId } },
    include: { variants: true },
  });

  if (!product) {
    logSyncEvent({
      event: "inventory_product_not_found",
      shop: shopDomain,
      shopId,
      shopifyProductId,
      level: "warn",
    });
    return;
  }

  await db.productVariant.updateMany({
    where: { productId: product.id, shopifyVariantId },
    data: { inventoryQty: available },
  });

  const variants = await db.productVariant.findMany({
    where: { productId: product.id },
    select: { inventoryQty: true },
  });
  const totalQty = variants.reduce((sum, v) => sum + v.inventoryQty, 0);

  await db.product.update({
    where: { id: product.id },
    data: { inventoryStatus: mapInventoryStatus(totalQty) },
  });

  logSyncEvent({
    event: "inventory_updated",
    shop: shopDomain,
    shopId,
    inventoryItemId,
    available,
    shopifyProductId,
  });
}
