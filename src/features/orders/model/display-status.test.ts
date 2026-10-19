import { describe, expect, it } from "vitest";

import { displayStatus } from "./display-status";

const now = new Date("2026-10-20T12:00:00Z");
const past = new Date("2026-10-20T11:59:00Z");
const future = new Date("2026-10-20T12:01:00Z");

describe("displayStatus", () => {
  it("shows an open authorization past its expiry as expired", () => {
    expect(displayStatus({ status: "authorized", expiresAt: past }, now)).toBe("expired");
    expect(displayStatus({ status: "part_captured", expiresAt: now }, now)).toBe("expired");
  });

  it("keeps the status while the authorization is still open", () => {
    expect(displayStatus({ status: "authorized", expiresAt: future }, now)).toBe("authorized");
  });

  it("keeps a closed status after the expiry", () => {
    expect(displayStatus({ status: "captured", expiresAt: past }, now)).toBe("captured");
    expect(displayStatus({ status: "canceled", expiresAt: past }, now)).toBe("canceled");
  });
});
