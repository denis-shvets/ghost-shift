// The order statuses, in one place: the database enum and the seed read them.
// The status follows the authorization only. Refunds are read from refunded_amount, so an
// order can be part captured and part refunded at the same time.
export const ORDER_STATUSES = [
  "authorized",
  "captured",
  "part_captured",
  "expired",
  "canceled",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
