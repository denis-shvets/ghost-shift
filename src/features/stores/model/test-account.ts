// Sample account for a platform developer testing the form. Built from the store, so each store gets its own.
// The number is invented, and taken from the store id's digits.
export function testAccountFor(store: { id: string; name: string; currency: string }) {
  return {
    label: `Test account (${store.currency})`,
    accountHolderName: store.name,
    accountNumber: store.id.replace(/\D/g, "").padEnd(12, "0").slice(0, 12),
  };
}
