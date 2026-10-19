import { describe, expect, it } from "vitest";

import { createOrderInput } from "./create-order-input";

const storeId = "a04509c1-b524-494a-8662-8d6ed7bcfc8d";

const line = {
  type: "physical",
  name: "Widget",
  quantity: 2,
  unitPrice: 1999,
  taxRate: 600,
};

const valid = {
  storeId,
  shopper: { name: "Ada Lovelace", email: "ada@example.com", country: "GB" },
  paymentMethod: "card",
  shippingCarrier: "Swift",
  lines: [line],
};

describe("createOrderInput", () => {
  it("accepts a complete order", () => {
    expect(createOrderInput.parse(valid)).toEqual(valid);
  });

  it("requires at least one line and allows at most 50", () => {
    expect(createOrderInput.safeParse({ ...valid, lines: [] }).success).toBe(false);
    const fifty = Array.from({ length: 50 }, () => line);
    expect(createOrderInput.safeParse({ ...valid, lines: fifty }).success).toBe(true);
    const fiftyOne = [...fifty, line];
    expect(createOrderInput.safeParse({ ...valid, lines: fiftyOne }).success).toBe(false);
  });

  it("rejects a country code that is not two capital letters", () => {
    for (const country of ["us", "USA", "U"]) {
      const shopper = { ...valid.shopper, country };
      expect(createOrderInput.safeParse({ ...valid, shopper }).success).toBe(false);
    }
  });

  it("rejects an unknown payment method", () => {
    expect(createOrderInput.safeParse({ ...valid, paymentMethod: "cash" }).success).toBe(false);
  });

  it("rejects a positive discount", () => {
    const discount = { ...line, type: "discount", unitPrice: 500 };
    expect(createOrderInput.safeParse({ ...valid, lines: [discount] }).success).toBe(false);
  });

  it("accepts a negative discount", () => {
    const discount = { ...line, type: "discount", unitPrice: -500 };
    expect(createOrderInput.safeParse({ ...valid, lines: [discount] }).success).toBe(true);
  });

  it("rejects a negative price on a non-discount line", () => {
    const surcharge = { ...line, type: "surcharge", unitPrice: -1 };
    expect(createOrderInput.safeParse({ ...valid, lines: [surcharge] }).success).toBe(false);
  });

  it("accepts a zero price on a non-discount line", () => {
    expect(
      createOrderInput.safeParse({ ...valid, lines: [{ ...line, unitPrice: 0 }] }).success,
    ).toBe(true);
  });

  it("accepts the quantity and unit price limits", () => {
    const atLimit = [
      { ...line, quantity: 10000 },
      { ...line, unitPrice: 10_000_000 },
      { ...line, type: "discount", unitPrice: -10_000_000 },
    ];
    for (const edge of atLimit) {
      expect(createOrderInput.safeParse({ ...valid, lines: [edge] }).success).toBe(true);
    }
  });

  it("rejects a quantity or unit price just past the limits", () => {
    const pastLimit = [
      { ...line, quantity: 10001 },
      { ...line, unitPrice: 10_000_001 },
      { ...line, type: "discount", unitPrice: -10_000_001 },
    ];
    for (const over of pastLimit) {
      expect(createOrderInput.safeParse({ ...valid, lines: [over] }).success).toBe(false);
    }
  });

  it("rejects a tax rate above 10000 basis points and a quantity below 1", () => {
    expect(
      createOrderInput.safeParse({ ...valid, lines: [{ ...line, taxRate: 10001 }] }).success,
    ).toBe(false);
    expect(
      createOrderInput.safeParse({ ...valid, lines: [{ ...line, quantity: 0 }] }).success,
    ).toBe(false);
  });
});
