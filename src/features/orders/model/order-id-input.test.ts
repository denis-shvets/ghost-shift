import { describe, expect, it } from "vitest";

import { orderIdInput } from "./order-id-input";

describe("orderIdInput", () => {
  it("accepts an id string", () => {
    expect(orderIdInput.parse("29fb84e7-03da-44f2-9389-dbbe9e12d3f3")).toBe(
      "29fb84e7-03da-44f2-9389-dbbe9e12d3f3",
    );
  });

  it("rejects input that isn't a reasonable string", () => {
    expect(orderIdInput.safeParse(42).success).toBe(false);
    expect(orderIdInput.safeParse({ id: "x" }).success).toBe(false);
    expect(orderIdInput.safeParse("").success).toBe(false);
    expect(orderIdInput.safeParse("x".repeat(101)).success).toBe(false);
  });
});
