import type { OrderStatus } from "./order-statuses";

// The status people see. An open authorization past its expiry reads as expired.
// shortcut: display only, the row stays authorized; replace with an expiry job when capture and cancel land
export function displayStatus(
  order: { status: OrderStatus; expiresAt: Date },
  now = new Date(),
): OrderStatus {
  const open = order.status === "authorized" || order.status === "part_captured";
  return open && order.expiresAt <= now ? "expired" : order.status;
}
