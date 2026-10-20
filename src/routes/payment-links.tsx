import { createFileRoute } from "@tanstack/react-router";

import { formatMoney } from "~/features/orders/model/money";
import { paymentLinks } from "~/mocks/data";
import { MockNotice } from "~/features/layout/ui/mock-notice";

export const Route = createFileRoute("/payment-links")({
  head: () => ({ meta: [{ title: "Payment links · Ghost Shift" }] }),
  component: PaymentLinks,
});

function PaymentLinks() {
  return (
    <>
      <h1>Payment links</h1>
      <MockNotice />
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
              <td>{formatMoney(link.amount.amount * 100, link.amount.currency)}</td>
              <td>{link.status}</td>
              <td>{link.expiresAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
