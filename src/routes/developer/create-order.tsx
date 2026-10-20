import { createFileRoute, redirect } from "@tanstack/react-router";

import { fetchStoresFn } from "~/features/orders/server/functions";
import { CreateOrderPage } from "~/features/orders/ui/create-order-page";

export const Route = createFileRoute("/developer/create-order")({
  head: () => ({ meta: [{ title: "Create test order · Ghost Shift" }] }),
  loader: async () => {
    try {
      return { stores: await fetchStoresFn() };
    } catch (error) {
      // Signed-in users without the developer role get a 403 from the server; send them back to the list.
      if (error instanceof Response && error.status === 403) throw redirect({ to: "/orders" });
      throw error;
    }
  },
  component: () => <CreateOrderPage stores={Route.useLoaderData().stores} />,
});
