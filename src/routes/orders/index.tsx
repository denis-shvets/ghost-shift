import { Link, createFileRoute } from "@tanstack/react-router";

import { orders } from "~/mocks/data";
import { formatDateTime, formatMoney } from "~/mocks/format";

export const Route = createFileRoute("/orders/")({
  component: Orders,
});

function Orders() {
  return (
    <>
      <h1>Orders</h1>
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
              <td>{formatDateTime(order.createdAt)}</td>
              <td>{order.shopper.name}</td>
              <td>{order.paymentMethod}</td>
              <td>{order.status}</td>
              <td>{formatMoney(order.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
