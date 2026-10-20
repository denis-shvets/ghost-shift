import { Link } from "@tanstack/react-router";

import type { fetchRefunds } from "~/features/activity/server/functions";
import { formatMoney } from "~/features/orders/model/money";
import { formatMockDateTime } from "~/mocks/format";

type RefundsPageProps = Awaited<ReturnType<typeof fetchRefunds>> & { storeId?: string };

// The store filter is a plain GET form, so the choice sits in the URL and survives paging.
export function RefundsPage({ events, nextCursor, prevCursor, stores, storeId }: RefundsPageProps) {
  return (
    <>
      <h1>Refunds</h1>
      <form key={storeId ?? ""} method="get" action="/refunds">
        <label>
          Store{" "}
          <select name="storeId" defaultValue={storeId ?? ""}>
            <option value="">All stores</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>{" "}
        <button type="submit">Filter</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Store</th>
            <th>Amount</th>
            <th>Reason</th>
            <th>By</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>
                <Link to="/orders/$orderId" params={{ orderId: event.orderId }}>
                  {event.reference}
                </Link>
              </td>
              <td>{event.storeName}</td>
              <td>
                {event.action === "refunded"
                  ? formatMoney(event.metadata.amount, event.currency)
                  : null}
              </td>
              <td>{"reason" in event.metadata ? event.metadata.reason : null}</td>
              <td>{event.actorName}</td>
              <td>{formatMockDateTime(event.occurredAt.toISOString())}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {prevCursor && (
          <Link
            to="/refunds"
            search={(prev) => ({ ...prev, cursor: prevCursor, direction: "prev" })}
          >
            Previous page
          </Link>
        )}{" "}
        {nextCursor && (
          <Link
            to="/refunds"
            search={(prev) => ({ ...prev, cursor: nextCursor, direction: "next" })}
          >
            Next page
          </Link>
        )}
      </p>
    </>
  );
}
