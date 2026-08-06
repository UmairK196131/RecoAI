import { describe, expect, it } from "vitest";

import { buildProductEmbeddingText } from "./text.server";

describe("buildProductEmbeddingText", () => {
  it("combines title, description, tags, and product type", () => {
    const text = buildProductEmbeddingText({
      title: "Blue Cotton T-Shirt",
      description: "Soft everyday tee",
      tags: ["cotton", "casual"],
      productType: "Apparel",
    });

    expect(text).toBe("Blue Cotton T-Shirt Soft everyday tee cotton, casual Apparel");
  });

  it("omits empty fields", () => {
    const text = buildProductEmbeddingText({
      title: "Gift Card",
      description: null,
      tags: [],
      productType: null,
    });

    expect(text).toBe("Gift Card");
  });
});
