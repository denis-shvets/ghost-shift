import { Fragment, type SyntheticEvent, useEffect, useRef, useState } from "react";
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
    <address className="not-italic">
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

const CARD_CLASS = "rounded-lg border border-gray-200 p-4";
const SECTION_TITLE_CLASS = "mt-0 mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600";
const CTA_CLASS =
  "rounded border border-gray-400 px-3 py-1.5 text-sm font-medium hover:bg-gray-100";
const TABLE_CLASS = "w-full border-collapse text-left text-sm";
const CELL_CLASS = "border-b border-gray-200 py-2 pr-4 align-top";

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
  const dialogRef = useRef<HTMLDialogElement>(null);
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
      dialogRef.current?.close();
      // Reloads the order, so the amounts, the timeline and these forms show the new state.
      await router.invalidate();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={CTA_CLASS} onClick={() => dialogRef.current?.showModal()}>
        {label}
      </button>
      <dialog
        ref={dialogRef}
        aria-label={label}
        className="m-auto w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl backdrop:bg-black/40"
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">{label}</h3>
          {action !== "cancel" && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Amount ({currency})
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={toMajorUnits(maxAmount)}
                defaultValue={toMajorUnits(maxAmount)}
                required
                className="rounded border border-gray-300 px-3 py-2 font-normal"
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm font-medium">
            Reason
            <textarea
              name="reason"
              required
              maxLength={500}
              rows={3}
              className="rounded border border-gray-300 px-3 py-2 font-normal"
            />
          </label>
          {message && (
            <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">
              {message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-100"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-gray-900 px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {label}
            </button>
          </div>
        </form>
      </dialog>
    </>
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
      <Link to="/orders" className="text-sm text-gray-600 hover:underline">
        Back to orders
      </Link>
      <header className="mt-3 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-2xl leading-none font-semibold">Order {order.reference}</h1>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-700">
            {ORDER_STATUS_LABELS[order.status]}
            {refundNote}
          </span>
        </div>
        {/* The main controls sit at the top right, so they are the first thing to find. */}
        <div className="flex flex-wrap items-center gap-2">
          {actions.length === 0 && (
            <p className="text-sm text-gray-600">No actions are possible on this order.</p>
          )}
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
        </div>
      </header>
      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 md:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Store</dt>
          <dd className="mt-1">{order.storeName}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Created</dt>
          <dd className="mt-1">{formatMockDateTime(order.createdAt.toISOString())}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Expires</dt>
          <dd className="mt-1">{formatMockDateTime(order.expiresAt.toISOString())}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Payment method</dt>
          <dd className="mt-1">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</dd>
        </div>
      </dl>
      {/* Sidebar first on small screens, beside the main column from xl up so the tables keep room. */}
      <div className="mt-6 flex flex-col gap-6 xl:flex-row">
        <div className="order-2 flex min-w-0 flex-1 flex-col gap-8 xl:order-1">
          <section>
            <h2 className={SECTION_TITLE_CLASS}>Items</h2>
            <div className="overflow-x-auto">
              <table className={TABLE_CLASS}>
                <thead>
                  <tr className="text-gray-600">
                    <th className={CELL_CLASS}>#</th>
                    <th className={CELL_CLASS}>Item</th>
                    <th className={CELL_CLASS}>Type</th>
                    <th className={CELL_CLASS}>SKU</th>
                    <th className={CELL_CLASS}>Qty</th>
                    <th className={CELL_CLASS}>Unit price</th>
                    <th className={CELL_CLASS}>Tax rate</th>
                    <th className={CELL_CLASS}>Total</th>
                    <th className={CELL_CLASS}>Tax included</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => (
                    <tr key={line.position}>
                      <td className={CELL_CLASS}>{line.position}</td>
                      <td className={CELL_CLASS}>{line.name}</td>
                      <td className={CELL_CLASS}>{line.type}</td>
                      <td className={CELL_CLASS}>{line.sku ?? "-"}</td>
                      <td className={CELL_CLASS}>{line.quantity}</td>
                      <td className={CELL_CLASS}>{money(line.unitPrice)}</td>
                      <td className={CELL_CLASS}>{formatTaxRate(line.taxRate)}</td>
                      <td className={CELL_CLASS}>{money(line.totalAmount)}</td>
                      <td className={CELL_CLASS}>{money(line.totalTaxAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h2 className={SECTION_TITLE_CLASS}>Timeline</h2>
            <div className="overflow-x-auto">
              <table className={TABLE_CLASS}>
                <thead>
                  <tr className="text-gray-600">
                    <th className={CELL_CLASS}>Time</th>
                    <th className={CELL_CLASS}>Action</th>
                    <th className={CELL_CLASS}>By</th>
                    <th className={CELL_CLASS}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {order.events.map((event) => (
                    <tr key={event.id}>
                      <td className={CELL_CLASS}>
                        {formatMockDateTime(event.occurredAt.toISOString())}
                      </td>
                      <td className={CELL_CLASS}>{ORDER_EVENT_ACTION_LABELS[event.action]}</td>
                      <td className={CELL_CLASS}>{event.actorName}</td>
                      <td className={CELL_CLASS}>{describeEvent(event, order.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        {/* Cards sit in two columns from md, and in one narrow column beside the tables from xl. */}
        <aside className="order-1 grid w-full gap-4 md:grid-cols-2 xl:order-2 xl:flex xl:w-80 xl:shrink-0 xl:flex-col">
          <section className={CARD_CLASS}>
            <h2 className={SECTION_TITLE_CLASS}>Amounts</h2>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-gray-600">Amount</dt>
              <dd className="text-right">{money(order.totalAmount)}</dd>
              <dt className="text-gray-600">Captured</dt>
              <dd className="text-right">{money(order.capturedAmount)}</dd>
              {/* A canceled or expired authorization can't be captured any more: the rest was let go. */}
              <dt className="text-gray-600">{released ? "Released" : "Uncaptured"}</dt>
              <dd className="text-right">{money(order.uncapturedAmount)}</dd>
              <dt className="text-gray-600">Refunded</dt>
              <dd className="text-right">{money(order.refundedAmount)}</dd>
            </dl>
          </section>
          <section className={CARD_CLASS}>
            <h2 className={SECTION_TITLE_CLASS}>Customer</h2>
            <p>
              {order.customerFirstName} {order.customerLastName}
            </p>
            <p className="text-sm text-gray-600">{order.customerEmail}</p>
            <p className="text-sm text-gray-600">{order.customerPhone || "-"}</p>
          </section>
          <section className={CARD_CLASS}>
            <h2 className={SECTION_TITLE_CLASS}>Billing address</h2>
            {billing ? <AddressBlock address={billing} /> : <p>-</p>}
          </section>
          <section className={CARD_CLASS}>
            <h2 className={SECTION_TITLE_CLASS}>Shipping</h2>
            {shippingSameAsBilling ? (
              <p>Same as billing address</p>
            ) : shipping ? (
              <AddressBlock address={shipping} />
            ) : (
              <p>-</p>
            )}
            <p className="mt-3 text-sm text-gray-600">
              {order.shippingCarrier}
              {order.shippingTracking ? `, tracking ${order.shippingTracking}` : ""}
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
