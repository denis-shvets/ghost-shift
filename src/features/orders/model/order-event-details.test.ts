import { describe, expect, it } from "vitest";

import { describeEvent } from "./order-event-details";
import type { OrderEvent } from "./order-event";

// formatMoney puts a non-breaking space (U+00A0) between the currency code and the amount.
const NBSP = " ";
const base = { id: "e1", occurredAt: new Date("2026-01-01T00:00:00Z"), actorName: "Ada" };

describe("describeEvent", () => {
  it("describes an authorization", () => {
    const event: OrderEvent = { ...base, action: "authorized", metadata: { amount: 129000 } };
    expect(describeEvent(event, "SEK")).toBe(`Amount SEK${NBSP}1,290.00`);
  });

  it("describes a capture with and without lines", () => {
    const plain: OrderEvent = { ...base, action: "captured", metadata: { amount: 50000 } };
    const withLines: OrderEvent = {
      ...base,
      action: "captured",
      metadata: {
        amount: 50000,
        lines: [
          { position: 1, quantity: 1 },
          { position: 2, quantity: 2 },
        ],
      },
    };
    expect(describeEvent(plain, "SEK")).toBe(`Captured SEK${NBSP}500.00`);
    expect(describeEvent(withLines, "SEK")).toBe(`Captured SEK${NBSP}500.00 (lines 1, 2)`);
  });

  it("describes a refund with and without reason and lines", () => {
    const plain: OrderEvent = { ...base, action: "refunded", metadata: { amount: 20000 } };
    const full: OrderEvent = {
      ...base,
      action: "refunded",
      metadata: { amount: 20000, reason: "Damaged", lines: [{ position: 3, quantity: 1 }] },
    };
    expect(describeEvent(plain, "SEK")).toBe(`Refunded SEK${NBSP}200.00`);
    expect(describeEvent(full, "SEK")).toBe(`Refunded SEK${NBSP}200.00 – Damaged (lines 3)`);
  });

  it("describes a canceled authorization as released", () => {
    const canceled: OrderEvent = {
      ...base,
      action: "canceled",
      metadata: { releasedAmount: 10000 },
    };
    expect(describeEvent(canceled, "SEK")).toBe(`Released SEK${NBSP}100.00`);
  });

  it("adds the reason to a capture and a cancel", () => {
    const captured: OrderEvent = {
      ...base,
      action: "captured",
      metadata: { amount: 50000, reason: "Shipped" },
    };
    const canceled: OrderEvent = {
      ...base,
      action: "canceled",
      metadata: { releasedAmount: 10000, reason: "Out of stock" },
    };
    expect(describeEvent(captured, "SEK")).toBe(`Captured SEK${NBSP}500.00 – Shipped`);
    expect(describeEvent(canceled, "SEK")).toBe(`Released SEK${NBSP}100.00 – Out of stock`);
  });

  it("describes an expired authorization as released, with the reason", () => {
    const expired: OrderEvent = {
      ...base,
      action: "expired",
      metadata: { releasedAmount: 23000, reason: "Authorization expired after 7 days" },
    };
    expect(describeEvent(expired, "SEK")).toBe(
      `Released SEK${NBSP}230.00 – Authorization expired after 7 days`,
    );
  });
});
