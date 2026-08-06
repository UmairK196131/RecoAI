import db from "../../db.server";

import { getProductEmbeddingVector, vectorToLiteral } from "./store.server";

export interface SimilarProductResult {
  productId: string;
  shopifyProductId: string;
  title: string;
  similarity: number;
  imageUrls: string[];
  priceRangeMin: number | null;
  priceRangeMax: number | null;
}

export interface ContentSimilarityOptions {
  shopId: string;
  productId: string;
  limit?: number;
  excludeProductIds?: string[];
  requireInStock?: boolean;
}

export async function findSimilarProducts(
  options: ContentSimilarityOptions,
): Promise<SimilarProductResult[]> {
  const {
    shopId,
    productId,
    limit = 8,
    excludeProductIds = [],
    requireInStock = true,
  } = options;

  const sourceVector = await getProductEmbeddingVector(shopId, productId);
  if (!sourceVector || sourceVector.length === 0) {
    return [];
  }

  const vectorLiteral = vectorToLiteral(sourceVector);
  const excludedIds = Array.from(new Set([productId, ...excludeProductIds]));
  const inventoryClause = requireInStock
    ? `AND p.inventory_status != 'out_of_stock'`
    : "";

  const rows = await db.$queryRawUnsafe<
    Array<{
      product_id: string;
      shopify_product_id: string;
      title: string;
      similarity: number;
      image_urls: string[];
      price_range_min: string | null;
      price_range_max: string | null;
    }>
  >(
    `SELECT
       p.id AS product_id,
       p.shopify_product_id,
       p.title,
       1 - (pe.embedding_vector <=> $1::vector) AS similarity,
       p.image_urls,
       p.price_range_min::text AS price_range_min,
       p.price_range_max::text AS price_range_max
     FROM product_embeddings pe
     INNER JOIN products p ON p.id = pe.product_id
     WHERE pe.shop_id = $2
       AND pe.product_id <> ALL($3::text[])
       AND p.status = 'active'
       ${inventoryClause}
       AND pe.embedding_vector IS NOT NULL
     ORDER BY pe.embedding_vector <=> $1::vector
     LIMIT $4`,
    vectorLiteral,
    shopId,
    excludedIds,
    limit,
  );

  return rows.map((row) => ({
    productId: row.product_id,
    shopifyProductId: row.shopify_product_id,
    title: row.title,
    similarity: Number(row.similarity),
    imageUrls: row.image_urls ?? [],
    priceRangeMin: row.price_range_min ? Number.parseFloat(row.price_range_min) : null,
    priceRangeMax: row.price_range_max ? Number.parseFloat(row.price_range_max) : null,
  }));
}
