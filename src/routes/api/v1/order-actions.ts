import { createFileRoute } from "@tanstack/react-router";

import { orderActionInput } from "~/features/orders/model/order-action-input";
import { handleApiRequest, json } from "~/features/orders/server/api-request";
import { applyOrderAction } from "~/features/orders/server/orders-repository";

// Capture, cancel or refund one order. The body says which, with the order id and a reason.
// Any signed-in user may call it; the database decides whether this user may do the action.
export const Route = createFileRoute("/api/v1/order-actions")({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleApiRequest(async (db, user) => {
          const body = await request.json().catch(() => undefined);
          if (body === undefined) return json({ error: "Invalid JSON" }, 400);

          const input = orderActionInput.safeParse(body);
          if (!input.success) {
            return json({ error: "Invalid input", issues: input.error.issues }, 400);
          }

          return json(await applyOrderAction(db, user, input.data));
        }),
    },
  },
});
