import { describe, expect, it } from "vitest";

import { formatTaxRate } from "./tax-rate";

describe("formatTaxRate", () => {
  it("formats basis points as a percentage", () => {
    expect(formatTaxRate(2500)).toBe("25%");
    expect(formatTaxRate(2550)).toBe("25.5%");
    expect(formatTaxRate(0)).toBe("0%");
  });
});
