import { describe, expect, it } from "vitest";

import type { PlaceOrderInput } from "../src/features/orders/model/create-order-input.ts";
import { catalogProducts } from "../src/features/orders/model/store-catalogs.ts";
import { cronRange, nextDelay, pickOrder } from "./order-cron.ts";
import { readPersonas } from "./night-shift.ts";

const sequence = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

describe("nextDelay", () => {
  it("waits from 5 to 15 seconds by default", () => {
    expect(nextDelay(() => 0)).toBe(5000);
    expect(nextDelay(() => 0.999999)).toBe(15000);
  });

  it("stays inside the range it is given", () => {
    expect(nextDelay(() => 0, 2000, 8000)).toBe(2000);
    expect(nextDelay(() => 0.999999, 2000, 8000)).toBe(8000);
  });
});

describe("cronRange", () => {
  it("reads a range in seconds as milliseconds", () => {
    expect(cronRange.parse("2-10")).toEqual([2000, 10000]);
    expect(cronRange.parse("0.5-1.5")).toEqual([500, 1500]);
  });

  it("refuses ranges that are not a range of at least 1 ms", () => {
    expect(cronRange.safeParse("10-2").success).toBe(false);
    expect(cronRange.safeParse("0-5").success).toBe(false);
    expect(cronRange.safeParse("0.0001-0.0002").success).toBe(false);
    expect(cronRange.safeParse("abc").success).toBe(false);
  });
});

describe("pickOrder", () => {
  const personas = readPersonas();
  const storeId = personas.flatMap((persona) => Object.values(persona.data.stores))[0].id;
  const customers = personas.map((persona) => persona.data.customer);

  it("builds an order that passes the create-order checks", () => {
    const random = sequence([0.1, 0.5, 0.9, 0.3, 0.7, 0.2]);
    const order = pickOrder([storeId], personas, random) as PlaceOrderInput;
    expect(order.storeId).toBe(storeId);
    expect(customers).toContainEqual(order.customer);
    expect(order.lines.some((line) => line.type === "physical")).toBe(true);
  });

  it("never lists the same product twice", () => {
    const products = catalogProducts(storeId).length;
    for (let i = 0; i < 50; i++) {
      const order = pickOrder([storeId], personas, () => Math.random()) as PlaceOrderInput;
      const names = order.lines
        .filter((line) => line.type !== "shipping_fee")
        .map((line) => line.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names.length).toBeLessThanOrEqual(Math.min(3, products));
    }
  });

  it("says why no order was made", () => {
    expect(pickOrder([], personas, () => 0.5)).toBe("the account has no stores");
    expect(pickOrder(["00000000-0000-4000-8000-000000000000"], personas, () => 0.5)).toBe(
      "no customer shops at any of the account's stores",
    );
  });
});
