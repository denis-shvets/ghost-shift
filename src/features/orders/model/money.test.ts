import { describe, expect, it } from "vitest";

import { formatMoney } from "./money";

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
