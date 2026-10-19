import { createFileRoute } from "@tanstack/react-router";

import { emailsSent } from "~/mocks/data";
import { formatMockDateTime } from "~/mocks/format";

export const Route = createFileRoute("/emails")({
  component: Emails,
});

function Emails() {
  return (
    <>
      <h1>Emails sent</h1>
      <table>
        <thead>
          <tr>
            <th>Sent</th>
            <th>To</th>
            <th>Subject</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {emailsSent.map((email) => (
            <tr key={email.id}>
              <td>{formatMockDateTime(email.sentAt)}</td>
              <td>{email.to}</td>
              <td>{email.subject}</td>
              <td>{email.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
