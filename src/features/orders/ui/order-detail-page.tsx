import { Fragment, type SyntheticEvent, useEffect, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";

import { describeEvent } from "~/features/orders/model/order-event-details";
import { formatMoney, toMajorUnits, toMinorUnits } from "~/features/orders/model/money";
import { type OrderAction, orderActionInput } from "~/features/orders/model/order-action-input";
import { availableOrderActions } from "~/features/orders/model/order-actions";
import {
  ORDER_EVENT_ACTION_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "~/features/orders/model/order-labels";
import { formatTaxRate } from "~/features/orders/model/tax-rate";
import { type fetchOrder, orderActionFn } from "~/features/orders/server/functions";
import { formatMockDateTime } from "~/mocks/format";

import { registerOrderActionTools } from "./web-mcp-tools";

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

const ACTION_LABELS: Record<OrderAction, string> = {
  capture: "Capture",
  refund: "Refund",
  cancel: "Cancel authorization",
};

// One action as a plain form. Amounts are typed in major units (12.50) and sent in minor units.
// The server checks everything again; its refusal is shown under the form.
function OrderActionForm({
  orderId,
  action,
  currency,
  maxAmount,
}: {
  orderId: string;
  action: OrderAction;
  currency: string;
  maxAmount: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const label = ACTION_LABELS[action];

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "");
    const amount = toMinorUnits(String(form.get("amount") ?? ""));
    const input = orderActionInput.safeParse(
      action === "cancel" ? { action, orderId, reason } : { action, orderId, reason, amount },
    );
    if (!input.success) {
      setMessage(input.error.issues.map((issue) => issue.message).join("; "));
      return;
    }
    setMessage("");
    setBusy(true);
    try {
      await orderActionFn({ data: input.data });
      // Reloads the order, so the amounts, the timeline and these forms show the new state.
      await router.invalidate();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h3>{label}</h3>
      {action !== "cancel" && (
        <p>
          <label>
            Amount ({currency}){" "}
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={toMajorUnits(maxAmount)}
              defaultValue={toMajorUnits(maxAmount)}
              required
            />
          </label>
        </p>
      )}
      <p>
        <label>
          Reason <textarea name="reason" required maxLength={500} />
        </label>
      </p>
      <button type="submit" disabled={busy}>
        {label}
      </button>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}

export function OrderDetailPage({ order, loadedAt }: { order: Order; loadedAt: Date }) {
  const router = useRouter();
  // WebMCP tools exist only while this page is open and the browser supports them.
  // Called directly, not through useServerFn, so a sign-in redirect comes back to the agent as an error.
  useEffect(
    () =>
      registerOrderActionTools(async (data) => {
        const result = await orderActionFn({ data });
        await router.invalidate();
        return result;
      }),
    [router],
  );
  const actions = availableOrderActions(order, loadedAt);
  const money = (amount: number) => formatMoney(amount, order.currency);
  const billing = order.addresses.find((address) => address.kind === "billing");
  const shipping = order.addresses.find((address) => address.kind === "shipping");
  const refundNote =
    order.refundedAmount === 0 || order.status === "refunded"
      ? ""
      : order.refundedAmount < order.capturedAmount
        ? " (partially refunded)"
        : " (refunded)";
  // The job leaves part-captured orders as they are, but the rest of their authorization still runs out.
  const released =
    order.status === "canceled" ||
    order.status === "expired" ||
    (order.status === "part_captured" && order.expiresAt <= loadedAt);
  const shippingSameAsBilling =
    billing !== undefined && shipping !== undefined && isSameAddress(billing, shipping);

  return (
    <>
      <p>
        <Link to="/orders">Back to orders</Link>
      </p>
      <h1>Order {order.reference}</h1>
      <dl>
        <dt>Store</dt>
        <dd>{order.storeName}</dd>
        <dt>Status</dt>
        <dd>
          {ORDER_STATUS_LABELS[order.status]}
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
      {actions.length === 0 && <p>No actions are possible on this order.</p>}
      {actions.map((action) => {
        const maxAmount =
          action === "refund"
            ? order.capturedAmount - order.refundedAmount
            : order.uncapturedAmount;
        // The key changes with the amount, so the form starts fresh after each action.
        return (
          <OrderActionForm
            key={`${action}-${maxAmount}`}
            orderId={order.id}
            action={action}
            currency={order.currency}
            maxAmount={maxAmount}
          />
        );
      })}
    </>
  );
}
