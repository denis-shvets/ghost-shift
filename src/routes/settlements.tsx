import { createFileRoute } from "@tanstack/react-router";

import { formatMoney } from "~/features/orders/model/money";
import { settlements } from "~/mocks/data";

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
              <td>{formatMoney(settlement.gross.amount * 100, settlement.gross.currency)}</td>
              <td>{formatMoney(settlement.fees.amount * 100, settlement.fees.currency)}</td>
              <td>{formatMoney(settlement.refunds.amount * 100, settlement.refunds.currency)}</td>
              <td>{formatMoney(settlement.net.amount * 100, settlement.net.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
