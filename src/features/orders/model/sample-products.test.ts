import { describe, expect, it } from "vitest";

import { SAMPLE_PRODUCTS } from "./sample-products";

describe("SAMPLE_PRODUCTS", () => {
  it("has 20 products with unique skus", () => {
    expect(SAMPLE_PRODUCTS).toHaveLength(20);
    expect(new Set(SAMPLE_PRODUCTS.map((product) => product.sku)).size).toBe(20);
  });

  it("keeps prices as whole minor units inside the range", () => {
    for (const product of SAMPLE_PRODUCTS) {
      expect(Number.isInteger(product.unitPrice)).toBe(true);
      expect(product.unitPrice).toBeGreaterThanOrEqual(100);
      expect(product.unitPrice).toBeLessThanOrEqual(50000);
    }
  });

  it("uses only the allowed tax rates and product types", () => {
    for (const product of SAMPLE_PRODUCTS) {
      expect([0, 600, 1200, 2500]).toContain(product.taxRate);
      expect(["physical", "digital"]).toContain(product.type);
    }
  });
});
