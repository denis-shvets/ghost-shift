import { createFileRoute } from "@tanstack/react-router";

import { orderListInput } from "~/features/orders/model/order-list-input";
import { fetchOrders } from "~/features/orders/server/functions";
import { OrderListPage } from "~/features/orders/ui/order-list-page";

export const Route = createFileRoute("/orders/")({
  head: () => ({ meta: [{ title: "Orders · Ghost Shift" }] }),
  validateSearch: orderListInput.omit({ limit: true }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchOrders({ data: deps }),
  component: Orders,
});

function Orders() {
  const { q, status, storeId, paymentMethod, shipped } = Route.useSearch();
  return (
    <OrderListPage
      {...Route.useLoaderData()}
      filters={{ q, status, storeId, paymentMethod, shipped }}
    />
  );
}
