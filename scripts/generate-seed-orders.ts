// Generates supabase/seed-orders.sql: fixed demo orders plus random ones, all from a fixed Faker seed.
// Run with `pnpm db:generate-seed`. Do not edit the SQL by hand.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { type Faker, faker, fakerDE, fakerFI, fakerNB_NO, fakerSV } from "@faker-js/faker";

import type { OrderEventAction } from "../src/features/orders/model/order-event.ts";
import type { OrderStatus } from "../src/features/orders/model/order-statuses.ts";
import {
  authorizationExpiresAt,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "../src/features/orders/model/payment-methods.ts";
import {
  catalogProducts,
  MARKETS,
  type Market,
  type SampleProduct,
} from "../src/features/orders/model/store-catalogs.ts";

const NOW = new Date("2026-10-19T00:00:00Z");
const HOUR = 60 * 60 * 1000;
const OUTPUT = fileURLToPath(new URL("../supabase/seed-orders.sql", import.meta.url));
const RANDOM_ORDER_COUNT = 165;

const REFUND_REASONS = [
  "Damaged item",
  "Customer returned item",
  "Late delivery",
  "Price adjustment",
];

// Same store ids as src/shared/seed/seed-ids.json. Currency and market are from supabase/seed.sql.
const seedIds = JSON.parse(
  readFileSync(new URL("../src/shared/seed/seed-ids.json", import.meta.url), "utf8"),
) as { stores: Record<string, string> };

const CURRENCIES: Record<Market, string> = { SE: "SEK", FI: "EUR", NO: "NOK", DE: "EUR" };
const storeIn = (id: string, market: Market): Store => ({
  id,
  market,
  currency: CURRENCIES[market],
  vat: MARKETS[market].taxRate,
});
const SE = storeIn(seedIds.stores.velourVault, "SE");
const FI = storeIn(seedIds.stores.plaidParade, "FI");
const NO = storeIn(seedIds.stores.silkPineOslo, "NO");
const DE = storeIn(seedIds.stores.satinSparrow, "DE");
// A catalog product at the store, by its SKU without the store code, as a line of the given quantity.
const priced = (store: Store, sku: string, quantity: number): LineInput =>
  productLine(
    catalogProducts(store.id).find((product) => product.sku.endsWith(`-${sku}`))!,
    quantity,
  );
// Random orders spread over the stores of the two companies that have them (see seed.sql).
const NORTHSTAR_STORES: Store[] = [
  storeIn(seedIds.stores.velourVault, "SE"),
  storeIn(seedIds.stores.mossAndMirror, "SE"),
  storeIn(seedIds.stores.ginghamGalaxy, "DE"),
  storeIn(seedIds.stores.cobaltCloset, "DE"),
  storeIn(seedIds.stores.silkPineOslo, "NO"),
  storeIn(seedIds.stores.tangerineThread, "NO"),
  storeIn(seedIds.stores.fjordFabric, "NO"),
  storeIn(seedIds.stores.plaidParade, "FI"),
  storeIn(seedIds.stores.woolWhisper, "FI"),
  storeIn(seedIds.stores.denimDune, "SE"),
  storeIn(seedIds.stores.linenLantern, "DE"),
  storeIn(seedIds.stores.corduroyComet, "FI"),
  storeIn(seedIds.stores.rayonRhapsody, "SE"),
  storeIn(seedIds.stores.chiffonCascade, "NO"),
  storeIn(seedIds.stores.thimbleThyme, "DE"),
];
const POCKET_STORES: Store[] = [
  storeIn(seedIds.stores.satinSparrow, "DE"),
  storeIn(seedIds.stores.buttonBazaar, "SE"),
  storeIn(seedIds.stores.zipperZenith, "FI"),
];
// Addresses and shipping names look local to each store's market.
const LOCAL_FAKERS: Record<string, Faker> = {
  SE: fakerSV,
  FI: fakerFI,
  NO: fakerNB_NO,
  DE: fakerDE,
};

// vat is the market's standard rate in basis points, the same as the store's catalog.
type Store = { id: string; market: string; currency: string; vat: number };
type Customer = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
};
type LineInput = {
  type: "physical" | "digital" | "shipping_fee";
  sku: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};
