import type { InventoryStatus, ProductStatus } from "@prisma/client";
import db from "../../db.server";
import { logSyncEvent } from "../logger.server";

export function extractShopifyId(gid: string): string {
  return gid.split("/").pop() ?? gid;
}

export function mapProductStatus(status: string): ProductStatus {
  switch (status.toUpperCase()) {
    case "DRAFT":
      return "draft";
    case "ARCHIVED":
      return "archived";
    default:
      return "active";
  }
}

export function mapInventoryStatus(totalQty: number): InventoryStatus {
  if (totalQty <= 0) return "out_of_stock";
  if (totalQty <= 5) return "low_stock";
  return "in_stock";
}

interface ShopifyVariant {
  id: string;
  price: string;
  sku?: string | null;
  inventoryQuantity?: number | null;
}

export interface ShopifyProductNode {
  id: string;
  title: string;
  handle?: string | null;
  description?: string | null;
  tags: string[];
  productType?: string | null;
  vendor?: string | null;
  status: string;
  images?: { edges: Array<{ node: { url: string } }> };
  variants?: { edges: Array<{ node: ShopifyVariant }> };
  metafields?: { edges: Array<{ node: { namespace: string; key: string; value: string } }> };
}

interface RestProductPayload {
  id: number | string;
  title: string;
  handle?: string | null;
  body_html?: string | null;
  tags?: string;
  product_type?: string | null;
  vendor?: string | null;
  status?: string;
  images?: Array<{ src: string }>;
  variants?: Array<{
    id: number | string;
    price: string;
    sku?: string | null;
    inventory_quantity?: number | null;
  }>;
}

function parseTags(tags: string | string[] | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  return tags.split(",").map((t) => t.trim()).filter(Boolean);
}

function restPayloadToNode(payload: RestProductPayload): ShopifyProductNode {
  return {
    id: `gid://shopify/Product/${payload.id}`,
    title: payload.title,
    handle: payload.handle ?? null,
    description: payload.body_html ?? null,
    tags: parseTags(payload.tags),
    productType: payload.product_type ?? null,
    vendor: payload.vendor ?? null,
    status: (payload.status ?? "active").toUpperCase(),
    images: {
      edges: (payload.images ?? []).map((img) => ({ node: { url: img.src } })),
    },
    variants: {
      edges: (payload.variants ?? []).map((v) => ({
        node: {
          id: `gid://shopify/ProductVariant/${v.id}`,
          price: v.price,
          sku: v.sku ?? null,
          inventoryQuantity: v.inventory_quantity ?? 0,
        },
      })),
    },
  };
}

export async function upsertProductFromNode(
  shopId: string,
  node: ShopifyProductNode,
  shopDomain?: string,
) {
  const shopifyProductId = extractShopifyId(node.id);
  const variants = node.variants?.edges.map((e) => e.node) ?? [];
  const prices = variants.map((v) => parseFloat(v.price)).filter((p) => !Number.isNaN(p));
  const totalInventory = variants.reduce((sum, v) => sum + (v.inventoryQuantity ?? 0), 0);
  const imageUrls = node.images?.edges.map((e) => e.node.url) ?? [];

  const product = await db.product.upsert({
    where: {
      shopId_shopifyProductId: { shopId, shopifyProductId },
    },
    create: {
      shopId,
      shopifyProductId,
      title: node.title,
      handle: node.handle ?? null,
      description: node.description ?? null,
      tags: node.tags ?? [],
      productType: node.productType ?? null,
      vendor: node.vendor ?? null,
      priceRangeMin: prices.length ? Math.min(...prices) : null,
      priceRangeMax: prices.length ? Math.max(...prices) : null,
      imageUrls,
      status: mapProductStatus(node.status),
      inventoryStatus: mapInventoryStatus(totalInventory),
    },
    update: {
      title: node.title,
      handle: node.handle ?? null,
      description: node.description ?? null,
      tags: node.tags ?? [],
      productType: node.productType ?? null,
      vendor: node.vendor ?? null,
      priceRangeMin: prices.length ? Math.min(...prices) : null,
      priceRangeMax: prices.length ? Math.max(...prices) : null,
      imageUrls,
      status: mapProductStatus(node.status),
      inventoryStatus: mapInventoryStatus(totalInventory),
    },
  });

  for (const variant of variants) {
    const shopifyVariantId = extractShopifyId(variant.id);
    await db.productVariant.upsert({
      where: {
        productId_shopifyVariantId: { productId: product.id, shopifyVariantId },
      },
      create: {
        productId: product.id,
        shopifyVariantId,
        price: variant.price,
        sku: variant.sku ?? null,
        inventoryQty: variant.inventoryQuantity ?? 0,
      },
      update: {
        price: variant.price,
        sku: variant.sku ?? null,
        inventoryQty: variant.inventoryQuantity ?? 0,
      },
    });
  }

  logSyncEvent({
    event: "product_upserted",
    shop: shopDomain,
    shopId,
    shopifyProductId,
    variantCount: variants.length,
  });

  return product;
}

export async function upsertProductFromRestPayload(
  shopId: string,
  payload: RestProductPayload,
  shopDomain?: string,
) {
  return upsertProductFromNode(shopId, restPayloadToNode(payload), shopDomain);
}

export async function archiveProduct(
  shopId: string,
  shopifyProductId: string,
  shopDomain?: string,
) {
  const result = await db.product.updateMany({
    where: { shopId, shopifyProductId },
    data: { status: "archived", inventoryStatus: "out_of_stock" },
  });

  logSyncEvent({
    event: "product_archived",
    shop: shopDomain,
    shopId,
    shopifyProductId,
    updated: result.count,
  });

  return result.count > 0;
}

const PRODUCT_BY_ID_QUERY = `#graphql
  query ProductById($id: ID!) {
    product(id: $id) {
      id
      title
      handle
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
`;

export async function fetchAndUpsertProduct(
  shopId: string,
  shopDomain: string,
  shopifyProductId: string,
  client: {
    graphql: (
      query: string,
      options?: { variables?: Record<string, unknown> },
    ) => Promise<Response>;
  },
) {
  const { graphqlRequest } = await import("./graphql-client.server");
  const data = await graphqlRequest<{ product: ShopifyProductNode | null }>(
    client as Parameters<typeof graphqlRequest>[0],
    PRODUCT_BY_ID_QUERY,
    { id: `gid://shopify/Product/${shopifyProductId}` },
    shopDomain,
  );

  if (!data.product) {
    await archiveProduct(shopId, shopifyProductId, shopDomain);
    return null;
  }

  return upsertProductFromNode(shopId, data.product, shopDomain);
}
