import { createFileRoute } from "@tanstack/react-router";

import { formatMoney } from "~/features/orders/model/money";
import { refunds } from "~/mocks/data";
import { formatMockDateTime } from "~/mocks/format";

export const Route = createFileRoute("/refunds")({
  component: Refunds,
});

function Refunds() {
  return (
    <>
      <h1>Refunds</h1>
      <table>
        <thead>
          <tr>
            <th>Refund</th>
            <th>Order</th>
            <th>Amount</th>
            <th>Reason</th>
            <th>By</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {refunds.map((refund) => (
            <tr key={refund.id}>
              <td>{refund.id}</td>
              <td>{refund.orderId}</td>
              <td>{formatMoney(refund.amount.amount * 100, refund.amount.currency)}</td>
              <td>{refund.reason}</td>
              <td>{refund.by}</td>
              <td>{formatMockDateTime(refund.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
