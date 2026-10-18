import { Link, createFileRoute } from "@tanstack/react-router";

import { SignOutButton } from "~/features/auth/ui/sign-out-button";
import { formatMoney } from "~/features/orders/model/money";
import { fetchOrders } from "~/features/orders/server/functions";
import { formatDateTime } from "~/mocks/format";

export const Route = createFileRoute("/orders/")({
  loader: () => fetchOrders(),
  component: Orders,
});

function Orders() {
  const orders = Route.useLoaderData();

  return (
    <>
      <h1>Orders</h1>
      <SignOutButton />
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Created</th>
            <th>Shopper</th>
            <th>Payment method</th>
            <th>Status</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <Link to="/orders/$orderId" params={{ orderId: order.id }}>
                  {order.reference}
                </Link>
              </td>
              <td>{formatDateTime(order.createdAt.toISOString())}</td>
              <td>{order.shopperName}</td>
              <td>{order.paymentMethod}</td>
              <td>{order.status}</td>
              <td>{formatMoney(order.totalAmount, order.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
