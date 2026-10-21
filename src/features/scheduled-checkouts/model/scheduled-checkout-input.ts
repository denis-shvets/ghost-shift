import { z } from "zod";

import { placeOrderInput } from "../../orders/model/create-order-input.ts";

export const SCHEDULED_CHECKOUT_STATUSES = [
  "pending",
  "placing",
  "placed",
  "failed",
  "skipped",
] as const;

// The most checkouts one upload may queue: 28 days of Night Shift at today's rates (about 65 a week),
// with room to spare. About 1 KB each, so an upload stays well under the Worker's request limit.
export const MAX_SCHEDULED_CHECKOUTS = 500;

export const scheduledCheckoutInput = z.object({
  dueAt: z.iso.datetime({ offset: true }),
  persona: z.string().min(1).max(60),
  order: placeOrderInput,
});

// A plan file from `pnpm night-shift:plan`, as `pnpm night-shift:upload` sends it.
export const scheduledCheckoutsInput = z.object({
  planId: z.uuid(),
  checkouts: z.array(scheduledCheckoutInput).min(1).max(MAX_SCHEDULED_CHECKOUTS),
});

export type ScheduledCheckoutInput = z.infer<typeof scheduledCheckoutInput>;
export type ScheduledCheckoutsInput = z.infer<typeof scheduledCheckoutsInput>;
