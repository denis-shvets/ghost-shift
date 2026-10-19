import { createFileRoute } from "@tanstack/react-router";

import { refunds } from "~/mocks/data";
import { formatMockDateTime, formatMockMoney } from "~/mocks/format";

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
              <td>{formatMockMoney(refund.amount)}</td>
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
