import { Link } from "@tanstack/react-router";

import type { ListDisputesInput } from "~/features/disputes/model/list-disputes-input";
import type { fetchDisputesFn } from "~/features/disputes/server/functions";
import { PageLinks } from "~/shared/ui/page-links";
import { formatMockDateTime } from "~/mocks/format";

type DisputesListPageProps = Awaited<ReturnType<typeof fetchDisputesFn>> & {
  filters: Pick<ListDisputesInput, "status" | "storeId">;
};

// A GET form like the orders list: the filters go in the URL, so the links and the page match.
export function DisputesListPage({
  disputes,
  nextCursor,
  prevCursor,
  stores,
  filters,
}: DisputesListPageProps) {
  const { status, storeId } = filters;
  return (
    <>
      <h1>Disputes</h1>
      <form method="get" action="/disputes" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="dispute-store">Store</label>
          <select id="dispute-store" name="storeId" defaultValue={storeId ?? ""}>
            <option value="">All</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="dispute-status">Status</label>
          <select id="dispute-status" name="status" defaultValue={status ?? ""}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <button type="submit">Search</button>
      </form>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Dispute</th>
              <th>Order</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Opened</th>
              <th>Closed</th>
            </tr>
          </thead>
          <tbody>
            {disputes.map((dispute) => (
              <tr key={dispute.id}>
                <td>{dispute.id.slice(0, 8)}</td>
                <td>
                  <Link to="/orders/$orderId" params={{ orderId: dispute.orderId }}>
                    {dispute.orderReference}
                  </Link>
                </td>
                <td>{dispute.reason}</td>
                <td>{dispute.status === "open" ? "Open" : "Closed"}</td>
                <td>{formatMockDateTime(dispute.openedAt.toISOString())}</td>
                <td>
                  {dispute.closedAt ? formatMockDateTime(dispute.closedAt.toISOString()) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PageLinks to="/disputes" filters={filters} prevCursor={prevCursor} nextCursor={nextCursor} />
    </>
  );
}
