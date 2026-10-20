import { formatMoney } from "./money";
import type { OrderEvent, OrderEventMetadata } from "./order-event";

// "(lines 1, 2)" for the lines a capture or refund covered; empty when none were given.
function describeLines(lines: OrderEventMetadata<"captured">["lines"]) {
  if (!lines?.length) return "";
  return ` (lines ${lines.map((line) => line.position).join(", ")})`;
}

// " – Damaged" when the event has a reason; empty when it has none.
function withReason(reason: string | undefined) {
  return reason ? ` – ${reason}` : "";
}

// One readable sentence for a timeline row. The switch lets TypeScript narrow each action's metadata.
export function describeEvent(event: OrderEvent, currency: string): string {
  switch (event.action) {
    case "authorized":
      return `Amount ${formatMoney(event.metadata.amount, currency)}`;
    case "captured":
      return `Captured ${formatMoney(event.metadata.amount, currency)}${withReason(event.metadata.reason)}${describeLines(event.metadata.lines)}`;
    case "refunded":
      return `Refunded ${formatMoney(event.metadata.amount, currency)}${withReason(event.metadata.reason)}${describeLines(event.metadata.lines)}`;
    case "canceled":
    case "expired":
      return `Released ${formatMoney(event.metadata.releasedAmount, currency)}${withReason(event.metadata.reason)}`;
  }
}
