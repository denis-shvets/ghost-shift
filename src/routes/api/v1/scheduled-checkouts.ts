import { createFileRoute } from "@tanstack/react-router";

import { handleApiRequest, json } from "~/features/orders/server/api-request";
import { scheduledCheckoutsInput } from "~/features/scheduled-checkouts/model/scheduled-checkout-input";
import {
  planningContext,
  queueCheckouts,
} from "~/features/scheduled-checkouts/server/scheduled-checkouts-repository";

// Night Shift's queue (docs/guides/night-shift.md). GET: the latest due time among your checkouts
// still waiting, and the stores you may queue in. POST: queue a plan; the Worker cron places each
// order when it is due.
// No role check here: row-level security decides who may queue in which store.
export const Route = createFileRoute("/api/v1/scheduled-checkouts")({
  server: {
    handlers: {
      GET: () => handleApiRequest(async (db, user) => json(await planningContext(db, user))),
      POST: ({ request }) =>
        handleApiRequest(async (db, user) => {
          const body = await request.json().catch(() => undefined);
          if (body === undefined) return json({ error: "Invalid JSON" }, 400);

          const input = scheduledCheckoutsInput.safeParse(body);
          if (!input.success) {
            return json({ error: "Invalid input", issues: input.error.issues }, 400);
          }
          // The insert policy refuses these too, but with a raw error instead of this message.
          if (input.data.checkouts.some((checkout) => Date.parse(checkout.dueAt) <= Date.now())) {
            return json({ error: "Every dueAt must be in the future" }, 400);
          }

          return json(await queueCheckouts(db, user, input.data), 201);
        }),
    },
  },
});
