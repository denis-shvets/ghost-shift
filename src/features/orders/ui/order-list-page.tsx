import { Link } from "@tanstack/react-router";

import type { OrderListInput } from "~/features/orders/model/order-list-input";
import { formatMoney } from "~/features/orders/model/money";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "~/features/orders/model/order-labels";
import { ORDER_STATUSES } from "~/features/orders/model/order-statuses";
import { PAYMENT_METHODS } from "~/features/orders/model/payment-methods";
import type { fetchOrders } from "~/features/orders/server/functions";
import { formatMockDateTime } from "~/mocks/format";

type OrderListPageProps = Awaited<ReturnType<typeof fetchOrders>> & {
  filters: Pick<OrderListInput, "q" | "status" | "storeId" | "paymentMethod" | "shipped">;
};

// A GET form: submitting it puts the search and filters in the URL, so the links and the API match the page.
export function OrderListPage({
  orders,
  nextCursor,
  prevCursor,
  stores,
  filters,
}: OrderListPageProps) {
  return (
    <>
      <h1>Orders</h1>
      <form method="get" action="/orders">
        <label htmlFor="order-search">Reference or email</label>{" "}
        <input id="order-search" name="q" type="search" defaultValue={filters.q} />{" "}
        <label htmlFor="order-status">Status</label>{" "}
        <select id="order-status" name="status" defaultValue={filters.status ?? ""}>
          <option value="">All</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ORDER_STATUS_LABELS[status]}
            </option>
          ))}
        </select>{" "}
        <label htmlFor="order-payment-method">Payment method</label>{" "}
        <select
          id="order-payment-method"
          name="paymentMethod"
          defaultValue={filters.paymentMethod ?? ""}
        >
          <option value="">All</option>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {PAYMENT_METHOD_LABELS[method]}
            </option>
          ))}
        </select>{" "}
        <label htmlFor="order-store">Store</label>{" "}
        <select id="order-store" name="storeId" defaultValue={filters.storeId ?? ""}>
          <option value="">All</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>{" "}
        <label htmlFor="order-shipped">Shipped</label>{" "}
        <select id="order-shipped" name="shipped" defaultValue={filters.shipped ?? ""}>
          <option value="">All</option>
          <option value="true">Shipped</option>
          <option value="false">Not shipped</option>
        </select>{" "}
        <button type="submit">Search</button>
      </form>
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
              <td>{ORDER_STATUS_LABELS[order.status]}</td>
              <td>{formatMoney(order.totalAmount, order.currency)}</td>
              <td>{formatMoney(order.capturedAmount, order.currency)}</td>
              <td>{formatMockDateTime(order.expiresAt.toISOString())}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {prevCursor && (
          <Link to="/orders" search={{ ...filters, cursor: prevCursor, direction: "prev" }}>
            Previous page
          </Link>
        )}{" "}
        {nextCursor && (
          <Link to="/orders" search={{ ...filters, cursor: nextCursor, direction: "next" }}>
            Next page
          </Link>
        )}
      </p>
    </>
  );
}
