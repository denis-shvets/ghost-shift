import { z } from "zod";

export const openDisputeInput = z.object({
  // A malformed id is refused here, so the insert never reaches Postgres with a value it can't parse.
  orderId: z.uuid(),
  reason: z.string().trim().min(1).max(500),
});

export type OpenDisputeInput = z.infer<typeof openDisputeInput>;
