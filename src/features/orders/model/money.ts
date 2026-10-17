// Currencies we use have two decimals. Add a lookup here before supporting one that doesn't.
const MINOR_UNITS = 100;

export function formatMoney(minorAmount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    minorAmount / MINOR_UNITS,
  );
}
