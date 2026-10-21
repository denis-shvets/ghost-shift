import { describe, expect, it } from "vitest";

import seedIds from "../../../shared/seed/seed-ids.json" with { type: "json" };

import {
  CATALOG_SIZE,
  type CatalogList,
  type StoreCatalog,
  STORE_CATALOGS,
  catalogItem,
  catalogProducts,
} from "./store-catalogs.ts";

// Each store's market code (used in SKUs), standard VAT in basis points.
const MARKETS: Record<keyof typeof seedIds.stores, { code: string; taxRate: number }> = {
  moonlightSweden: { code: "SE", taxRate: 2500 },
  moonlightFinland: { code: "FI", taxRate: 2550 },
  moonlightNorway: { code: "NO", taxRate: 2500 },
  nordicBikesGermany: { code: "DE", taxRate: 1900 },
};

const LISTS: CatalogList[] = ["physical", "digital"];

function catalogFor(storeId: string): StoreCatalog {
  const catalog = STORE_CATALOGS[storeId];
  if (!catalog) throw new Error(`no catalog for ${storeId}`);
  return catalog;
}

describe("STORE_CATALOGS", () => {
  it("has a catalog for every store in seed-ids.json and no other keys", () => {
    expect(Object.keys(STORE_CATALOGS).sort()).toEqual(Object.values(seedIds.stores).sort());
  });

  it("has exactly CATALOG_SIZE items per list, sorted by price with whole positive prices", () => {
    for (const catalog of Object.values(STORE_CATALOGS)) {
      for (const list of LISTS) {
        const products = catalog[list];
        expect(products).toHaveLength(CATALOG_SIZE);
        let previousPrice = 0;
        for (const product of products) {
          expect(Number.isInteger(product.unitPrice)).toBe(true);
          expect(product.unitPrice).toBeGreaterThan(previousPrice);
          previousPrice = product.unitPrice;
        }
      }
    }
  });

  it("numbers SKUs by market, type and position, unique across all stores", () => {
    const skus = new Set<string>();
    for (const [key, storeId] of Object.entries(seedIds.stores)) {
      const { code } = MARKETS[key as keyof typeof MARKETS];
      for (const list of LISTS) {
        const letter = list === "physical" ? "P" : "D";
        catalogFor(storeId)[list].forEach((product, index) => {
          const number = String(index + 1).padStart(2, "0");
          expect(product.sku).toBe(`${code}-${letter}-${number}`);
          skus.add(product.sku);
        });
      }
    }
    expect(skus.size).toBe(Object.keys(seedIds.stores).length * CATALOG_SIZE * 2);
  });

  it("gives each store unique names", () => {
    for (const catalog of Object.values(STORE_CATALOGS)) {
      const names = [...catalog.physical, ...catalog.digital].map((product) => product.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("uses the market's standard tax rate, or 0 only for gift cards", () => {
    for (const [key, storeId] of Object.entries(seedIds.stores)) {
      const { taxRate } = MARKETS[key as keyof typeof MARKETS];
      for (const list of LISTS) {
        for (const product of catalogFor(storeId)[list]) {
          const isGiftCard = /gift card/i.test(product.name);
          expect(product.taxRate).toBe(isGiftCard ? 0 : taxRate);
        }
      }
    }
  });
});

describe("catalogProducts", () => {
  const sweden = seedIds.stores.moonlightSweden;

  it("returns 50 products, physical first, each with its type", () => {
    const products = catalogProducts(sweden);
    const catalog = catalogFor(sweden);
    expect(products).toHaveLength(CATALOG_SIZE * 2);
    expect(products.slice(0, CATALOG_SIZE).every((product) => product.type === "physical")).toBe(
      true,
    );
    expect(products[0]).toEqual({ ...catalog.physical[0], type: "physical" });
    expect(products[CATALOG_SIZE]).toEqual({ ...catalog.digital[0], type: "digital" });
  });

  it("returns an empty list for an unknown store", () => {
    expect(catalogProducts("00000000-0000-4000-8000-000000000000")).toEqual([]);
    expect(catalogProducts("constructor")).toEqual([]);
  });
});

describe("catalogItem", () => {
  const sweden = seedIds.stores.moonlightSweden;

  it("returns the first and last item of a list with its type", () => {
    const catalog = catalogFor(sweden);
    expect(catalogItem(sweden, "physical", 1)).toEqual({
      ...catalog.physical[0],
      type: "physical",
    });
    expect(catalogItem(sweden, "digital", 25)).toEqual({ ...catalog.digital[24], type: "digital" });
  });

  it("returns undefined for numbers outside the list", () => {
    expect(catalogItem(sweden, "physical", 0)).toBeUndefined();
    expect(catalogItem(sweden, "physical", 26)).toBeUndefined();
    expect(catalogItem(sweden, "digital", 1.5)).toBeUndefined();
  });

  it("returns undefined for an unknown store", () => {
    expect(catalogItem("00000000-0000-4000-8000-000000000000", "physical", 1)).toBeUndefined();
    expect(catalogItem("constructor", "physical", 1)).toBeUndefined();
  });
});
