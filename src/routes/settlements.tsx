import { createFileRoute } from "@tanstack/react-router";

import { settlements } from "~/mocks/data";
import { formatMoney } from "~/mocks/format";

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
              <td>{formatMoney(settlement.gross)}</td>
              <td>{formatMoney(settlement.fees)}</td>
              <td>{formatMoney(settlement.refunds)}</td>
              <td>{formatMoney(settlement.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
