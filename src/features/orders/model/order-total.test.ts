import { describe, expect, it } from "vitest";

import { lineTotal, orderTotal } from "./order-total";

describe("order totals", () => {
  it("multiplies unit price by quantity", () => {
    expect(lineTotal({ unitPrice: 1250, quantity: 3 })).toBe(3750);
  });

  it("adds negative discount lines", () => {
    expect(
      orderTotal([
        { unitPrice: 1000, quantity: 2 },
        { unitPrice: -500, quantity: 1 },
      ]),
    ).toBe(1500);
  });

  it("is zero with no lines", () => {
    expect(orderTotal([])).toBe(0);
  });
});
