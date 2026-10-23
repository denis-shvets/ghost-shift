import { describe, expect, it } from "vitest";

import { payoutAccountInput, storeSettingsInput } from "./store-settings-input";

const storeId = "b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b03";

describe("storeSettingsInput", () => {
  it("accepts blank optional fields, which mean not set", () => {
    const result = storeSettingsInput.safeParse({
      storeId,
      name: "Velour Vault",
      supportEmail: "",
      payoutAccountId: "",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a blank name and a malformed support email", () => {
    expect(
      storeSettingsInput.safeParse({ storeId, name: "   ", supportEmail: "", payoutAccountId: "" })
        .success,
    ).toBe(false);
    expect(
      storeSettingsInput.safeParse({
        storeId,
        name: "Velour Vault",
        supportEmail: "not-an-email",
        payoutAccountId: "",
      }).success,
    ).toBe(false);
  });
});

describe("payoutAccountInput", () => {
  it("accepts a full account number of digits only", () => {
    const base = { storeId, label: "Main", accountHolderName: "Northstar Threads AB" };

    expect(payoutAccountInput.safeParse({ ...base, accountNumber: "12340987" }).success).toBe(true);
    expect(payoutAccountInput.safeParse({ ...base, accountNumber: "1234-0987" }).success).toBe(
      false,
    );
    expect(payoutAccountInput.safeParse({ ...base, accountNumber: "1234" }).success).toBe(false);
  });
});
