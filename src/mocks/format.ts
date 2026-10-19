import type { Money } from "./data";

export function formatMockMoney({ amount, currency }: Money) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

export function formatMockDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "UTC" });
}
