// The payment methods, in one place: the database enum, the create-order input and the seed read them.
export const PAYMENT_METHODS = [
  "amazon_pay",
  "amex",
  "apple_pay",
  "bank_transfer",
  "card",
  "google_pay",
  "paypal",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const DAY = 24 * 60 * 60 * 1000;
// Card and wallet authorizations run out after 7 days; the others after 28.
const SHORT_EXPIRY = new Set<PaymentMethod>(["card", "amex", "apple_pay", "google_pay"]);

// When an authorization made at `createdAt` runs out and nothing more can be captured.
export function authorizationExpiresAt(createdAt: Date, method: PaymentMethod): Date {
  return new Date(createdAt.getTime() + (SHORT_EXPIRY.has(method) ? 7 : 28) * DAY);
}
