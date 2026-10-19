import { Fragment } from "react";
import { Link } from "@tanstack/react-router";

import { SignOutButton } from "~/features/auth/ui/sign-out-button";
import { displayStatus } from "~/features/orders/model/display-status";
import { describeEvent } from "~/features/orders/model/order-event-details";
import { formatMoney } from "~/features/orders/model/money";
import {
  ORDER_EVENT_ACTION_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "~/features/orders/model/order-labels";
import { formatTaxRate } from "~/features/orders/model/tax-rate";
import type { fetchOrder } from "~/features/orders/server/functions";
import { formatMockDateTime } from "~/mocks/format";

type Order = NonNullable<Awaited<ReturnType<typeof fetchOrder>>>;
type Address = Order["addresses"][number];

// Lines are shown in order; blank optional fields are skipped.
function AddressBlock({ address }: { address: Address }) {
  const lines = [
    `${address.firstName} ${address.lastName}`,
    address.company,
    address.streetAddress,
    address.streetAddress2,
    `${address.postalCode} ${address.city}`,
    address.region,
    address.country,
    address.phone,
  ].filter((line): line is string => Boolean(line?.trim()));

  return (
    <address>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {line}
          {index < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </address>
  );
}

// Compares the fields that are shown, so a shipping address copied from billing reads as the same.
function isSameAddress(a: Address, b: Address) {
  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.company === b.company &&
    a.streetAddress === b.streetAddress &&
    a.streetAddress2 === b.streetAddress2 &&
    a.postalCode === b.postalCode &&
    a.city === b.city &&
    a.region === b.region &&
    a.country === b.country &&
    a.phone === b.phone
  );
}

export function OrderDetailPage({ order }: { order: Order }) {
  const money = (amount: number) => formatMoney(amount, order.currency);
  const billing = order.addresses.find((address) => address.kind === "billing");
  const shipping = order.addresses.find((address) => address.kind === "shipping");
  const status = displayStatus(order);
  const refundNote =
    order.refundedAmount === 0 || status === "refunded"
      ? ""
      : order.refundedAmount < order.capturedAmount
        ? " (partially refunded)"
        : " (refunded)";
  const released = status === "canceled" || status === "expired";
  const shippingSameAsBilling =
    billing !== undefined && shipping !== undefined && isSameAddress(billing, shipping);

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
        <dd>
          {ORDER_STATUS_LABELS[status]}
          {refundNote}
        </dd>
        <dt>Created</dt>
        <dd>{formatMockDateTime(order.createdAt.toISOString())}</dd>
        <dt>Expires</dt>
        <dd>{formatMockDateTime(order.expiresAt.toISOString())}</dd>
        <dt>Payment method</dt>
        <dd>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</dd>
      </dl>
      <h2>Customer</h2>
      <p>
        {order.customerFirstName} {order.customerLastName}
      </p>
      <p>{order.customerEmail}</p>
      <p>{order.customerPhone || "-"}</p>
      <h2>Billing address</h2>
      {billing ? <AddressBlock address={billing} /> : <p>-</p>}
      <h2>Shipping address</h2>
      {shippingSameAsBilling ? (
        <p>Same as billing address</p>
      ) : shipping ? (
        <AddressBlock address={shipping} />
      ) : (
        <p>-</p>
      )}
      <h2>Amounts</h2>
      <dl>
        <dt>Amount</dt>
        <dd>{money(order.totalAmount)}</dd>
        <dt>Captured</dt>
        <dd>{money(order.capturedAmount)}</dd>
        {/* A canceled or expired authorization can't be captured any more: the rest was let go. */}
        <dt>{released ? "Released" : "Uncaptured"}</dt>
        <dd>{money(order.uncapturedAmount)}</dd>
        <dt>Refunded</dt>
        <dd>{money(order.refundedAmount)}</dd>
      </dl>
      <h2>Shipping</h2>
      <p>
        {order.shippingCarrier}
        {order.shippingTracking ? `, tracking ${order.shippingTracking}` : ""}
      </p>
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
      <h2>Timeline</h2>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            <th>By</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {order.events.map((event) => (
            <tr key={event.id}>
              <td>{formatMockDateTime(event.occurredAt.toISOString())}</td>
              <td>{ORDER_EVENT_ACTION_LABELS[event.action]}</td>
              <td>{event.actorName}</td>
              <td>{describeEvent(event, order.currency)}</td>
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
