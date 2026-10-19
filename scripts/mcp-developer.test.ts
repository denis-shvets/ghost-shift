import { describe, expect, it } from "vitest";

import { createOrderInput } from "../src/features/orders/model/create-order-input.ts";

import { apiErrorText, isLocalUrl, productsInput } from "./mcp-developer.ts";

const validOrder = {
  storeId: "00000000-0000-4000-8000-000000000001",
  shopper: { name: "Test Shopper", email: "shopper@example.com", country: "DE" },
  paymentMethod: "card",
  shippingCarrier: "Test Carrier",
  lines: [{ type: "physical", name: "Widget", quantity: 2, unitPrice: 1000, taxRate: 1900 }],
};

describe("isLocalUrl", () => {
  it("accepts this machine", () => {
    expect(isLocalUrl("http://127.0.0.1:64321")).toBe(true);
    expect(isLocalUrl("http://localhost:3000")).toBe(true);
  });

  it("rejects any other host", () => {
    expect(isLocalUrl("https://example.com")).toBe(false);
    expect(isLocalUrl("https://abc.supabase.co")).toBe(false);
    expect(isLocalUrl("http://localhost.evil.example")).toBe(false);
  });
});

describe("list_sample_products input", () => {
  it("accepts a count from 1 to 20 and no input", () => {
    expect(productsInput.safeParse({}).success).toBe(true);
    expect(productsInput.safeParse({ count: 1 }).success).toBe(true);
    expect(productsInput.safeParse({ count: 20 }).success).toBe(true);
  });

  it("rejects a count above 20", () => {
    expect(productsInput.safeParse({ count: 21 }).success).toBe(false);
  });
});

describe("create_order input", () => {
  it("accepts a valid order", () => {
    expect(createOrderInput.safeParse(validOrder).success).toBe(true);
  });

  it("rejects a positive discount and an empty order", () => {
    const discount = {
      ...validOrder,
      lines: [{ type: "discount", name: "Promo", quantity: 1, unitPrice: 500, taxRate: 0 }],
    };
    expect(createOrderInput.safeParse(discount).success).toBe(false);
    expect(createOrderInput.safeParse({ ...validOrder, lines: [] }).success).toBe(false);
  });
});

describe("apiErrorText", () => {
  it("includes the status and the API message", () => {
    expect(apiErrorText(403, { error: "Forbidden" })).toBe("HTTP 403: Forbidden");
  });

  it("adds the validation issues as path and message", () => {
    expect(
      apiErrorText(400, {
        error: "Invalid input",
        issues: [{ path: ["lines"], message: "Too small" }],
      }),
    ).toBe("HTTP 400: Invalid input (lines: Too small)");
  });
});
