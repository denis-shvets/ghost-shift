import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildSeedOrders, toSql, type SeedOrder } from "./generate-seed-orders.ts";

const NOW = new Date("2026-10-19T00:00:00Z").getTime();
const orders = buildSeedOrders();
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const byReference = (reference: string) => orders.find((order) => order.reference === reference);

describe("buildSeedOrders", () => {
  it("makes between 150 and 220 orders with unique references", () => {
    expect(orders.length).toBeGreaterThanOrEqual(150);
    expect(orders.length).toBeLessThanOrEqual(220);
    expect(new Set(orders.map((order) => order.reference)).size).toBe(orders.length);
  });

  it("covers every status and payment method", () => {
    const statuses = new Set(orders.map((order) => order.status));
    const methods = new Set(orders.map((order) => order.paymentMethod));

    expect([...statuses].sort()).toEqual(
      ["authorized", "canceled", "captured", "expired", "part_captured", "refunded"].sort(),
    );
    expect([...methods].sort()).toEqual(
      ["amazon_pay", "amex", "apple_pay", "bank_transfer", "card", "google_pay", "paypal"].sort(),
    );
  });

  it("follows the amount and status rules", () => {
    for (const order of orders) {
      const { totalAmount: total, capturedAmount: captured, refundedAmount: refunded } = order;
      const open = order.expiresAt.getTime() > NOW;

      expect(order.lines.length).toBeGreaterThan(0);
      expect(total).toBe(sum(order.lines.map((line) => line.unitPrice * line.quantity)));
      expect(refunded).toBeLessThanOrEqual(captured);
      expect(captured).toBeLessThanOrEqual(total);

      switch (order.status) {
        case "authorized":
          expect(open).toBe(true);
          expect([captured, refunded]).toEqual([0, 0]);
          break;
        case "part_captured":
          expect(open).toBe(true);
          expect(captured).toBeGreaterThan(0);
          expect(captured).toBeLessThan(total);
          break;
        case "captured":
          expect(captured).toBe(total);
          expect(refunded).toBeLessThan(captured);
          break;
        case "refunded":
          expect(captured).toBeGreaterThan(0);
          expect(refunded).toBe(captured);
          break;
        case "expired":
          expect(open).toBe(false);
          expect([captured, refunded]).toEqual([0, 0]);
          break;
        case "canceled":
          expect([captured, refunded]).toEqual([0, 0]);
          break;
      }
    }
  });

  it("keeps event times in order, never after NOW, and sums the amounts", () => {
    for (const order of orders) {
      const times = order.events.map((event) => event.occurredAt.getTime());

      expect(times[0]).toBe(order.createdAt.getTime());
      expect(times.slice(1).every((time) => time > order.createdAt.getTime() && time <= NOW)).toBe(
        true,
      );
      expect(times).toEqual([...times].sort((a, b) => a - b));

      const captured = order.events.filter((event) => event.action === "captured");
      const refunded = order.events.filter((event) => event.action === "refunded");
      expect(sum(captured.map((event) => event.metadata.amount as number))).toBe(
        order.capturedAmount,
      );
      expect(sum(refunded.map((event) => event.metadata.amount as number))).toBe(
        order.refundedAmount,
      );
      expect(order.events.every((event) => event.actorName.length > 0)).toBe(true);
    }
  });

  it("gives every order a billing and a shipping address", () => {
    for (const order of orders) {
      expect(order.addresses.map((address) => address.kind).sort()).toEqual([
        "billing",
        "shipping",
      ]);
    }
  });

  it("gives the same output every time it runs", () => {
    expect(toSql(buildSeedOrders())).toBe(toSql(buildSeedOrders()));
  });

  it("matches supabase/seed-orders.sql, so the file is regenerated, not edited by hand", () => {
    const file = readFileSync(new URL("../supabase/seed-orders.sql", import.meta.url), "utf8");
    expect(file).toBe(toSql(buildSeedOrders()));
  });

  it("keeps the five original fixed orders unchanged", () => {
    const original = [
      ["MG-1001", "743bf9c5-f7a6-47d6-b1cb-bf9811f8b922", "authorized", "card", 129000, 0, 0],
      [
        "MG-1002",
        "a04509c1-b524-494a-8662-8d6ed7bcfc8d",
        "captured",
        "bank_transfer",
        54700,
        54700,
        0,
      ],
      ["MG-1003", "29fb84e7-03da-44f2-9389-dbbe9e12d3f3", "captured", "paypal", 12000, 12000, 4000],
      ["MG-1004", "fc14a20f-334f-4f9a-9b7f-162626167f1f", "expired", "card", 215000, 0, 0],
      ["NB-2001", "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b", "authorized", "card", 45000, 0, 0],
    ] as const;

    for (const [reference, id, status, method, total, captured, refunded] of original) {
      const order = byReference(reference) as SeedOrder;
      expect([order.id, order.status, order.paymentMethod]).toEqual([id, status, method]);
      expect([order.totalAmount, order.capturedAmount, order.refundedAmount]).toEqual([
        total,
        captured,
        refunded,
      ]);
    }

    const mg1002 = byReference("MG-1002") as SeedOrder;
    expect(mg1002.customer).toMatchObject({ firstName: "Erik", lastName: "Holm" });
    expect(mg1002.shippingCarrier).toBe("DHL");
    expect(mg1002.shippingTracking).toBe("DHL-7781");
    expect(mg1002.lines.map((line) => [line.sku, line.quantity, line.unitPrice])).toEqual([
      ["CND-SET-03", 2, 24900],
      [null, 1, 4900],
    ]);
  });
});
