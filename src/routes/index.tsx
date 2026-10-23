import { createFileRoute } from "@tanstack/react-router";

import { auditLog, orders } from "~/mocks/data";
import { formatMockDateTime } from "~/mocks/format";
import { MockNotice } from "~/features/layout/ui/mock-notice";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard · Ghost Shift" }] }),
  component: Dashboard,
});

function Dashboard() {
  const toCapture = orders.filter((order) => order.status === "authorized").length;

  return (
    <>
      <h1>Dashboard</h1>
      <MockNotice />
      <ul>
        <li>Orders today: {orders.length}</li>
        <li>Waiting for capture: {toCapture}</li>
      </ul>
      <h2>Latest activity</h2>
      <ul>
        {auditLog.map((entry) => (
          <li key={entry.id}>
            {formatMockDateTime(entry.at)}: {entry.actor} did {entry.action} on {entry.target}
          </li>
        ))}
      </ul>
    </>
  );
}
