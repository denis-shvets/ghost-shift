export function formatMockDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "UTC" });
}
