// Same arithmetic as createOrder on the server, so the page shows the total the order will get.
export type PricedLine = { unitPrice: number; quantity: number };

export function lineTotal(line: PricedLine) {
  return line.unitPrice * line.quantity;
}

export function orderTotal(lines: PricedLine[]) {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}
