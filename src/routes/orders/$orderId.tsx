import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { SignOutButton } from "~/features/auth/ui/sign-out-button";
import { formatMoney } from "~/features/orders/model/money";
import { formatTaxRate } from "~/features/orders/model/tax-rate";
import { fetchOrder } from "~/features/orders/server/functions";
import { formatDateTime } from "~/mocks/format";

export const Route = createFileRoute("/orders/$orderId")({
  loader: async ({ params }) => {
    const order = await fetchOrder({ data: params.orderId });
    if (!order) throw notFound();
    return order;
  },
  component: OrderDetail,
  notFoundComponent: () => <p>Order not found.</p>,
});

function OrderDetail() {
  const order = Route.useLoaderData();
  const money = (amount: number) => formatMoney(amount, order.currency);

  return (
    <>
      <p>
        <Link to="/orders">Back to orders</Link>
      </p>
      <SignOutButton />
      <h1>Order {order.reference}</h1>
      <dl>
        <dt>Store</dt>
        <dd>{order.storeName}</dd>
        <dt>Status</dt>
        <dd>{order.status}</dd>
        <dt>Created</dt>
        <dd>{formatDateTime(order.createdAt.toISOString())}</dd>
        <dt>Shopper</dt>
        <dd>
          {order.shopperName}, {order.shopperEmail}, {order.shopperCountry}
        </dd>
        <dt>Payment method</dt>
        <dd>{order.paymentMethod}</dd>
        <dt>Total</dt>
        <dd>{money(order.totalAmount)}</dd>
        <dt>Captured</dt>
        <dd>{money(order.capturedAmount)}</dd>
        <dt>Refunded</dt>
        <dd>{money(order.refundedAmount)}</dd>
        <dt>Shipping</dt>
        <dd>
          {order.shippingCarrier}
          {order.shippingTracking ? `, tracking ${order.shippingTracking}` : ""}
        </dd>
      </dl>
      <h2>Items</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Type</th>
            <th>SKU</th>
            <th>Quantity</th>
            <th>Unit price</th>
            <th>Tax rate</th>
            <th>Total</th>
            <th>Tax included</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line) => (
            <tr key={line.position}>
              <td>{line.position}</td>
              <td>{line.name}</td>
              <td>{line.type}</td>
              <td>{line.sku ?? "-"}</td>
              <td>{line.quantity}</td>
              <td>{money(line.unitPrice)}</td>
              <td>{formatTaxRate(line.taxRate)}</td>
              <td>{money(line.totalAmount)}</td>
              <td>{money(line.totalTaxAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Actions</h2>
      <p>Mocked: these buttons do nothing yet.</p>
      <button type="button" disabled>
        Capture
      </button>{" "}
      <button type="button" disabled>
        Refund
      </button>{" "}
      <button type="button" disabled>
        Cancel
      </button>
    </>
  );
}
