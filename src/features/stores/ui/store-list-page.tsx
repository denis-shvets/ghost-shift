import { Link } from "@tanstack/react-router";

import type { fetchStores } from "~/features/stores/server/functions";

type Store = Awaited<ReturnType<typeof fetchStores>>[number];

export function StoreListPage({ stores }: { stores: Store[] }) {
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
              <td>
                <Link to="/stores/$storeId" params={{ storeId: store.id }}>
                  {store.name}
                </Link>
              </td>
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
