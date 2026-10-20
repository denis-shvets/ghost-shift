import { createFileRoute } from "@tanstack/react-router";

import { handleApiRequest, json } from "~/features/orders/server/api-request";
import { listStoresForOrder } from "~/features/orders/server/orders-repository";

export const Route = createFileRoute("/api/v1/stores")({
  server: {
    handlers: {
      GET: () => handleApiRequest(async (db, user) => json(await listStoresForOrder(db, user))),
    },
  },
});
