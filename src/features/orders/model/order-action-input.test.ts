import { describe, expect, it } from "vitest";

import { ORDER_ACTION_TOOLS, orderActionInput } from "./order-action-input";

const orderId = "743bf9c5-f7a6-47d6-b1cb-bf9811f8b922";

describe("orderActionInput", () => {
  it("accepts a capture, a refund and a cancel, and trims the reason", () => {
    expect(
      orderActionInput.parse({ action: "capture", orderId, amount: 500, reason: " Shipped " }),
    ).toEqual({ action: "capture", orderId, amount: 500, reason: "Shipped" });
    expect(
      orderActionInput.safeParse({ action: "refund", orderId, amount: 1, reason: "Damaged" })
        .success,
    ).toBe(true);
    expect(
      orderActionInput.safeParse({ action: "cancel", orderId, reason: "Out of stock" }).success,
    ).toBe(true);
  });

  it("takes an optional agent run id", () => {
    const agentRunId = "5a3b1e00-0000-4000-8000-000000000001";
    expect(
      orderActionInput.parse({ action: "cancel", orderId, reason: "Out of stock", agentRunId }),
    ).toEqual({ action: "cancel", orderId, reason: "Out of stock", agentRunId });
  });

  it.each([
    ["no reason", { action: "cancel", orderId }],
    ["a blank reason", { action: "cancel", orderId, reason: "   " }],
    ["a reason over 500 characters", { action: "cancel", orderId, reason: "x".repeat(501) }],
    ["no amount", { action: "capture", orderId, reason: "Shipped" }],
    ["a zero amount", { action: "refund", orderId, amount: 0, reason: "Damaged" }],
    ["a fractional amount", { action: "capture", orderId, amount: 1.5, reason: "Shipped" }],
    ["a bad order id", { action: "cancel", orderId: "NS-1001", reason: "Out of stock" }],
    ["an unknown action", { action: "void", orderId, reason: "Because" }],
    ["a bad agent run id", { action: "cancel", orderId, reason: "Because", agentRunId: "run-1" }],
  ])("refuses %s", (_, input) => {
    expect(orderActionInput.safeParse(input).success).toBe(false);
  });
});

describe("ORDER_ACTION_TOOLS", () => {
  it("has one tool per action, whose input leaves the action out", () => {
    expect(ORDER_ACTION_TOOLS.map((tool) => tool.name)).toEqual([
      "capture_order",
      "refund_order",
      "cancel_order",
    ]);
    const cancel = ORDER_ACTION_TOOLS.find((tool) => tool.action === "cancel")!;
    expect(cancel.input.parse({ orderId, reason: "Out of stock" })).toEqual({
      orderId,
      reason: "Out of stock",
    });
    expect(Object.keys(cancel.input.shape)).not.toContain("agentRunId");
  });
});
