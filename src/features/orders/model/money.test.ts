import { describe, expect, it } from "vitest";

import { formatMoney, toMajorUnits, toMinorUnits } from "./money";

// Intl puts a no-break space (U+00A0) between the currency code and the number.
describe("formatMoney", () => {
  it("formats minor units as a currency amount", () => {
    expect(formatMoney(129000, "SEK")).toBe("SEK\u00a01,290.00");
    expect(formatMoney(4000, "EUR")).toBe("€40.00");
  });

  it("keeps the sign of negative amounts", () => {
    expect(formatMoney(-51200, "SEK")).toBe("-SEK\u00a0512.00");
  });
});

describe("toMinorUnits", () => {
  it("turns a form amount into minor units", () => {
    expect(toMinorUnits("12.50")).toBe(1250);
    // 0.29 * 100 is 28.999999999999996 in floating point, so it must be rounded.
    expect(toMinorUnits("0.29")).toBe(29);
  });

  it("gives NaN for an empty or non-numeric field", () => {
    expect(toMinorUnits("")).toBeNaN();
    expect(toMinorUnits("abc")).toBeNaN();
  });
});

describe("toMajorUnits", () => {
  it("turns minor units into a form amount with two decimals", () => {
    expect(toMajorUnits(1250)).toBe("12.50");
    expect(toMajorUnits(29)).toBe("0.29");
  });
});
