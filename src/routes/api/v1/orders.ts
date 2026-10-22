import { createFileRoute } from "@tanstack/react-router";

import { createOrderInput } from "~/features/orders/model/create-order-input";
import { orderListQuery } from "~/features/orders/model/order-list-input";
import { handleApiRequest, json } from "~/features/orders/server/api-request";
import { createOrder, listOrders } from "~/features/orders/server/orders-repository";

// List orders the signed-in user can see (query: limit, cursor, direction, q, status, storeId, paymentMethod), or create one.
// No role check here: row-level security decides which orders a user sees and who may create.
export const Route = createFileRoute("/api/v1/orders")({
  server: {
    handlers: {
      GET: ({ request }) =>
        handleApiRequest(async (db, user) => {
          const input = orderListQuery.safeParse(
            Object.fromEntries(new URL(request.url).searchParams),
          );
          if (!input.success) {
            return json({ error: "Invalid input", issues: input.error.issues }, 400);
          }

          // listOrders, not listOrdersOrFirstPage: a cursor the user can't see must give an empty page, not page 1 again, or a script could loop forever.
          return json(await listOrders(db, user, input.data));
        }),
      POST: ({ request }) =>
        handleApiRequest(async (db, user) => {
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
