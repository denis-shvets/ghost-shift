import { createFileRoute } from "@tanstack/react-router";

import { auditLog, disputes, orders } from "~/mocks/data";
import { formatDateTime } from "~/mocks/format";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const toCapture = orders.filter((order) => order.status === "authorized").length;
  const openDisputes = disputes.filter((dispute) => dispute.status === "needs_response").length;

  return (
    <>
      <h1>Dashboard</h1>
      <ul>
        <li>Orders today: {orders.length}</li>
        <li>Waiting for capture: {toCapture}</li>
        <li>Disputes needing a response: {openDisputes}</li>
      </ul>
      <h2>Latest activity</h2>
      <ul>
        {auditLog.map((entry) => (
          <li key={entry.id}>
            {formatDateTime(entry.at)}: {entry.actor} did {entry.action} on {entry.target}
          </li>
        ))}
      </ul>
    </>
  );
}
