import { z } from "zod";

import { ORDER_EVENT_ACTIONS } from "~/features/orders/model/order-event";
import { optionalParam } from "~/shared/validation/optional-param";

// What a caller may send to list the activity log. The cursor is the id of an event on the page
// next to the one wanted: "next" lists the older events, "prev" the newer ones.
// action and storeId narrow the list; the audit log and refunds page keep them in the URL.
export const activityListInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: optionalParam(z.uuid()),
  direction: optionalParam(z.enum(["next", "prev"])),
  action: optionalParam(z.enum(ORDER_EVENT_ACTIONS)),
  // The "All stores" option sends storeId as "", which optionalParam treats as no filter.
  storeId: optionalParam(z.uuid()),
});

export type ActivityListInput = z.infer<typeof activityListInput>;
