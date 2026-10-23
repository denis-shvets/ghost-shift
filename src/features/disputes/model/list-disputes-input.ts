import { z } from "zod";

import { optionalParam } from "~/shared/validation/optional-param";

// What a caller may send to list disputes. The cursor is the id of a dispute on the page next to
// the one wanted: "next" lists the older disputes, "prev" the newer ones. No status or store means all of them.
export const listDisputesInput = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: optionalParam(z.uuid()),
  direction: optionalParam(z.enum(["next", "prev"])),
  status: optionalParam(z.enum(["open", "closed"])),
  storeId: optionalParam(z.uuid()),
});

export type ListDisputesInput = z.infer<typeof listDisputesInput>;
