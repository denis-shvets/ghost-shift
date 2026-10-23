import { createFileRoute, redirect } from "@tanstack/react-router";

import { fetchOrders } from "~/features/orders/server/functions";
import { fetchOpenDisputesFn } from "~/features/disputes/server/functions";
import { OpenDisputePage } from "~/features/disputes/ui/open-dispute-page";

export const Route = createFileRoute("/developer/disputes")({
  head: () => ({ meta: [{ title: "Dispute an order · Ghost Shift" }] }),
  loader: async () => {
    try {
      const [{ orders }, disputes] = await Promise.all([
        fetchOrders({ data: { limit: 100 } }),
        fetchOpenDisputesFn(),
      ]);
      return { orders, disputes };
    } catch (error) {
      // Signed-in users without the developer role get a 403 from the server; send them back to the list.
      if (error instanceof Response && error.status === 403) throw redirect({ to: "/orders" });
      throw error;
    }
  },
  component: () => {
    const { orders, disputes } = Route.useLoaderData();
    return <OpenDisputePage orders={orders} disputes={disputes} />;
  },
});
