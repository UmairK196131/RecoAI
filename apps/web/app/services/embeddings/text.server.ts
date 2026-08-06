export interface ProductEmbeddingInput {
  title: string;
  description?: string | null;
  tags?: string[];
  productType?: string | null;
}

export function buildProductEmbeddingText(product: ProductEmbeddingInput): string {
  const parts = [
    product.title,
    product.description ?? "",
    product.tags?.length ? product.tags.join(", ") : "",
    product.productType ?? "",
  ];

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}
