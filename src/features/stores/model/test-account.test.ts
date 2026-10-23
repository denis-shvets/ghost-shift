import { describe, expect, it } from "vitest";

import { testAccountFor } from "./test-account";

describe("testAccountFor", () => {
  it("builds a sample account from the store, with digits-only account numbers", () => {
    const account = testAccountFor({
      id: "b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b03",
      name: "Velour Vault",
      currency: "SEK",
    });

    expect(account.label).toBe("Test account (SEK)");
    expect(account.accountHolderName).toBe("Velour Vault");
    expect(account.accountNumber).toMatch(/^[0-9]{12}$/);
  });
});
