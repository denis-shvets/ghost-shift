import { Link } from "@tanstack/react-router";

import { SignOutButton } from "~/features/auth/ui/sign-out-button";
import { displayStatus } from "~/features/orders/model/display-status";
import { formatMoney } from "~/features/orders/model/money";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "~/features/orders/model/order-labels";
import type { fetchOrders } from "~/features/orders/server/functions";
import { formatMockDateTime } from "~/mocks/format";

type OrderListPageProps = Awaited<ReturnType<typeof fetchOrders>>;

export function OrderListPage({ orders, nextCursor, prevCursor }: OrderListPageProps) {
  return (
    <>
      <h1>Orders</h1>
      <SignOutButton />
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Created</th>
            <th>Customer</th>
            <th>Payment method</th>
            <th>Status</th>
            <th>Amount</th>
            <th>Captured</th>
            <th>Expires</th>
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
              <td>{formatMockDateTime(order.createdAt.toISOString())}</td>
              <td>
                {order.customerFirstName} {order.customerLastName}
              </td>
              <td>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</td>
              <td>{ORDER_STATUS_LABELS[displayStatus(order)]}</td>
              <td>{formatMoney(order.totalAmount, order.currency)}</td>
              <td>{formatMoney(order.capturedAmount, order.currency)}</td>
              <td>{formatMockDateTime(order.expiresAt.toISOString())}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {prevCursor && (
          <Link to="/orders" search={{ cursor: prevCursor, direction: "prev" }}>
            Previous page
          </Link>
        )}{" "}
        {nextCursor && (
          <Link to="/orders" search={{ cursor: nextCursor, direction: "next" }}>
            Next page
          </Link>
        )}
      </p>
    </>
  );
}
