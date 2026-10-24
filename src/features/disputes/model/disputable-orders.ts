// A dispute is a claim about money the customer paid and still holds, so the order must have captured money
// that hasn't all been refunded. A canceled or expired order can still hold captured money, so this checks the amounts, not the status.
export function isDisputable(order: { capturedAmount: number; refundedAmount: number }) {
  return order.capturedAmount > order.refundedAmount;
}
