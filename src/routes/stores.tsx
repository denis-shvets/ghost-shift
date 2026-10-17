import { createFileRoute } from "@tanstack/react-router";

import { stores } from "~/mocks/data";

export const Route = createFileRoute("/stores")({
  component: Stores,
});

function Stores() {
  return (
    <>
      <h1>Stores</h1>
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
