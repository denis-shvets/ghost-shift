import type { OrderAction } from "./order-action-input";
import type { OrderStatus } from "./order-statuses";

type ActionableOrder = {
  status: OrderStatus;
  expiresAt: Date;
  capturedAmount: number;
  refundedAmount: number;
};

// Which action forms the order page shows. A hint only: the database trigger decides.
// `now` comes from the loader, so the server render and hydration agree.
export function availableOrderActions(order: ActionableOrder, now: Date): OrderAction[] {
  const open = order.status === "authorized" || order.status === "part_captured";
  const actions: OrderAction[] = [];
  if (open && order.expiresAt > now) actions.push("capture");
  if (order.capturedAmount > order.refundedAmount) actions.push("refund");
  if (open) actions.push("cancel");
  return actions;
}
