import db from "../../db.server";
import { logSyncEvent } from "../logger.server";
import { extractShopifyId } from "./product-sync.server";

export interface ShopifyCollectionNode {
  id: string;
  title: string;
  products?: { edges: Array<{ node: { id: string } }> };
}

interface RestCollectionPayload {
  id: number | string;
  title: string;
  products?: Array<{ id: number | string }>;
}

function restPayloadToNode(payload: RestCollectionPayload): ShopifyCollectionNode {
  return {
    id: `gid://shopify/Collection/${payload.id}`,
    title: payload.title,
    products: {
      edges: (payload.products ?? []).map((p) => ({
        node: { id: `gid://shopify/Product/${p.id}` },
      })),
    },
  };
}

async function resolveProductIds(
  shopId: string,
  shopifyProductGids: string[],
): Promise<string[]> {
  const shopifyProductIds = shopifyProductGids.map(extractShopifyId);
  const products = await db.product.findMany({
    where: { shopId, shopifyProductId: { in: shopifyProductIds } },
    select: { id: true },
  });
  return products.map((p) => p.id);
}

export async function upsertCollectionFromNode(
  shopId: string,
  node: ShopifyCollectionNode,
  shopDomain?: string,
) {
  const shopifyCollectionId = extractShopifyId(node.id);
  const shopifyProductGids = node.products?.edges.map((e) => e.node.id) ?? [];
  const productIds = await resolveProductIds(shopId, shopifyProductGids);

  const collection = await db.collection.upsert({
    where: {
      shopId_shopifyCollectionId: { shopId, shopifyCollectionId },
    },
    create: {
      shopId,
      shopifyCollectionId,
      title: node.title,
      productIds,
    },
    update: {
      title: node.title,
      productIds,
    },
  });

  logSyncEvent({
    event: "collection_upserted",
    shop: shopDomain,
    shopId,
    shopifyCollectionId,
    productCount: productIds.length,
  });

  return collection;
}

export async function upsertCollectionFromRestPayload(
  shopId: string,
  payload: RestCollectionPayload,
  shopDomain?: string,
) {
  return upsertCollectionFromNode(shopId, restPayloadToNode(payload), shopDomain);
}

const COLLECTION_BY_ID_QUERY = `#graphql
  query CollectionById($id: ID!) {
    collection(id: $id) {
      id
      title
      products(first: 250) {
        edges { node { id } }
      }
    }
  }
`;

export async function fetchAndUpsertCollection(
  shopId: string,
  shopDomain: string,
  shopifyCollectionId: string,
  client: {
    graphql: (
      query: string,
      options?: { variables?: Record<string, unknown> },
    ) => Promise<Response>;
  },
) {
  const { graphqlRequest } = await import("./graphql-client.server");
  const data = await graphqlRequest<{ collection: ShopifyCollectionNode | null }>(
    client as Parameters<typeof graphqlRequest>[0],
    COLLECTION_BY_ID_QUERY,
    { id: `gid://shopify/Collection/${shopifyCollectionId}` },
    shopDomain,
  );

  if (!data.collection) {
    logSyncEvent({
      event: "collection_not_found",
      shop: shopDomain,
      shopId,
      shopifyCollectionId,
      level: "warn",
    });
    return null;
  }

  return upsertCollectionFromNode(shopId, data.collection, shopDomain);
}
