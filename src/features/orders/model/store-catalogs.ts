import seedIds from "../../../shared/seed/seed-ids.json" with { type: "json" };

export type SampleProduct = {
  sku: string;
  name: string;
  type: "physical" | "digital";
  unitPrice: number;
  taxRate: number;
};

export type Market = "SE" | "FI" | "NO" | "DE";
// Rates are rough and for demo data only. Tax rates are basis points: the market's standard VAT.
export const MARKETS: Record<Market, { rate: number; taxRate: number }> = {
  SE: { rate: 11, taxRate: 2500 },
  FI: { rate: 1, taxRate: 2550 },
  NO: { rate: 11.5, taxRate: 2500 },
  DE: { rate: 1, taxRate: 1900 },
};

// One list for every store, sorted by price in euro cents. Gift cards carry no VAT.
const CATALOG: readonly {
  sku: string;
  name: string;
  type: SampleProduct["type"];
  basePrice: number;
  vatFree?: true;
}[] = [
  { sku: "FAS-01", name: "Capsule wardrobe guide, e-book", type: "digital", basePrice: 990 },
  { sku: "FAS-02", name: "Sewing pattern, tote bag, PDF", type: "digital", basePrice: 1290 },
  { sku: "FAS-03", name: "Cotton basic tee", type: "physical", basePrice: 1490 },
  { sku: "FAS-04", name: "Color palette guide, PDF", type: "digital", basePrice: 1590 },
  { sku: "FAS-05", name: "Striped knit socks, 3 pairs", type: "physical", basePrice: 1990 },
  { sku: "FAS-06", name: "Lookbook download, spring", type: "digital", basePrice: 2090 },
  { sku: "FAS-07", name: "Canvas tote bag", type: "physical", basePrice: 2490 },
  { sku: "FAS-08", name: "Gift card, 25 EUR", type: "digital", basePrice: 2500, vatFree: true },
  { sku: "FAS-09", name: "Knitting pattern bundle, 10 designs", type: "digital", basePrice: 2690 },
  { sku: "FAS-10", name: "Wool beanie", type: "physical", basePrice: 2990 },
  { sku: "FAS-11", name: "Denim cap", type: "physical", basePrice: 3490 },
  { sku: "FAS-12", name: "Shoe care masterclass", type: "digital", basePrice: 3590 },
  { sku: "FAS-13", name: "Linen scarf", type: "physical", basePrice: 3990 },
  { sku: "FAS-14", name: "Wardrobe planner app, 12 months", type: "digital", basePrice: 4090 },
  { sku: "FAS-15", name: "Leather belt", type: "physical", basePrice: 4990 },
  { sku: "FAS-16", name: "Gift card, 50 EUR", type: "digital", basePrice: 5000, vatFree: true },
  { sku: "FAS-17", name: "Virtual styling session, 30 min", type: "digital", basePrice: 5090 },
  { sku: "FAS-18", name: "Oxford button-down shirt", type: "physical", basePrice: 5990 },
  { sku: "FAS-19", name: "Tailoring basics, video course", type: "digital", basePrice: 6090 },
  { sku: "FAS-20", name: "Fashion trend report, annual", type: "digital", basePrice: 6990 },
  { sku: "FAS-21", name: "Corduroy trousers", type: "physical", basePrice: 7990 },
  { sku: "FAS-22", name: "Knit cardigan", type: "physical", basePrice: 8990 },
  { sku: "FAS-23", name: "Personal stylist, 1 hour", type: "digital", basePrice: 9090 },
  { sku: "FAS-24", name: "Gift card, 100 EUR", type: "digital", basePrice: 10000, vatFree: true },
  { sku: "FAS-25", name: "Quilted down vest", type: "physical", basePrice: 11990 },
  { sku: "FAS-26", name: "Waterproof rain jacket", type: "physical", basePrice: 12990 },
  { sku: "FAS-27", name: "Closet audit, online", type: "digital", basePrice: 13090 },
  { sku: "FAS-28", name: "Silk blouse", type: "physical", basePrice: 14990 },
  { sku: "FAS-29", name: "Leather ankle boots", type: "physical", basePrice: 17990 },
  { sku: "FAS-30", name: "Wool overcoat", type: "physical", basePrice: 25990 },
];

export const CATALOG_SIZE = CATALOG.length;

// The highest `pick` a planner may answer: the index of the last item, so each type has PICK_MAX + 1 items.
export const PICK_MAX =
  Math.min(
    ...(["physical", "digital"] as const).map(
      (type) => CATALOG.filter((p) => p.type === type).length,
    ),
  ) - 1;

// Each store's code (prefixes its SKUs) and market (its currency and VAT).
const STORE_MARKETS: Readonly<Record<string, { code: string; market: Market }>> = {
  [seedIds.stores.larkLoomStockholm]: { code: "LS", market: "SE" },
  [seedIds.stores.hemlineHelsinki]: { code: "HH", market: "FI" },
  [seedIds.stores.velourVault]: { code: "VV", market: "SE" },
  [seedIds.stores.mossAndMirror]: { code: "MM", market: "SE" },
  [seedIds.stores.ginghamGalaxy]: { code: "GG", market: "DE" },
  [seedIds.stores.cobaltCloset]: { code: "CC", market: "DE" },
  [seedIds.stores.silkPineOslo]: { code: "SP", market: "NO" },
  [seedIds.stores.tangerineThread]: { code: "TT", market: "NO" },
  [seedIds.stores.fjordFabric]: { code: "FF", market: "NO" },
  [seedIds.stores.plaidParade]: { code: "PP", market: "FI" },
  [seedIds.stores.woolWhisper]: { code: "WW", market: "FI" },
  [seedIds.stores.denimDune]: { code: "DD", market: "SE" },
  [seedIds.stores.linenLantern]: { code: "LL", market: "DE" },
  [seedIds.stores.corduroyComet]: { code: "CO", market: "FI" },
  [seedIds.stores.rayonRhapsody]: { code: "RR", market: "SE" },
  [seedIds.stores.chiffonCascade]: { code: "CH", market: "NO" },
  [seedIds.stores.thimbleThyme]: { code: "TH", market: "DE" },
  [seedIds.stores.satinSparrow]: { code: "SS", market: "DE" },
  [seedIds.stores.buttonBazaar]: { code: "BB", market: "SE" },
  [seedIds.stores.zipperZenith]: { code: "ZZ", market: "FI" },
};

export const STORE_CATALOGS: Readonly<Record<string, readonly SampleProduct[]>> =
  Object.fromEntries(
    Object.entries(STORE_MARKETS).map(([storeId, { code, market }]) => {
      const { rate, taxRate } = MARKETS[market];
      return [
        storeId,
        CATALOG.map(({ basePrice, vatFree, ...product }) => ({
          ...product,
          sku: `${code}-${product.sku}`,
          unitPrice: Math.round(basePrice * rate),
          taxRate: vatFree ? 0 : taxRate,
        })),
      ];
    }),
  );

// A store's products in list order. Empty for an unknown store.
// A copy, so callers may splice it without changing the shared catalog.
export function catalogProducts(storeId: string): SampleProduct[] {
  return Object.hasOwn(STORE_CATALOGS, storeId) ? [...STORE_CATALOGS[storeId]!] : [];
}

// The item at position `pick` (0 is the cheapest) among a store's products of one type, or undefined.
export function catalogPick(
  storeId: string,
  type: SampleProduct["type"],
  pick: number,
): SampleProduct | undefined {
  if (!Number.isInteger(pick) || pick < 0 || pick > PICK_MAX) return undefined;
  return catalogProducts(storeId).filter((product) => product.type === type)[pick];
}
