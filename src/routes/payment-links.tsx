import { createFileRoute } from "@tanstack/react-router";

import { paymentLinks } from "~/mocks/data";
import { formatMockMoney } from "~/mocks/format";

export const Route = createFileRoute("/payment-links")({
  component: PaymentLinks,
});

function PaymentLinks() {
  return (
    <>
      <h1>Payment links</h1>
      <button type="button" disabled>
        Create payment link
      </button>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Expires</th>
          </tr>
        </thead>
        <tbody>
          {paymentLinks.map((link) => (
            <tr key={link.id}>
              <td>{link.description}</td>
              <td>{formatMockMoney(link.amount)}</td>
              <td>{link.status}</td>
              <td>{link.expiresAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
