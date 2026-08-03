import db from "../../db.server";
import { logSyncEvent } from "../logger.server";
import { getAdminGraphqlClient } from "./admin-client.server";
import { graphqlRequest } from "./graphql-client.server";
import { upsertCollectionFromNode, type ShopifyCollectionNode } from "./collection-sync.server";
import { upsertProductFromNode, type ShopifyProductNode } from "./product-sync.server";

const PRODUCTS_QUERY = `#graphql
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          description
          tags
          productType
          vendor
          status
          images(first: 20) {
            edges { node { url } }
          }
          variants(first: 100) {
            edges {
              node {
                id
                price
                sku
                inventoryQuantity
              }
            }
          }
          metafields(first: 20) {
            edges { node { namespace key value } }
          }
        }
      }
    }
  }
`;

const COLLECTIONS_QUERY = `#graphql
  query Collections($cursor: String) {
    collections(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          products(first: 250) {
            edges { node { id } }
          }
        }
      }
    }
  }
`;

type ProductsPageResult = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: ShopifyProductNode }>;
  };
};

type CollectionsPageResult = {
  collections: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: ShopifyCollectionNode }>;
  };
};

export async function runFullCatalogSync(shopId: string, shopDomain: string) {
  logSyncEvent({
    event: "full_sync_started",
    shop: shopDomain,
    shopId,
  });

  await db.shop.update({
    where: { id: shopId },
    data: {
      catalogSyncStatus: "in_progress",
      lastCatalogSyncError: null,
    },
  });

  try {
    const client = await getAdminGraphqlClient(shopDomain);
    let productCount = 0;
    let collectionCount = 0;

    let productCursor: string | null = null;
    let hasMoreProducts = true;

    while (hasMoreProducts) {
      const data: ProductsPageResult = await graphqlRequest<ProductsPageResult>(
        client,
        PRODUCTS_QUERY,
        { cursor: productCursor },
        shopDomain,
      );

      for (const edge of data.products.edges) {
        await upsertProductFromNode(shopId, edge.node, shopDomain);
        productCount++;
      }

      hasMoreProducts = data.products.pageInfo.hasNextPage;
      productCursor = data.products.pageInfo.endCursor;
    }

    let collectionCursor: string | null = null;
    let hasMoreCollections = true;

    while (hasMoreCollections) {
      const data: CollectionsPageResult = await graphqlRequest<CollectionsPageResult>(
        client,
        COLLECTIONS_QUERY,
        { cursor: collectionCursor },
        shopDomain,
      );

      for (const edge of data.collections.edges) {
        await upsertCollectionFromNode(shopId, edge.node, shopDomain);
        collectionCount++;
      }

      hasMoreCollections = data.collections.pageInfo.hasNextPage;
      collectionCursor = data.collections.pageInfo.endCursor;
    }

    await db.shop.update({
      where: { id: shopId },
      data: {
        catalogSyncStatus: "completed",
        lastCatalogSyncAt: new Date(),
        lastCatalogSyncError: null,
      },
    });

    logSyncEvent({
      event: "full_sync_completed",
      shop: shopDomain,
      shopId,
      productCount,
      collectionCount,
    });

    return { productCount, collectionCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";

    await db.shop.update({
      where: { id: shopId },
      data: {
        catalogSyncStatus: "failed",
        lastCatalogSyncError: message,
      },
    });

    logSyncEvent({
      event: "full_sync_failed",
      shop: shopDomain,
      shopId,
      error: message,
      level: "error",
    });

    throw error;
  }
}
