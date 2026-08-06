import { describe, expect, it } from "vitest";

import {
  frequentlyBoughtTogether,
  generateCandidates,
  mineAssociationRules,
  normalizeBasket,
} from "./apriori.server";

describe("normalizeBasket", () => {
  it("sorts and dedupes", () => {
    expect(normalizeBasket(["b", "a", "b", ""])).toEqual(["a", "b"]);
  });
});

describe("generateCandidates", () => {
  it("joins frequent 1-itemsets into 2-item candidates", () => {
    const candidates = generateCandidates(["a", "b", "c"], 2);
    const keys = candidates.map((c) => c.join("+")).sort();
    expect(keys).toEqual(["a+b", "a+c", "b+c"]);
  });
});

describe("mineAssociationRules", () => {
  it("finds frequently bought together rules", () => {
    const baskets = [
      ["bread", "butter"],
      ["bread", "butter", "jam"],
      ["bread", "butter"],
      ["milk", "cereal"],
      ["bread", "butter", "milk"],
      ["butter", "jam"],
    ];

    const rules = mineAssociationRules(baskets, {
      minSupport: 0.2,
      minConfidence: 0.5,
      minLift: 1.0,
      maxItemsetSize: 2,
    });

    expect(rules.length).toBeGreaterThan(0);

    const breadToButter = rules.find(
      (rule) =>
        rule.antecedent.length === 1 &&
        rule.antecedent[0] === "bread" &&
        rule.consequent.includes("butter"),
    );
    expect(breadToButter).toBeDefined();
    expect(breadToButter!.confidence).toBeGreaterThanOrEqual(0.5);
  });
});

describe("frequentlyBoughtTogether", () => {
  it("ranks consequents for a seed product", () => {
    const ranked = frequentlyBoughtTogether(
      [
        {
          antecedent: ["p1"],
          consequent: ["p2"],
          support: 0.4,
          confidence: 0.8,
          lift: 2,
        },
        {
          antecedent: ["p1"],
          consequent: ["p3"],
          support: 0.2,
          confidence: 0.4,
          lift: 1.5,
        },
      ],
      "p1",
      5,
    );

    expect(ranked[0].productId).toBe("p2");
    expect(ranked.map((r) => r.productId)).not.toContain("p1");
  });
});
