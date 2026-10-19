import { createFileRoute } from "@tanstack/react-router";

import { createOrderInput } from "~/features/orders/model/create-order-input";
import { handleDeveloperRequest, json } from "~/features/orders/server/developer-api";
import { createOrder } from "~/features/orders/server/orders-repository";

export const Route = createFileRoute("/api/developer/orders")({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleDeveloperRequest(async (db, user) => {
          const body = await request.json().catch(() => undefined);
          if (body === undefined) return json({ error: "Invalid JSON" }, 400);

          const input = createOrderInput.safeParse(body);
          if (!input.success) {
            return json({ error: "Invalid input", issues: input.error.issues }, 400);
          }

          return json(await createOrder(db, user, input.data), 201);
        }),
    },
  },
});
