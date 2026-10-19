import { createFileRoute, notFound } from "@tanstack/react-router";

import { fetchOrder } from "~/features/orders/server/functions";
import { OrderDetailPage } from "~/features/orders/ui/order-detail-page";

export const Route = createFileRoute("/orders/$orderId")({
  loader: async ({ params }) => {
    const order = await fetchOrder({ data: params.orderId });
    if (!order) throw notFound();
    return order;
  },
  component: () => <OrderDetailPage order={Route.useLoaderData()} />,
  notFoundComponent: () => <p>Order not found.</p>,
});
