import handler from "@tanstack/react-start/server-entry";

import { releaseDueCheckouts } from "~/features/scheduled-checkouts/server/scheduled-checkouts-repository";
import { withDb } from "~/shared/db/request-db";

// The Worker's entry: TanStack Start answers requests, and the cron in wrangler.jsonc places
// Night Shift's due checkouts (docs/guides/night-shift.md).
export default {
  fetch: handler.fetch,
  async scheduled() {
    const counts = await withDb((db) => releaseDueCheckouts(db));
    console.log(`Scheduled checkouts: ${JSON.stringify(counts)}`);
  },
};
