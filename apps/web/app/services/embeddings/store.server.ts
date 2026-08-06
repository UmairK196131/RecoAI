import db from "../../db.server";

import { EMBEDDING_MODEL_VERSION } from "./constants.server";

export function vectorToLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export async function upsertProductEmbedding(
  shopId: string,
  productId: string,
  vector: number[],
  modelVersion: string = EMBEDDING_MODEL_VERSION,
): Promise<void> {
  const vectorLiteral = vectorToLiteral(vector);

  await db.$executeRawUnsafe(
    `INSERT INTO product_embeddings (product_id, shop_id, embedding_vector, model_version, updated_at)
     VALUES ($1, $2, $3::vector, $4, NOW())
     ON CONFLICT (product_id) DO UPDATE
     SET embedding_vector = EXCLUDED.embedding_vector,
         model_version = EXCLUDED.model_version,
         updated_at = NOW()`,
    productId,
    shopId,
    vectorLiteral,
    modelVersion,
  );
}

export async function getProductEmbeddingVector(
  shopId: string,
  productId: string,
): Promise<number[] | null> {
  const rows = await db.$queryRawUnsafe<Array<{ embedding_vector: string | null }>>(
    `SELECT embedding_vector::text AS embedding_vector
     FROM product_embeddings
     WHERE shop_id = $1 AND product_id = $2`,
    shopId,
    productId,
  );

  const raw = rows[0]?.embedding_vector;
  if (!raw) {
    return null;
  }

  return parseVectorLiteral(raw);
}

export function parseVectorLiteral(literal: string): number[] {
  const trimmed = literal.trim();
  const inner = trimmed.startsWith("[") ? trimmed.slice(1, -1) : trimmed;
  if (!inner) {
    return [];
  }

  return inner.split(",").map((value) => Number.parseFloat(value.trim()));
}
