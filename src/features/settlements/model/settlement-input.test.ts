import { describe, expect, it } from "vitest";

import { scheduleInput } from "./settlement-input";

const valid = {
  storeId: "b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b01",
  frequency: "weekly",
  payoutAccountId: "c3f5e9a4-6d7f-4e0c-9a32-4b8d9e0f1c02",
};

describe("scheduleInput", () => {
  it("accepts weekly and monthly schedules", () => {
    expect(scheduleInput.safeParse(valid).success).toBe(true);
    expect(scheduleInput.safeParse({ ...valid, frequency: "monthly" }).success).toBe(true);
  });

  it("rejects other frequencies and malformed ids", () => {
    expect(scheduleInput.safeParse({ ...valid, frequency: "daily" }).success).toBe(false);
    expect(scheduleInput.safeParse({ ...valid, storeId: "nope" }).success).toBe(false);
  });
});
