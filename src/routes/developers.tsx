import { createFileRoute } from "@tanstack/react-router";

import { apiKeys, webhooks } from "~/mocks/data";
import { MockNotice } from "~/features/layout/ui/mock-notice";

export const Route = createFileRoute("/developers")({
  head: () => ({ meta: [{ title: "Developers · Ghost Shift" }] }),
  component: Developers,
});

function Developers() {
  return (
    <>
      <h1>Developers</h1>
      <MockNotice />
      <h2>API keys</h2>
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Key</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {apiKeys.map((key) => (
            <tr key={key.id}>
              <td>{key.label}</td>
              <td>{key.prefix}…</td>
              <td>{key.createdAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Webhooks</h2>
      <table>
        <thead>
          <tr>
            <th>URL</th>
            <th>Events</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {webhooks.map((webhook) => (
            <tr key={webhook.id}>
              <td>{webhook.url}</td>
              <td>{webhook.events.join(", ")}</td>
              <td>{webhook.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
