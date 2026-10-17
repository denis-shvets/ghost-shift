import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { orders } from "~/mocks/data";
import { formatDateTime, formatMoney } from "~/mocks/format";

export const Route = createFileRoute("/orders/$orderId")({
  loader: ({ params }) => {
    const order = orders.find((item) => item.id === params.orderId);
    if (!order) throw notFound();
    return order;
  },
  component: OrderDetail,
  notFoundComponent: () => <p>Order not found.</p>,
});

function OrderDetail() {
  const order = Route.useLoaderData();

  return (
    <>
      <p>
        <Link to="/orders">Back to orders</Link>
      </p>
      <h1>Order {order.reference}</h1>
      <dl>
        <dt>Status</dt>
        <dd>{order.status}</dd>
        <dt>Created</dt>
        <dd>{formatDateTime(order.createdAt)}</dd>
        <dt>Shopper</dt>
        <dd>
          {order.shopper.name}, {order.shopper.email}, {order.shopper.country}
        </dd>
        <dt>Payment method</dt>
        <dd>{order.paymentMethod}</dd>
        <dt>Total</dt>
        <dd>{formatMoney(order.total)}</dd>
        <dt>Captured</dt>
        <dd>{formatMoney(order.captured)}</dd>
        <dt>Refunded</dt>
        <dd>{formatMoney(order.refunded)}</dd>
        <dt>Shipping</dt>
        <dd>
          {order.shipping.carrier}
          {order.shipping.tracking ? `, tracking ${order.shipping.tracking}` : ""}
        </dd>
      </dl>
      <h2>Items</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity</th>
            <th>Unit price</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line) => (
            <tr key={line.name}>
              <td>{line.name}</td>
              <td>{line.quantity}</td>
              <td>{formatMoney(line.unitPrice)}</td>
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
