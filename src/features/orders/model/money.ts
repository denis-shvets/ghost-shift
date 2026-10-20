// Currencies we use have two decimals. Add a lookup here before supporting one that doesn't.
const MINOR_UNITS = 100;

export function formatMoney(minorAmount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    minorAmount / MINOR_UNITS,
  );
}

// "12.50" from a form field to 1250. NaN when the text isn't a number.
export function toMinorUnits(text: string) {
  return text.trim() === "" ? Number.NaN : Math.round(Number(text) * MINOR_UNITS);
}

// 1250 to "12.50", for a form field's starting value.
export function toMajorUnits(minorAmount: number) {
  return (minorAmount / MINOR_UNITS).toFixed(2);
}
