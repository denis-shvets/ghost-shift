import { createFileRoute, notFound } from "@tanstack/react-router";

import { fetchOrder } from "~/features/orders/server/functions";
import { OrderDetailPage } from "~/features/orders/ui/order-detail-page";

export const Route = createFileRoute("/orders/$orderId")({
  loader: async ({ params }) => {
    const order = await fetchOrder({ data: params.orderId });
    if (!order) throw notFound();
    // Taken here so the server render and the browser's hydration agree on which actions show.
    return { order, loadedAt: new Date() };
  },
  component: () => <OrderDetailPage {...Route.useLoaderData()} />,
  notFoundComponent: () => <p>Order not found.</p>,
});
