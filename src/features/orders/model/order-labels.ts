import type { orderEventAction, orderStatus, paymentMethod } from "../db/schema";

// What people read for each database value.
export const ORDER_STATUS_LABELS: Record<(typeof orderStatus.enumValues)[number], string> = {
  authorized: "Authorized",
  captured: "Captured",
  part_captured: "Partially captured",
  expired: "Expired",
  canceled: "Canceled",
  refunded: "Refunded",
};

export const PAYMENT_METHOD_LABELS: Record<(typeof paymentMethod.enumValues)[number], string> = {
  amazon_pay: "Amazon Pay",
  amex: "Amex",
  apple_pay: "Apple Pay",
  bank_transfer: "Bank transfer",
  card: "Card",
  google_pay: "Google Pay",
  paypal: "PayPal",
};

export const ORDER_EVENT_ACTION_LABELS: Record<
  (typeof orderEventAction.enumValues)[number],
  string
> = {
  authorized: "Authorized",
  captured: "Captured",
  refunded: "Refunded",
  canceled: "Canceled",
  expired: "Expired",
  shipped: "Shipped",
};
