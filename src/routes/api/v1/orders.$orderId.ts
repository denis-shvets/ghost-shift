import { createFileRoute } from "@tanstack/react-router";

import { orderIdInput } from "~/features/orders/model/order-id-input";
import { handleApiRequest, json } from "~/features/orders/server/api-request";
import { getOrder } from "~/features/orders/server/orders-repository";

// Read one order. An order the user can't see is answered as missing, the same as one that doesn't exist.
export const Route = createFileRoute("/api/v1/orders/$orderId")({
  server: {
    handlers: {
      GET: ({ params }) =>
        handleApiRequest(async (db, user) => {
          const orderId = orderIdInput.safeParse(params.orderId);
          if (!orderId.success) {
            return json({ error: "Invalid input", issues: orderId.error.issues }, 400);
          }

          const order = await getOrder(db, user, orderId.data);
          if (!order) return json({ error: "Order not found" }, 404);
          return json(order);
        }),
    },
  },
});
