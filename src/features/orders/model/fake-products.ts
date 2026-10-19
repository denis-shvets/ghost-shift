import { faker } from "@faker-js/faker/locale/en";

export type FakeProduct = {
  sku: string;
  name: string;
  unitPrice: number;
  taxRate: number;
  type: "physical" | "digital";
};

// The same seed always gives the same list, so the server and the browser agree.
// faker keeps its seed in global state, so this must not run in two places at once.
export function generateProducts(seed: number, count: number): FakeProduct[] {
  faker.seed(seed);
  return Array.from({ length: count }, (_, index) => ({
    sku: `SKU-${String(index + 1).padStart(4, "0")}`,
    name: faker.commerce.productName(),
    unitPrice: faker.number.int({ min: 100, max: 50000 }),
    taxRate: faker.helpers.arrayElement([0, 600, 1200, 2500]),
    type: faker.helpers.arrayElement(["physical", "digital"] as const),
  }));
}
