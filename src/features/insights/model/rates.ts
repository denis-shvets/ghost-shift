export type RateInput = {
  orderCount: number;
  settledOrderCount: number;
  totalAmount: number;
  capturedAmount: number;
  refundedAmount: number;
  capturedOrderCount: number;
  expiredOrderCount: number;
};

// null when there is nothing to divide by, so the page shows a dash instead of a fake 0%.
function share(part: number, whole: number) {
  return whole === 0 ? null : part / whole;
}

// Average order value is in minor units. Capture and expiry rates count settled orders (the
// open authorizations have no outcome yet), refund rate counts money.
export function computeRates(input: RateInput) {
  const average = share(input.totalAmount, input.orderCount);
  return {
    averageOrderValue: average === null ? null : Math.round(average),
    captureRate: share(input.capturedOrderCount, input.settledOrderCount),
    refundRate: share(input.refundedAmount, input.capturedAmount),
    expiryRate: share(input.expiredOrderCount, input.settledOrderCount),
  };
}
