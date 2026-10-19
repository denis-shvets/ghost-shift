import { describe, expect, it } from "vitest";

import { generateProducts } from "./fake-products";

describe("generateProducts", () => {
  it("returns the same list for the same seed", () => {
    expect(generateProducts(42, 10)).toEqual(generateProducts(42, 10));
  });

  it("returns a different list for a different seed", () => {
    expect(generateProducts(42, 10)).not.toEqual(generateProducts(43, 10));
  });

  it("returns the requested number of products with unique skus", () => {
    const products = generateProducts(7, 25);
    expect(products).toHaveLength(25);
    expect(new Set(products.map((p) => p.sku)).size).toBe(25);
  });

  it("keeps prices as whole minor units inside the range", () => {
    for (const product of generateProducts(7, 50)) {
      expect(Number.isInteger(product.unitPrice)).toBe(true);
      expect(product.unitPrice).toBeGreaterThanOrEqual(100);
      expect(product.unitPrice).toBeLessThanOrEqual(50000);
    }
  });

  it("uses only the allowed tax rates and product types", () => {
    for (const product of generateProducts(7, 50)) {
      expect([0, 600, 1200, 2500]).toContain(product.taxRate);
      expect(["physical", "digital"]).toContain(product.type);
    }
  });
});