export type SeedLine = LineInput & { position: number };
export type SeedAddress = {
  kind: "billing" | "shipping";
  firstName: string;
  lastName: string;
  streetAddress: string;
  postalCode: string;
  city: string;
  country: string;
};
export type SeedEvent = {
  action: OrderEventAction;
  occurredAt: Date;
  actorName: string;
  metadata: Record<string, unknown>;
};
export type SeedOrder = {
  id: string;
  reference: string;
  createdAt: Date;
  expiresAt: Date;
  storeId: string;
  currency: string;
  customer: Customer;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  totalAmount: number;
  capturedAmount: number;
  refundedAmount: number;
  shippingCarrier: string;
  shippingTracking: string | null;
  shippedAt: Date | null;
  lines: SeedLine[];
  addresses: SeedAddress[];
  events: SeedEvent[];
};

type OrderInput = {
  id: string;
  reference: string;
  createdAt: Date;
  store: Store;
  customer: Customer;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  lines: LineInput[];
  captured: number;
  refunded: number;
  shippingCarrier: string;
  shippingTracking: string | null;
  shippedAt?: Date;
  sameShipping: boolean;
};

const productLine = (product: SampleProduct, quantity: number): LineInput => ({
  type: product.type,
  sku: product.sku,
  name: product.name,
  quantity,
  unitPrice: product.unitPrice,
  taxRate: product.taxRate,
});

const sumLines = (lines: LineInput[]) =>
  lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

function makeAddresses(customer: Customer, store: Store, sameShipping: boolean): SeedAddress[] {
  const local = LOCAL_FAKERS[store.market];
  const billing: SeedAddress = {
    kind: "billing",
    firstName: customer.firstName,
    lastName: customer.lastName,
    streetAddress: local.location.streetAddress(),
    postalCode: local.location.zipCode(),
    city: local.location.city(),
    country: store.market,
  };
  const shipping: SeedAddress = sameShipping
    ? { ...billing, kind: "shipping" }
    : {
        kind: "shipping",
        firstName: local.person.firstName(),
        lastName: local.person.lastName(),
        streetAddress: local.location.streetAddress(),
        postalCode: local.location.zipCode(),
        city: local.location.city(),
        country: store.market,
      };
  return [billing, shipping];
}

// Events are built oldest first. Each step moves forward at most 24 hours and never past NOW.
function makeEvents(order: {
  createdAt: Date;
  expiresAt: Date;
  status: OrderStatus;
  totalAmount: number;
  capturedAmount: number;
  refundedAmount: number;
}): SeedEvent[] {
  const { createdAt, expiresAt, status, totalAmount, capturedAmount, refundedAmount } = order;
  const events: SeedEvent[] = [
    {
      action: "authorized",
      occurredAt: createdAt,
      actorName: "Phantom Checkout",
      metadata: { amount: totalAmount },
    },
  ];
  let at = createdAt;
  const next = () => {
    at = new Date(
      Math.min(at.getTime() + faker.number.int({ min: 1, max: 24 }) * HOUR, NOW.getTime()),
    );
    return at;
  };

  if (capturedAmount > 0) {
    const split =
      capturedAmount > 1 && faker.datatype.boolean({ probability: 0.4 })
        ? faker.number.int({ min: 1, max: capturedAmount - 1 })
        : null;
    const parts = split === null ? [capturedAmount] : [split, capturedAmount - split];
    for (const amount of parts) {
      events.push({
        action: "captured",
        occurredAt: next(),
        actorName: faker.person.fullName(),
        metadata: { amount },
      });
    }
  }
  if (refundedAmount > 0) {
    events.push({
      action: "refunded",
      occurredAt: next(),
      actorName: faker.person.fullName(),
      metadata: {
        amount: refundedAmount,
        reason: faker.helpers.arrayElement(REFUND_REASONS),
      },
    });
  }
  if (status === "canceled") {
    events.push({
      action: "canceled",
      occurredAt: next(),
      actorName: faker.person.fullName(),
      metadata: { releasedAmount: totalAmount - capturedAmount },
    });
  }
  if (status === "expired") {
    events.push({
      action: "expired",
      occurredAt: expiresAt,
      actorName: "System",
      // The same reason public.expire_orders() writes.
      metadata: {
        releasedAmount: totalAmount - capturedAmount,
        reason: `Authorization expired after ${Math.round(
          (expiresAt.getTime() - createdAt.getTime()) / (24 * HOUR),
        )} days`,
      },
    });
  }
  return events;
}

