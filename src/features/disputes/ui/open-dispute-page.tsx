import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type SyntheticEvent, useState } from "react";

import { ORDER_STATUS_LABELS } from "~/features/orders/model/order-labels";
import type { OrderStatus } from "~/features/orders/model/order-statuses";

import { issuesMessage } from "~/shared/validation/issues-message";

import { isDisputable } from "../model/disputable-orders";
import { openDisputeInput } from "../model/open-dispute-input";
import { openDisputeFn } from "../server/functions";

type OrderOption = {
  id: string;
  reference: string;
  status: OrderStatus;
  capturedAmount: number;
  refundedAmount: number;
};
type OpenDispute = { id: string; orderId: string; reason: string; openedAt: Date };

// Structure only; the global base styles in src/styles/app.css style the form (ADR 0018).
export function OpenDisputePage({
  orders,
  disputes,
}: {
  orders: OrderOption[];
  disputes: OpenDispute[];
}) {
  const openDisputeOnServer = useServerFn(openDisputeFn);
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  // Only orders that still hold captured money can be disputed; the server checks the same rule.
  const disputable = orders.filter(isDisputable);

  const referenceOf = (orderId: string) =>
    orders.find((order) => order.id === orderId)?.reference ?? orderId;

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setMessage("");
    // Checked here too, so a whitespace-only reason shows a plain message instead of the server's validation JSON.
    const input = openDisputeInput.safeParse({
      orderId: String(values.get("orderId")),
      reason: String(values.get("reason")),
    });
    if (!input.success) {
      setMessage(issuesMessage(input.error.issues));
      return;
    }
    setPending(true);
    try {
      const dispute = await openDisputeOnServer({ data: input.data });
      // useServerFn resolves undefined when the session expired; it is already navigating to /login.
      if (!dispute) return;
      form.reset();
      await router.invalidate();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open the dispute.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <h1>Dispute an order</h1>
      <p>
        Opens a dispute as if the customer had applied for one. Money and the order status stay as
        they are.
      </p>

      {disputable.length === 0 ? (
        <p>No orders with captured money left to dispute are visible to this account.</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 grid gap-4">
          <label>
            Order{" "}
            <select name="orderId" required>
              {disputable.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.reference} · {ORDER_STATUS_LABELS[order.status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reason{" "}
            <textarea
              name="reason"
              required
              maxLength={500}
              rows={3}
              defaultValue="Item never arrived"
            />
          </label>
          {message ? <p role="alert">{message}</p> : null}
          <div>
            <button type="submit" disabled={pending}>
              Open dispute
            </button>
          </div>
        </form>
      )}

      <h2>Open disputes</h2>
      {disputes.length === 0 ? (
        <p>No open disputes.</p>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Reason</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {disputes.map((dispute) => (
                <tr key={dispute.id}>
                  <td>{referenceOf(dispute.orderId)}</td>
                  <td>{dispute.reason}</td>
                  <td>{new Date(dispute.openedAt).toLocaleString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
