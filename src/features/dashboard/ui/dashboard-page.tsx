import type { CurrencyInsights } from "~/features/insights/server/insights-repository";
import { computeRates } from "~/features/insights/model/rates";
import { formatAverageOrderValue, formatRate } from "~/features/insights/ui/format";
import { formatMoney } from "~/features/orders/model/money";
import { PAYMENT_METHOD_LABELS } from "~/features/orders/model/order-labels";
import {
  SettlementSummaryBlock,
  type SettlementOverview,
} from "~/features/settlements/ui/settlement-summary";

// Each currency is its own block: amounts in different currencies are never added together.
export function DashboardPage({
  currencies,
  settlements,
}: {
  currencies: CurrencyInsights[];
  settlements?: SettlementOverview;
}) {
  return (
    <>
      <h1>Dashboard</h1>
      {settlements ? <SettlementSummaryBlock overview={settlements} /> : null}
      <h2>Orders</h2>
      {currencies.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        currencies.map((row) => <CurrencyBlock key={row.currency} row={row} />)
      )}
    </>
  );
}

function CurrencyBlock({ row }: { row: CurrencyInsights }) {
  const rates = computeRates(row);
  const tiles = [
    { label: "Orders", value: String(row.orderCount) },
    { label: "Order volume", value: formatMoney(row.totalAmount, row.currency) },
    { label: "Captured volume", value: formatMoney(row.capturedAmount, row.currency) },
    { label: "Refunded volume", value: formatMoney(row.refundedAmount, row.currency) },
    {
      label: "Average order value",
      value: formatAverageOrderValue(rates.averageOrderValue, row.currency),
    },
    { label: "Capture rate", value: formatRate(rates.captureRate) },
    { label: "Refund rate", value: formatRate(rates.refundRate) },
    { label: "Expiry rate", value: formatRate(rates.expiryRate) },
    {
      label: "Uncaptured, expiring in 7 days",
      value: formatMoney(row.uncapturedExpiringAmount, row.currency),
    },
  ];

  return (
    <section aria-labelledby={`currency-${row.currency}`}>
      <h3 id={`currency-${row.currency}`} className="pb-2 text-lg font-medium">
        {row.currency}
      </h3>
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded border border-neutral-200 p-4">
            <dt className="text-sm text-neutral-600">{tile.label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{tile.value}</dd>
          </div>
        ))}
      </dl>

      <table>
        <caption className="pb-2 text-left font-medium text-neutral-700">Payment methods</caption>
        <thead>
          <tr>
            <th scope="col">Payment method</th>
            <th scope="col" className="text-right">
              Orders
            </th>
            <th scope="col" className="text-right">
              Volume
            </th>
          </tr>
        </thead>
        <tbody>
          {row.paymentMethods.map((method) => (
            <tr key={method.paymentMethod}>
              <th scope="row">{PAYMENT_METHOD_LABELS[method.paymentMethod]}</th>
              <td className="text-right tabular-nums">{method.orderCount}</td>
              <td className="text-right tabular-nums">
                {formatMoney(method.totalAmount, row.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
