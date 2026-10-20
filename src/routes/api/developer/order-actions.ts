import { createFileRoute } from "@tanstack/react-router";

import { orderActionInput } from "~/features/orders/model/order-action-input";
import { handleDeveloperRequest, json } from "~/features/orders/server/developer-api";
import { applyOrderAction } from "~/features/orders/server/orders-repository";

// Capture, cancel or refund one order. The body says which, with the order id and a reason.
export const Route = createFileRoute("/api/developer/order-actions")({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleDeveloperRequest(async (db, user) => {
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
