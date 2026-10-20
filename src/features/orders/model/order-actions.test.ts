import { describe, expect, it } from "vitest";

import { availableOrderActions } from "./order-actions";

const now = new Date("2026-10-20T12:00:00Z");
const later = new Date("2026-10-27T12:00:00Z");
const earlier = new Date("2026-10-19T12:00:00Z");

describe("availableOrderActions", () => {
  it("offers capture and cancel on an open authorization", () => {
    const order = {
      status: "authorized",
      expiresAt: later,
      capturedAmount: 0,
      refundedAmount: 0,
    } as const;
    expect(availableOrderActions(order, now)).toEqual(["capture", "cancel"]);
  });

  it("offers all three on a part-captured order", () => {
    const order = {
      status: "part_captured",
      expiresAt: later,
      capturedAmount: 500,
      refundedAmount: 0,
    } as const;
    expect(availableOrderActions(order, now)).toEqual(["capture", "refund", "cancel"]);
  });

  it("offers no capture once the authorization has run out", () => {
    const order = {
      status: "authorized",
      expiresAt: earlier,
      capturedAmount: 0,
      refundedAmount: 0,
    } as const;
    expect(availableOrderActions(order, now)).toEqual(["cancel"]);
  });

  it("offers only refund on a captured order, and nothing once it is fully refunded", () => {
    const captured = {
      status: "captured",
      expiresAt: later,
      capturedAmount: 500,
      refundedAmount: 100,
    } as const;
    const refunded = {
      status: "refunded",
      expiresAt: later,
      capturedAmount: 500,
      refundedAmount: 500,
    } as const;
    expect(availableOrderActions(captured, now)).toEqual(["refund"]);
    expect(availableOrderActions(refunded, now)).toEqual([]);
  });
});
