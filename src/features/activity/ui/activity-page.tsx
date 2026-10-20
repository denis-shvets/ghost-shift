import { Link } from "@tanstack/react-router";

import type { ActivityEvent } from "~/features/activity/server/activity-repository";
import { formatMoney } from "~/features/orders/model/money";
import { ORDER_EVENT_ACTION_LABELS } from "~/features/orders/model/order-labels";
import type { fetchActivity } from "~/features/activity/server/functions";
import { formatMockDateTime } from "~/mocks/format";

type ActivityPageProps = Awaited<ReturnType<typeof fetchActivity>>;

// Captures and refunds have an amount; a cancel or expiry releases the part that was never captured.
function amountOf(event: ActivityEvent) {
  return event.action === "canceled" || event.action === "expired"
    ? event.metadata.releasedAmount
    : event.metadata.amount;
}

export function ActivityPage({ events, nextCursor, prevCursor }: ActivityPageProps) {
  return (
    <>
      <h1>Audit log</h1>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Amount</th>
            <th>Reason</th>
            <th>Run</th>
            <th>Store</th>
            <th>Order</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{formatMockDateTime(event.occurredAt.toISOString())}</td>
              <td>{event.actorName}</td>
              <td>{ORDER_EVENT_ACTION_LABELS[event.action]}</td>
              <td>{formatMoney(amountOf(event), event.currency)}</td>
              <td>{"reason" in event.metadata ? event.metadata.reason : null}</td>
              <td>
                {event.agentRunPurpose ??
                  (event.agentRunId && `Run ${event.agentRunId.slice(0, 8)}`)}
              </td>
              <td>{event.storeName}</td>
              <td>
                <Link to="/orders/$orderId" params={{ orderId: event.orderId }}>
                  {event.reference}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {prevCursor && (
          <Link
            to="/audit-log"
            search={(prev) => ({ ...prev, cursor: prevCursor, direction: "prev" })}
          >
            Previous page
          </Link>
        )}{" "}
        {nextCursor && (
          <Link
            to="/audit-log"
            search={(prev) => ({ ...prev, cursor: nextCursor, direction: "next" })}
          >
            Next page
          </Link>
        )}
      </p>
    </>
  );
}
