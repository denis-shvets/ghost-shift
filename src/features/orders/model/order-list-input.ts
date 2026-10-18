import { z } from "zod";

// What a caller may send to list orders. The cursor is the id of an order on the page
// next to the one wanted: "next" lists the orders older than it, "prev" the newer ones.
export const orderListInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
  direction: z.enum(["next", "prev"]).optional(),
});

export type OrderListInput = z.infer<typeof orderListInput>;
