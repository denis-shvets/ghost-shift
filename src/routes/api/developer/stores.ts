import { createFileRoute } from "@tanstack/react-router";

import { handleDeveloperRequest, json } from "~/features/orders/server/developer-api";
import { listStoresForOrder } from "~/features/orders/server/orders-repository";

export const Route = createFileRoute("/api/developer/stores")({
  server: {
    handlers: {
      GET: () =>
        handleDeveloperRequest(async (db, user) => json(await listStoresForOrder(db, user))),
    },
  },
});
