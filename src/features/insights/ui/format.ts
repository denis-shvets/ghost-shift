import { formatMoney } from "~/features/orders/model/money";

const percent = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 });

// A null rate means nothing to divide by, so it shows a dash.
export function formatRate(rate: number | null) {
  return rate === null ? "–" : percent.format(rate);
}

// Same dash as a rate: no orders means no average.
export function formatAverageOrderValue(amount: number | null, currency: string) {
  return amount === null ? "–" : formatMoney(amount, currency);
}
