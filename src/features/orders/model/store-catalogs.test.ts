import { describe, expect, it } from "vitest";

import seedIds from "../../../shared/seed/seed-ids.json" with { type: "json" };

import {
  CATALOG_SIZE,
  catalogPick,
  catalogProducts,
  PICK_MAX,
  STORE_CATALOGS,
} from "./store-catalogs.ts";

const storeIds = Object.values(seedIds.stores);

describe("STORE_CATALOGS", () => {
  it("has a catalog for every store in seed-ids.json and no other keys", () => {
    expect(Object.keys(STORE_CATALOGS).sort()).toEqual([...storeIds].sort());
  });

  it("has CATALOG_SIZE products per store, sorted by price with whole positive prices", () => {
    for (const storeId of storeIds) {
      const products = catalogProducts(storeId);
      expect(products).toHaveLength(CATALOG_SIZE);
      let previousPrice = 0;
      for (const product of products) {
        expect(Number.isInteger(product.unitPrice)).toBe(true);
        expect(product.unitPrice).toBeGreaterThan(previousPrice);
        previousPrice = product.unitPrice;
      }
    }
  });

  it("gives every product a physical or digital type", () => {
    for (const storeId of storeIds) {
      for (const product of catalogProducts(storeId)) {
        expect(["physical", "digital"]).toContain(product.type);
      }
    }
  });

  it("gives each store unique names", () => {
    for (const storeId of storeIds) {
      const names = catalogProducts(storeId).map((product) => product.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("gives every SKU a store code, unique across all stores", () => {
    const skus = storeIds.flatMap((storeId) =>
      catalogProducts(storeId).map((product) => product.sku),
    );
    expect(new Set(skus).size).toBe(skus.length);
    expect(skus.length).toBe(storeIds.length * CATALOG_SIZE);
  });

  it("uses the market's standard tax rate, or 0 only for gift cards", () => {
    const rates = new Set(
      storeIds.flatMap((storeId) => catalogProducts(storeId).map((product) => product.taxRate)),
    );
    expect(rates).toEqual(new Set([0, 1900, 2500, 2550]));
    for (const product of catalogProducts(seedIds.stores.plaidParade)) {
      expect(product.taxRate === 0).toBe(/gift card/i.test(product.name));
    }
  });
});

describe("catalogProducts", () => {
  it("returns the store's products in list order", () => {
    const products = catalogProducts(seedIds.stores.velourVault);
    expect(products).toHaveLength(CATALOG_SIZE);
    expect(products[0]).toMatchObject({ sku: "VV-FAS-01", type: "digital" });
  });

  it("returns nothing for an unknown store", () => {
    expect(catalogProducts("00000000-0000-4000-8000-000000000000")).toEqual([]);
    expect(catalogProducts("constructor")).toEqual([]);
  });
});

describe("catalogPick", () => {
  const sweden = seedIds.stores.velourVault;
  const physical = catalogProducts(sweden).filter((product) => product.type === "physical");
  const digital = catalogProducts(sweden).filter((product) => product.type === "digital");

  it("picks by type and position, 0 being the cheapest of that type", () => {
    expect(catalogPick(sweden, "physical", 0)).toEqual(physical[0]);
    expect(catalogPick(sweden, "digital", PICK_MAX)).toEqual(digital[PICK_MAX]);
  });

  it("has a pick for every position of both types, so the planner can cycle them all", () => {
    expect(physical).toHaveLength(PICK_MAX + 1);
    expect(digital).toHaveLength(PICK_MAX + 1);
    expect(PICK_MAX).toBeLessThan(CATALOG_SIZE / 2);
  });

  it("returns undefined outside 0 to PICK_MAX, or for a non-integer", () => {
    expect(catalogPick(sweden, "physical", -1)).toBeUndefined();
    expect(catalogPick(sweden, "physical", PICK_MAX + 1)).toBeUndefined();
    expect(catalogPick(sweden, "digital", 1.5)).toBeUndefined();
  });

  it("returns undefined for an unknown store", () => {
    expect(catalogPick("00000000-0000-4000-8000-000000000000", "physical", 0)).toBeUndefined();
    expect(catalogPick("constructor", "physical", 0)).toBeUndefined();
  });
});
