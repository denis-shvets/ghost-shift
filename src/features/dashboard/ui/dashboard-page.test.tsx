import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CurrencyInsights } from "~/features/insights/server/insights-repository";
import { formatMoney } from "~/features/orders/model/money";
import { PAYMENT_METHOD_LABELS } from "~/features/orders/model/order-labels";

import { DashboardPage } from "./dashboard-page";

function currency(overrides: Partial<CurrencyInsights>): CurrencyInsights {
  return {
    currency: "GBP",
    orderCount: 0,
    settledOrderCount: 0,
    totalAmount: 0,
    capturedAmount: 0,
    refundedAmount: 0,
    capturedOrderCount: 0,
    expiredOrderCount: 0,
    uncapturedExpiringAmount: 0,
    paymentMethods: [],
    ...overrides,
  };
}

describe("DashboardPage", () => {
  it("shows the empty state when there are no orders", () => {
    const html = renderToStaticMarkup(<DashboardPage currencies={[]} />);
    expect(html).toContain("No orders yet.");
  });

  it("shows a dash for rates with nothing to divide by", () => {
    const html = renderToStaticMarkup(<DashboardPage currencies={[currency({ orderCount: 0 })]} />);
    expect(html).toMatch(/Capture rate<\/dt><dd[^>]*>–<\/dd>/);
    expect(html).toMatch(/Average order value<\/dt><dd[^>]*>–<\/dd>/);
  });

  it("shows each currency in its own block and never adds them together", () => {
    const html = renderToStaticMarkup(
      <DashboardPage
        currencies={[
          currency({ currency: "GBP", orderCount: 1, totalAmount: 1000, capturedAmount: 1000 }),
          currency({ currency: "EUR", orderCount: 1, totalAmount: 2500, capturedAmount: 2500 }),
        ]}
      />,
    );
    expect(html).toContain('id="currency-GBP"');
    expect(html).toContain('id="currency-EUR"');
    expect(html).toContain(formatMoney(1000, "GBP"));
    expect(html).toContain(formatMoney(2500, "EUR"));
    // One block and one volume tile per currency, and no combined total of the two.
    expect(html.split("<section").length - 1).toBe(2);
    expect(html.split("Order volume</dt>").length - 1).toBe(2);
    expect(html).not.toContain(formatMoney(3500, "GBP"));
  });

  it("lists each payment method with its orders and volume", () => {
    const html = renderToStaticMarkup(
      <DashboardPage
        currencies={[
          currency({
            orderCount: 2,
            totalAmount: 3000,
            paymentMethods: [{ paymentMethod: "amex", orderCount: 2, totalAmount: 3000 }],
          }),
        ]}
      />,
    );
    expect(html).toContain(`<th scope="row">${PAYMENT_METHOD_LABELS.amex}</th>`);
    expect(html).toContain(formatMoney(3000, "GBP"));
  });
});