function makeOrder(input: OrderInput): SeedOrder {
  const expiresAt = authorizationExpiresAt(input.createdAt, input.paymentMethod);
  const lines = input.lines.map((line, index) => ({
    position: index + 1,
    ...line,
  }));
  const totalAmount = sumLines(input.lines);
  const addresses = makeAddresses(input.customer, input.store, input.sameShipping);
  const order = {
    id: input.id,
    reference: input.reference,
    createdAt: input.createdAt,
    expiresAt,
    storeId: input.store.id,
    currency: input.store.currency,
    customer: input.customer,
    paymentMethod: input.paymentMethod,
    status: input.status,
    totalAmount,
    capturedAmount: input.captured,
    refundedAmount: input.refunded,
    shippingCarrier: input.shippingCarrier,
    shippingTracking: input.shippingTracking,
    shippedAt: input.shippedAt ?? null,
    lines,
    addresses,
  };
  return { ...order, events: makeEvents(order) };
}

// Fixed scenarios. The first five are copied from supabase/seed.sql (tests depend on them).
function fixedOrders(): SeedOrder[] {
  const customer = (firstName: string, lastName: string, email: string): Customer => ({
    firstName,
    lastName,
    email,
    phone: null,
  });
  const line = (
    type: LineInput["type"],
    sku: string | null,
    name: string,
    quantity: number,
    unitPrice: number,
    taxRate: number,
  ): LineInput => ({ type, sku, name, quantity, unitPrice, taxRate });
  const at = (iso: string) => new Date(iso);

  return [
    makeOrder({
      id: "743bf9c5-f7a6-47d6-b1cb-bf9811f8b922",
      reference: "NS-1001",
      createdAt: at("2026-10-17T08:12:00Z"),
      store: SE,
      customer: customer("Astrid", "Lind", "astrid@example.com"),
      paymentMethod: "card",
      status: "authorized",
      lines: [priced(SE, "FAS-07", 1)],
      captured: 0,
      refunded: 0,
      shippingCarrier: "PostNord",
      shippingTracking: null,
      sameShipping: true,
    }),
    makeOrder({
      id: "a04509c1-b524-494a-8662-8d6ed7bcfc8d",
      reference: "NS-1002",
      createdAt: at("2026-10-16T19:40:00Z"),
      store: SE,
      customer: customer("Erik", "Holm", "erik@example.com"),
      paymentMethod: "bank_transfer",
      status: "captured",
      lines: [priced(SE, "FAS-05", 2), line("shipping_fee", null, "Shipping, DHL", 1, 4900, 2500)],
      captured: 48680,
      refunded: 0,
      shippingCarrier: "DHL",
      shippingTracking: "DHL-7781",
      sameShipping: true,
    }),
    makeOrder({
      id: "29fb84e7-03da-44f2-9389-dbbe9e12d3f3",
      reference: "NS-1003",
      createdAt: at("2026-10-15T11:05:00Z"),
      store: FI,
      customer: customer("Aino", "Virtanen", "aino@example.com"),
      paymentMethod: "paypal",
      status: "captured",
      lines: [priced(FI, "FAS-10", 1), priced(FI, "FAS-13", 1)],
      captured: 6980,
      refunded: 2000,
      shippingCarrier: "Posti",
      shippingTracking: "PO-5521",
      sameShipping: true,
    }),
    makeOrder({
      id: "fc14a20f-334f-4f9a-9b7f-162626167f1f",
      reference: "NS-1004",
      createdAt: at("2026-10-03T22:30:00Z"),
      store: SE,
      customer: customer("Maja", "Berg", "maja@example.com"),
      paymentMethod: "card",
      status: "expired",
      lines: [priced(SE, "FAS-29", 1)],
      captured: 0,
      refunded: 0,
      shippingCarrier: "PostNord",
      shippingTracking: null,
      sameShipping: true,
    }),
    makeOrder({
      id: "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b",
      reference: "PA-2001",
      createdAt: at("2026-10-16T10:00:00Z"),
      store: DE,
      customer: customer("Jonas", "Weber", "jonas@example.com"),
      paymentMethod: "card",
      status: "authorized",
      lines: [priced(DE, "FAS-30", 1)],
      captured: 0,
      refunded: 0,
      shippingCarrier: "DHL",
      shippingTracking: null,
      shippedAt: at("2026-10-17T09:00:00Z"),
      sameShipping: true,
    }),
    // Added scenarios: every status and payment method shows up at least once.
    makeOrder({
      id: faker.string.uuid(),
      reference: "NS-1005",
      createdAt: at("2026-10-15T09:00:00Z"),
      store: SE,
      customer: customer("Sofia", "Nyberg", "sofia@example.com"),
      paymentMethod: "amex",
      status: "part_captured",
      lines: [priced(SE, "FAS-22", 2)],
      captured: 45000,
      refunded: 10000,
      shippingCarrier: "PostNord",
      shippingTracking: null,
      sameShipping: true,
    }),
    makeOrder({
      id: faker.string.uuid(),
      reference: "NS-1006",
      createdAt: at("2026-10-08T14:20:00Z"),
      store: FI,
      customer: customer("Lauri", "Korhonen", "lauri@example.com"),
      paymentMethod: "apple_pay",
      status: "refunded",
      lines: [priced(FI, "FAS-11", 1)],
      captured: 3490,
      refunded: 3490,
      shippingCarrier: "Posti",
      shippingTracking: "PO-7712",
      sameShipping: true,
    }),
    makeOrder({
      id: faker.string.uuid(),
      reference: "NS-1007",
      createdAt: at("2026-10-06T08:45:00Z"),
      store: SE,
      customer: customer("Hanna", "Strand", "hanna@example.com"),
      paymentMethod: "google_pay",
      status: "canceled",
      lines: [priced(SE, "FAS-18", 1)],
      captured: 0,
      refunded: 0,
      shippingCarrier: "PostNord",
      shippingTracking: null,
      sameShipping: true,
    }),
    makeOrder({
      id: faker.string.uuid(),
      reference: "NS-1008",
      createdAt: at("2026-10-12T12:00:00Z"),
      store: SE,
      customer: customer("Oskar", "Dahl", "oskar@example.com"),
      paymentMethod: "card",
      status: "authorized",
      lines: [priced(SE, "FAS-03", 2)],
      captured: 0,
      refunded: 0,
      shippingCarrier: "PostNord",
      shippingTracking: null,
      sameShipping: true,
    }),
    makeOrder({
      id: faker.string.uuid(),
      reference: "NS-1009",
      createdAt: at("2026-10-11T10:00:00Z"),
      store: NO,
      customer: customer("Ingrid", "Haugen", "ingrid@example.com"),
      paymentMethod: "card",
      status: "captured",
      lines: [priced(NO, "FAS-25", 2)],
      captured: 275770,
      refunded: 20000,
      shippingCarrier: "Bring",
      shippingTracking: "BR-1190",
      sameShipping: true,
    }),
    makeOrder({
      id: faker.string.uuid(),
      reference: "NS-1010",
      createdAt: at("2026-10-18T06:00:00Z"),
      store: FI,
      customer: customer("Veikko", "Laine", "veikko@example.com"),
      paymentMethod: "bank_transfer",
      status: "authorized",
      lines: [priced(FI, "FAS-21", 2)],
      captured: 0,
      refunded: 0,
      shippingCarrier: "Posti",
      shippingTracking: null,
      // Shipped but at another company, so the Satin Sparrow agent never sees it.
      shippedAt: at("2026-10-18T15:00:00Z"),
      sameShipping: true,
    }),
    makeOrder({
      id: faker.string.uuid(),
      reference: "PA-2002",
      createdAt: at("2026-10-10T14:00:00Z"),
      store: DE,
      customer: customer("Lukas", "Becker", "lukas@example.com"),
      paymentMethod: "amazon_pay",
      status: "captured",
      lines: [priced(DE, "FAS-15", 2), line("shipping_fee", null, "Shipping, DHL", 1, 990, 1900)],
      captured: 10970,
      refunded: 0,
      shippingCarrier: "DHL",
      shippingTracking: "DHL-4420",
      shippedAt: at("2026-10-11T08:00:00Z"),
      sameShipping: false,
    }),
    makeOrder({
      id: faker.string.uuid(),
      reference: "PA-2003",
      createdAt: at("2026-10-04T09:30:00Z"),
      store: DE,
      customer: customer("Mila", "Kruger", "mila@example.com"),
      paymentMethod: "apple_pay",
      status: "expired",
      lines: [priced(DE, "FAS-11", 1)],
      captured: 0,
      refunded: 0,
      shippingCarrier: "DHL",
      shippingTracking: null,
      sameShipping: true,
    }),
  ];
}

