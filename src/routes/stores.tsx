import { createFileRoute } from "@tanstack/react-router";

import { stores } from "~/mocks/data";
import { MockNotice } from "~/features/layout/ui/mock-notice";

export const Route = createFileRoute("/stores")({
  head: () => ({ meta: [{ title: "Stores · Ghost Shift" }] }),
  component: Stores,
});

function Stores() {
  return (
    <>
      <h1>Stores</h1>
      <MockNotice />
      <table>
        <thead>
          <tr>
            <th>Store</th>
            <th>Market</th>
            <th>Currency</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((store) => (
            <tr key={store.id}>
              <td>{store.name}</td>
              <td>{store.market}</td>
              <td>{store.currency}</td>
              <td>{store.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
