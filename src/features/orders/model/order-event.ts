// What each timeline action stores in order_events.metadata. Amounts are in minor units.
// The database only checks that metadata is an object; our own code writes these shapes.
type LineQuantity = { position: number; quantity: number };

type MetadataByAction = {
  authorized: { amount: number };
  captured: { amount: number; lines?: LineQuantity[] };
  refunded: { amount: number; reason?: string; lines?: LineQuantity[] };
  // The part of the authorization that was let go and can no longer be captured.
  canceled: { releasedAmount: number };
  expired: { releasedAmount: number };
};

// The database enum reads this list. Every action needs a metadata shape above, or this fails typecheck.
export const ORDER_EVENT_ACTIONS = [
  "authorized",
  "captured",
  "refunded",
  "canceled",
  "expired",
] as const satisfies readonly (keyof MetadataByAction)[];

export type OrderEventAction = (typeof ORDER_EVENT_ACTIONS)[number];

export type OrderEventMetadata<A extends OrderEventAction = OrderEventAction> = MetadataByAction[A];

// One timeline entry, with metadata narrowed by its action.
export type OrderEvent = {
  [A in OrderEventAction]: {
    id: string;
    occurredAt: Date;
    action: A;
    actorName: string;
    metadata: MetadataByAction[A];
  };
}[OrderEventAction];