// Work for the orders agent: open Satin Sparrow orders, some shipped. Built after the random
// orders, so adding them doesn't change the Faker sequence the earlier orders came from.
function shippedOrders(): SeedOrder[] {
  const pocket = (
    id: string,
    reference: string,
    status: "authorized" | "part_captured",
    shippedAt: Date | undefined,
    carrier: string,
    captured = 0,
  ) =>
    makeOrder({
      id,
      reference,
      createdAt: new Date("2026-10-18T08:00:00Z"),
      store: DE,
      customer: {
        firstName: "Lena",
        lastName: "Schmidt",
        email: `${reference.toLowerCase()}@example.com`,
        phone: null,
      },
      // 28 days, so the demo orders stay open for a while after the seed date.
      paymentMethod: "bank_transfer",
      status,
      lines: [
        priced(DE, "FAS-25", 1),
        {
          type: "shipping_fee",
          sku: null,
          name: `Shipping, ${carrier}`,
          quantity: 1,
          unitPrice: 590,
          taxRate: 1900,
        },
      ],
      captured,
      refunded: 0,
      shippingCarrier: carrier,
      shippingTracking: shippedAt ? `${carrier.toUpperCase()}-${reference.slice(3)}` : null,
      shippedAt,
      sameShipping: true,
    });
  const shipped = new Date("2026-10-18T16:00:00Z");
  return [
    pocket("5b1d0a00-0000-4000-8000-000000002004", "PA-2004", "authorized", shipped, "UPS"),
    pocket("5b1d0a00-0000-4000-8000-000000002005", "PA-2005", "authorized", shipped, "DHL"),
    // Not shipped yet, so the agent leaves it.
    pocket("5b1d0a00-0000-4000-8000-000000002006", "PA-2006", "authorized", undefined, "DHL"),
    // Shipped, but a person captured part of it. The agent leaves the rest to them.
    pocket(
      "5b1d0a00-0000-4000-8000-000000002007",
      "PA-2007",
      "part_captured",
      shipped,
      "DHL",
      2000,
    ),
  ];
}

