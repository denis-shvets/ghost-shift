import { formatMoney } from "~/features/orders/model/money";
import { PAYMENT_METHOD_LABELS } from "~/features/orders/model/order-labels";
import type { CurrencyInsights } from "~/features/insights/server/insights-repository";
import { computeRates } from "~/features/insights/model/rates";
import { formatAverageOrderValue, formatRate } from "~/features/insights/ui/format";

export function InsightsPage({ currencies }: { currencies: CurrencyInsights[] }) {
  if (currencies.length === 0) {
    return (
      <>
        <h1>Insights</h1>
        <p>No orders yet.</p>
      </>
    );
  }

  return (
    <>
      <h1>Insights</h1>
      <p>Each row is one currency. Amounts are never added across currencies.</p>

      <table>
        <caption>Totals and rates</caption>
        <thead>
          <tr>
            <th scope="col">Currency</th>
            <th scope="col">Orders</th>
            <th scope="col">Order volume</th>
            <th scope="col">Captured volume</th>
            <th scope="col">Refunded volume</th>
            <th scope="col">Average order value</th>
            <th scope="col">Capture rate</th>
            <th scope="col">Refund rate</th>
            <th scope="col">Expiry rate</th>
            <th scope="col">Uncaptured, expiring in 7 days</th>
          </tr>
        </thead>
        <tbody>
          {currencies.map((row) => {
            const rates = computeRates(row);
            return (
              <tr key={row.currency}>
                <th scope="row">{row.currency}</th>
                <td>{row.orderCount}</td>
                <td>{formatMoney(row.totalAmount, row.currency)}</td>
                <td>{formatMoney(row.capturedAmount, row.currency)}</td>
                <td>{formatMoney(row.refundedAmount, row.currency)}</td>
                <td>{formatAverageOrderValue(rates.averageOrderValue, row.currency)}</td>
                <td>{formatRate(rates.captureRate)}</td>
                <td>{formatRate(rates.refundRate)}</td>
                <td>{formatRate(rates.expiryRate)}</td>
                <td>{formatMoney(row.uncapturedExpiringAmount, row.currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <table>
        <caption>Payment methods</caption>
        <thead>
          <tr>
            <th scope="col">Currency</th>
            <th scope="col">Payment method</th>
            <th scope="col">Orders</th>
            <th scope="col">Volume</th>
          </tr>
        </thead>
        <tbody>
          {currencies.flatMap((row) =>
            row.paymentMethods.map((method) => (
              <tr key={`${row.currency}-${method.paymentMethod}`}>
                <td>{row.currency}</td>
                <td>{PAYMENT_METHOD_LABELS[method.paymentMethod]}</td>
                <td>{method.orderCount}</td>
                <td>{formatMoney(method.totalAmount, row.currency)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </>
  );
}
