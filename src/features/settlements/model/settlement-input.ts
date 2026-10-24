import { z } from "zod";

import { settlementFrequency } from "../db/schema";

// The store and account are checked again in the repository, against the database.
export const scheduleInput = z.object({
  storeId: z.uuid(),
  frequency: z.enum(settlementFrequency.enumValues),
  payoutAccountId: z.uuid(),
});

export type ScheduleInput = z.infer<typeof scheduleInput>;