function randomOrder(index: number, reference: string): SeedOrder {
  const store = reference.startsWith("PA")
    ? faker.helpers.arrayElement(POCKET_STORES)
    : faker.helpers.arrayElement(NORTHSTAR_STORES);
  const paymentMethod = faker.helpers.arrayElement(PAYMENT_METHODS);
  const createdAt = new Date(
    Math.floor(
      faker.date
        .between({
          from: new Date("2026-07-21T00:00:00Z"),
          to: new Date("2026-10-02T23:59:59Z"),
        })
        .getTime() / 60000,
    ) * 60000,
  );
  const expiresAt = authorizationExpiresAt(createdAt, paymentMethod);
  const products = faker.helpers.arrayElements(
    catalogProducts(store.id),
    faker.number.int({ min: 1, max: 3 }),
  );
  const lines = products.map((product) =>
    productLine(product, faker.number.int({ min: 1, max: 3 })),
  );
  const carrier = faker.helpers.arrayElement(["PostNord", "DHL", "Posti", "Bring", "UPS"]);
  const hasPhysical = lines.some((line) => line.type === "physical");
  if (hasPhysical && faker.datatype.boolean({ probability: 0.5 })) {
    lines.push({
      type: "shipping_fee",
      sku: null,
      name: `Shipping, ${carrier}`,
      quantity: 1,
      unitPrice: 4900,
      taxRate: store.vat,
    });
  }
  const total = sumLines(lines);

  const open = expiresAt > NOW;
  const status: OrderStatus = open
    ? faker.helpers.weightedArrayElement([
        { weight: 35, value: "authorized" },
        { weight: 25, value: "part_captured" },
        { weight: 25, value: "captured" },
        { weight: 15, value: "canceled" },
      ])
    : faker.helpers.weightedArrayElement([
        { weight: 35, value: "expired" },
        { weight: 35, value: "captured" },
        { weight: 15, value: "refunded" },
        { weight: 15, value: "canceled" },
      ]);

  let captured = 0;
  let refunded = 0;
  if (status === "part_captured") {
    captured = faker.number.int({ min: 1, max: total - 1 });
    refunded = faker.datatype.boolean({ probability: 0.3 })
      ? faker.number.int({ min: 0, max: captured })
      : 0;
  } else if (status === "captured") {
    captured = total;
    refunded = faker.datatype.boolean({ probability: 0.2 })
      ? faker.number.int({ min: 1, max: captured - 1 })
      : 0;
  } else if (status === "refunded") {
    captured = total;
    refunded = total;
  }

  const customer: Customer = {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    // Lower case, the same as the order API saves emails.
    email: faker.internet.email({ provider: "example.com" }).toLowerCase(),
    phone: faker.datatype.boolean({ probability: 0.6 }) ? faker.phone.number() : null,
  };

  return makeOrder({
    id: faker.string.uuid(),
    reference,
    createdAt,
    store,
    customer,
    paymentMethod,
    status,
    lines,
    captured,
    refunded,
    shippingCarrier: carrier,
    shippingTracking: faker.datatype.boolean({ probability: 0.6 })
      ? faker.string.alphanumeric({ length: 10, casing: "upper" })
      : null,
    sameShipping: faker.datatype.boolean({ probability: 0.8 }),
  });
}

