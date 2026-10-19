export type SampleProduct = {
  sku: string;
  name: string;
  unitPrice: number;
  taxRate: number;
  type: "physical" | "digital";
};

// Generated once with faker (seed 1), then saved as test data so the list never changes.
export const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    sku: "SKU-0001",
    name: "Handmade Plastic Bacon",
    unitPrice: 15186,
    taxRate: 0,
    type: "physical",
  },
  {
    sku: "SKU-0002",
    name: "Fantastic Cotton Fish",
    unitPrice: 26987,
    taxRate: 600,
    type: "digital",
  },
  {
    sku: "SKU-0003",
    name: "Fantastic Steel Bacon",
    unitPrice: 33556,
    taxRate: 600,
    type: "digital",
  },
  {
    sku: "SKU-0004",
    name: "Elegant Bronze Shoes",
    unitPrice: 48417,
    taxRate: 600,
    type: "digital",
  },
  { sku: "SKU-0005", name: "Small Steel Bike", unitPrice: 2048, taxRate: 0, type: "digital" },
  {
    sku: "SKU-0006",
    name: "Electronic Gold Towels",
    unitPrice: 26705,
    taxRate: 1200,
    type: "physical",
  },
  {
    sku: "SKU-0007",
    name: "Practical Silk Bacon",
    unitPrice: 37532,
    taxRate: 2500,
    type: "digital",
  },
  {
    sku: "SKU-0008",
    name: "Frozen Rubber Bike",
    unitPrice: 22450,
    taxRate: 2500,
    type: "physical",
  },
  { sku: "SKU-0009", name: "Frozen Bamboo Bacon", unitPrice: 33974, taxRate: 0, type: "physical" },
  {
    sku: "SKU-0010",
    name: "Intelligent Aluminum Mouse",
    unitPrice: 7421,
    taxRate: 1200,
    type: "digital",
  },
  { sku: "SKU-0011", name: "Electronic Gold Salad", unitPrice: 20767, taxRate: 0, type: "digital" },
  {
    sku: "SKU-0012",
    name: "Oriental Granite Towels",
    unitPrice: 29369,
    taxRate: 2500,
    type: "physical",
  },
  { sku: "SKU-0013", name: "Elegant Silk Fish", unitPrice: 8351, taxRate: 2500, type: "physical" },
  {
    sku: "SKU-0014",
    name: "Refined Plastic Table",
    unitPrice: 31221,
    taxRate: 2500,
    type: "physical",
  },
  {
    sku: "SKU-0015",
    name: "Frozen Steel Gloves",
    unitPrice: 48246,
    taxRate: 1200,
    type: "digital",
  },
  {
    sku: "SKU-0016",
    name: "Elegant Wooden Gloves",
    unitPrice: 28962,
    taxRate: 600,
    type: "physical",
  },
  { sku: "SKU-0017", name: "Soft Marble Bacon", unitPrice: 30896, taxRate: 600, type: "digital" },
  { sku: "SKU-0018", name: "Small Cotton Table", unitPrice: 31206, taxRate: 0, type: "digital" },
  {
    sku: "SKU-0019",
    name: "Practical Wooden Chair",
    unitPrice: 6943,
    taxRate: 2500,
    type: "digital",
  },
  {
    sku: "SKU-0020",
    name: "Bespoke Rubber Shirt",
    unitPrice: 46159,
    taxRate: 1200,
    type: "physical",
  },
];
