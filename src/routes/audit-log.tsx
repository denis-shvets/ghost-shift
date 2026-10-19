import { createFileRoute } from "@tanstack/react-router";

import { auditLog } from "~/mocks/data";
import { formatMockDateTime } from "~/mocks/format";

export const Route = createFileRoute("/audit-log")({
  component: AuditLog,
});

function AuditLog() {
  return (
    <>
      <h1>Audit log</h1>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Target</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {auditLog.map((entry) => (
            <tr key={entry.id}>
              <td>{formatMockDateTime(entry.at)}</td>
              <td>{entry.actor}</td>
              <td>{entry.action}</td>
              <td>{entry.target}</td>
              <td>{entry.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
