// A dispute is a claim about money the customer paid and still holds, so the order must have captured money
// that hasn't all been refunded. Authorized, canceled, expired and fully refunded orders are left out.
export const DISPUTABLE_ORDER_STATUSES = ["part_captured", "captured"] as const;
