import { z } from "zod";

import { optionalParam } from "~/shared/validation/optional-param";

import { ORDER_STATUSES } from "./order-statuses";
import { PAYMENT_METHODS } from "./payment-methods";

// What a caller may send to list orders. The cursor is the id of an order on the page
// next to the one wanted: "next" lists the orders older than it, "prev" the newer ones.
// q is an exact order reference or customer email (ignoring case). The filters are optional.
export const orderListInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: optionalParam(z.uuid()),
  direction: optionalParam(z.enum(["next", "prev"])),
  // coerce: the router parses search values as JSON, so "1003" can arrive as a number.
  q: optionalParam(z.coerce.string().trim().max(200)),
  status: optionalParam(z.enum(ORDER_STATUSES)),
  storeId: optionalParam(z.uuid()),
  paymentMethod: optionalParam(z.enum(PAYMENT_METHODS)),
});

export type OrderListInput = z.infer<typeof orderListInput>;

// Query strings are text, so limit is turned into a number first. An empty limit counts as not sent.
// Pagination is by cursor, not page number.
export const orderListQuery = orderListInput.extend({
  limit: optionalParam(z.coerce.number().int().min(1).max(100)).default(50),
});