export function buildSeedOrders(): SeedOrder[] {
  faker.seed(2026);
  for (const local of Object.values(LOCAL_FAKERS)) local.seed(2026);
  const fixed = fixedOrders();
  let northstarCount = 0;
  let pocketCount = 0;
  const random = Array.from({ length: RANDOM_ORDER_COUNT }, (_, index) => {
    // Every seventh random order is a Pocket Atelier order.
    if (index % 7 === 6) {
      pocketCount += 1;
      return randomOrder(index, `PA-${3000 + pocketCount}`);
    }
    northstarCount += 1;
    return randomOrder(index, `NS-${2000 + northstarCount}`);
  });
  return [...fixed, ...random, ...shippedOrders()];
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const nullable = (value: string | null) => (value === null ? "null" : quote(value));
const stamp = (date: Date) => quote(date.toISOString());

function insert(table: string, columns: string[], rows: string[]) {
  return `insert into ${table} (${columns.join(", ")}) values\n${rows.map((row) => `  (${row})`).join(",\n")};\n`;
}

export function toSql(orders: SeedOrder[]): string {
  const orderRows = orders.map((order) =>
    [
      quote(order.id),
      quote(order.reference),
      stamp(order.createdAt),
      stamp(order.expiresAt),
      quote(order.storeId),
      quote(order.currency),
      quote(order.customer.firstName),
      quote(order.customer.lastName),
      quote(order.customer.email),
      nullable(order.customer.phone),
      quote(order.paymentMethod),
      quote(order.status),
      String(order.totalAmount),
      String(order.capturedAmount),
      String(order.refundedAmount),
      quote(order.shippingCarrier),
      nullable(order.shippingTracking),
      order.shippedAt ? stamp(order.shippedAt) : "null",
    ].join(", "),
  );
  const lineRows = orders.flatMap((order) =>
    order.lines.map((line) =>
      [
        quote(order.id),
        String(line.position),
        quote(line.type),
        nullable(line.sku),
        quote(line.name),
        String(line.quantity),
        String(line.unitPrice),
        String(line.taxRate),
      ].join(", "),
    ),
  );
  const addressRows = orders.flatMap((order) =>
    order.addresses.map((address) =>
      [
        quote(order.id),
        quote(address.kind),
        quote(address.firstName),
        quote(address.lastName),
        "null",
        quote(address.streetAddress),
        "null",
        quote(address.postalCode),
        quote(address.city),
        "null",
        quote(address.country),
        "null",
      ].join(", "),
    ),
  );
  const eventRows = orders.flatMap((order) =>
    order.events.map((event) =>
      [
        quote(order.id),
        stamp(event.occurredAt),
        quote(event.action),
        "null",
        quote(event.actorName),
        `${quote(JSON.stringify(event.metadata))}::jsonb`,
      ].join(", "),
    ),
  );

  return [
    "-- Generated by `pnpm db:generate-seed` from scripts/generate-seed-orders.ts. Do not edit by hand.",
    "",
    insert(
      "orders",
      [
        "id",
        "reference",
        "created_at",
        "expires_at",
        "store_id",
        "currency",
        "customer_first_name",
        "customer_last_name",
        "customer_email",
        "customer_phone",
        "payment_method",
        "status",
        "total_amount",
        "captured_amount",
        "refunded_amount",
        "shipping_carrier",
        "shipping_tracking",
        "shipped_at",
      ],
      orderRows,
    ),
    insert(
      "order_lines",
      ["order_id", "position", "type", "sku", "name", "quantity", "unit_price", "tax_rate"],
      lineRows,
    ),
    insert(
      "order_addresses",
      [
        "order_id",
        "kind",
        "first_name",
        "last_name",
        "company",
        "street_address",
        "street_address2",
        "postal_code",
        "city",
        "region",
        "country",
        "phone",
      ],
      addressRows,
    ),
    insert(
      "order_events",
      ["order_id", "occurred_at", "action", "actor_user_id", "actor_name", "metadata"],
      eventRows,
    ),
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(OUTPUT, toSql(buildSeedOrders()));
}
