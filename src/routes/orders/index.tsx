import { createFileRoute } from "@tanstack/react-router";

import { orderListInput } from "~/features/orders/model/order-list-input";
import { fetchOrders } from "~/features/orders/server/functions";
import { OrderListPage } from "~/features/orders/ui/order-list-page";

export const Route = createFileRoute("/orders/")({
  validateSearch: orderListInput.pick({ cursor: true, direction: true }),
  loaderDeps: ({ search }) => ({ cursor: search.cursor, direction: search.direction }),
  loader: ({ deps }) => fetchOrders({ data: deps }),
  component: () => <OrderListPage {...Route.useLoaderData()} />,
});
