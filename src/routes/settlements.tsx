import { createFileRoute } from "@tanstack/react-router";

import { settlements } from "~/mocks/data";
import { formatMockMoney } from "~/mocks/format";

export const Route = createFileRoute("/settlements")({
  component: Settlements,
});

function Settlements() {
  return (
    <>
      <h1>Settlements</h1>
      <table>
        <thead>
          <tr>
            <th>Payout date</th>
            <th>Store</th>
            <th>Orders</th>
            <th>Gross</th>
            <th>Fees</th>
            <th>Refunds</th>
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          {settlements.map((settlement) => (
            <tr key={settlement.id}>
              <td>{settlement.payoutDate}</td>
              <td>{settlement.storeId}</td>
              <td>{settlement.orders}</td>
              <td>{formatMockMoney(settlement.gross)}</td>
              <td>{formatMockMoney(settlement.fees)}</td>
              <td>{formatMockMoney(settlement.refunds)}</td>
              <td>{formatMockMoney(settlement.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
