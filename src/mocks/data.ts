// Mocked data for the scaffold. Everything here is invented and will be
// replaced by real data from the database when features are built.

export type Money = { amount: number; currency: "SEK" | "EUR" | "NOK" | "GBP" };

export const stores = [
  { id: "sto_se", name: "Moonlight Goods Sweden", market: "SE", currency: "SEK", status: "live" },
  { id: "sto_fi", name: "Moonlight Goods Finland", market: "FI", currency: "EUR", status: "live" },
  { id: "sto_no", name: "Moonlight Goods Norway", market: "NO", currency: "NOK", status: "test" },
] as const;

export type OrderStatus =
  | "authorized"
  | "captured"
  | "part_captured"
  | "refunded"
  | "part_refunded"
  | "canceled"
  | "expired";

export type Order = {
  id: string;
  reference: string;
  createdAt: string;
  storeId: string;
  shopper: { name: string; email: string; country: string };
  paymentMethod: "card" | "invoice" | "wallet" | "bank_transfer";
  status: OrderStatus;
  total: Money;
  captured: Money;
  refunded: Money;
  lines: { name: string; quantity: number; unitPrice: Money }[];
  shipping: { carrier: string; tracking?: string };
};

const sek = (amount: number): Money => ({ amount, currency: "SEK" });
const eur = (amount: number): Money => ({ amount, currency: "EUR" });

export const orders: Order[] = [
  {
    id: "ord_1001",
    reference: "MG-1001",
    createdAt: "2026-10-17T08:12:00Z",
    storeId: "sto_se",
    shopper: { name: "Astrid Lind", email: "astrid@example.com", country: "SE" },
    paymentMethod: "card",
    status: "authorized",
    total: sek(1290),
    captured: sek(0),
    refunded: sek(0),
    lines: [{ name: "Lantern, brass", quantity: 1, unitPrice: sek(1290) }],
    shipping: { carrier: "PostNord" },
  },
  {
    id: "ord_1002",
    reference: "MG-1002",
    createdAt: "2026-10-16T19:40:00Z",
    storeId: "sto_se",
    shopper: { name: "Erik Holm", email: "erik@example.com", country: "SE" },
    paymentMethod: "invoice",
    status: "captured",
    total: sek(498),
    captured: sek(498),
    refunded: sek(0),
    lines: [{ name: "Candle set", quantity: 2, unitPrice: sek(249) }],
    shipping: { carrier: "DHL", tracking: "DHL-7781" },
  },
  {
    id: "ord_1003",
    reference: "MG-1003",
    createdAt: "2026-10-15T11:05:00Z",
    storeId: "sto_fi",
    shopper: { name: "Aino Virtanen", email: "aino@example.com", country: "FI" },
    paymentMethod: "wallet",
    status: "part_refunded",
    total: eur(120),
    captured: eur(120),
    refunded: eur(40),
    lines: [
      { name: "Wool blanket", quantity: 1, unitPrice: eur(80) },
      { name: "Night lamp", quantity: 1, unitPrice: eur(40) },
    ],
    shipping: { carrier: "Posti", tracking: "PO-5521" },
  },
  {
    id: "ord_1004",
    reference: "MG-1004",
    createdAt: "2026-10-03T22:30:00Z",
    storeId: "sto_se",
    shopper: { name: "Maja Berg", email: "maja@example.com", country: "SE" },
    paymentMethod: "card",
    status: "expired",
    total: sek(2150),
    captured: sek(0),
    refunded: sek(0),
    lines: [{ name: "Oak shelf", quantity: 1, unitPrice: sek(2150) }],
    shipping: { carrier: "PostNord" },
  },
];

export const disputes = [
  {
    id: "dis_301",
    orderId: "ord_1002",
    type: "chargeback",
    reason: "Item not received",
    amount: sek(498),
    status: "needs_response",
    respondBy: "2026-10-24",
  },
];

export const settlements = [
  {
    id: "set_401",
    storeId: "sto_se",
    payoutDate: "2026-10-14",
    gross: sek(18450),
    fees: sek(-512),
    refunds: sek(-1200),
    net: sek(16738),
    orders: 31,
  },
  {
    id: "set_402",
    storeId: "sto_fi",
    payoutDate: "2026-10-14",
    gross: eur(2310),
    fees: eur(-61),
    refunds: eur(-40),
    net: eur(2209),
    orders: 14,
  },
];

export const paymentLinks = [
  {
    id: "pl_501",
    description: "Custom oak table",
    amount: sek(8900),
    status: "sent",
    expiresAt: "2026-10-31",
  },
];

export const team = [
  { id: "usr_1", name: "Owner", email: "owner@example.com", kind: "human", role: "admin" },
  { id: "usr_2", name: "QA tester", email: "qa@example.com", kind: "human", role: "operator" },
  {
    id: "agt_orders",
    name: "Orders agent",
    email: "owner+agent.orders@example.com",
    kind: "agent",
    role: "orders",
  },
] as const;

export const auditLog = [
  {
    id: "log_9003",
    at: "2026-10-17T06:00:12Z",
    actor: "Orders agent",
    action: "order.cancel",
    target: "ord_1004",
    reason: "Authorization expired after 14 days",
  },
  {
    id: "log_9002",
    at: "2026-10-16T09:00:00Z",
    actor: "Orders agent",
    action: "refund.create",
    target: "ord_1003",
    reason: "Shopper reported a broken item with a photo",
  },
  {
    id: "log_9001",
    at: "2026-10-16T08:30:00Z",
    actor: "Owner",
    action: "store.update",
    target: "sto_no",
    reason: "Switched Norway store to test mode",
  },
];

export const apiKeys = [
  { id: "key_1", label: "Orders agent", prefix: "gs_live_4f2a", createdAt: "2026-10-10" },
];

export const webhooks = [
  {
    id: "wh_1",
    url: "https://example.com/hooks/orders",
    events: ["order.captured"],
    status: "active",
  },
];

export const emailsSent = [
  {
    id: "em_1",
    to: "owner@example.com",
    subject: "Dispute needs a response: MG-1002",
    sentAt: "2026-10-17T07:00:00Z",
    status: "delivered",
  },
];
