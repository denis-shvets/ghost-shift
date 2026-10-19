import { createFileRoute } from "@tanstack/react-router";

import { formatMoney } from "~/features/orders/model/money";
import { disputes } from "~/mocks/data";

export const Route = createFileRoute("/disputes")({
  component: Disputes,
});

function Disputes() {
  return (
    <>
      <h1>Disputes</h1>
      <table>
        <thead>
          <tr>
            <th>Dispute</th>
            <th>Order</th>
            <th>Type</th>
            <th>Reason</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Respond by</th>
          </tr>
        </thead>
        <tbody>
          {disputes.map((dispute) => (
            <tr key={dispute.id}>
              <td>{dispute.id}</td>
              <td>{dispute.orderId}</td>
              <td>{dispute.type}</td>
              <td>{dispute.reason}</td>
              <td>{formatMoney(dispute.amount.amount * 100, dispute.amount.currency)}</td>
              <td>{dispute.status}</td>
              <td>{dispute.respondBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
