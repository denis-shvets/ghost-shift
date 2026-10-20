import { z } from "zod";

import { ORDER_EVENT_ACTIONS } from "~/features/orders/model/order-event";

// What a caller may send to list the activity log. The cursor is the id of an event on the page
// next to the one wanted: "next" lists the older events, "prev" the newer ones.
// action and storeId narrow the list; the audit log and refunds page keep them in the URL.
export const activityListInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
  direction: z.enum(["next", "prev"]).optional(),
  action: z.enum(ORDER_EVENT_ACTIONS).optional(),
  // A GET form's "All stores" option sends storeId as "", which means no filter.
  storeId: z.preprocess((value) => value || undefined, z.uuid().optional()),
});

export type ActivityListInput = z.infer<typeof activityListInput>;
