// Night Shift planner (docs/guides/night-shift.md). Plans the customers' checkouts for the next days
// and uploads them to the app's queue; the Worker cron places each order when it is due.
//   pnpm night-shift:plan [--days 7]     code picks the visit times, Claude fills the baskets
//   pnpm night-shift:upload <plan file>  queues the plan as the checkout account
// The :hosted scripts plan against and upload to the live app (.hosted.vars).
import { randomInt, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

import {
  type AddressInput,
  addressInput,
  createOrderInput,
  type CreateOrderInput,
} from "../src/features/orders/model/create-order-input.ts";
import {
  PAYMENT_METHODS,
  type PaymentMethod,
} from "../src/features/orders/model/payment-methods.ts";
import { catalogPick, PICK_MAX } from "../src/features/orders/model/store-catalogs.ts";
import {
  MAX_SCHEDULED_CHECKOUTS,
  type ScheduledCheckoutInput,
  scheduledCheckoutsInput,
} from "../src/features/scheduled-checkouts/model/scheduled-checkout-input.ts";
import { findClaude, runClaude, structuredOutput } from "./claude-runner.ts";
import {
  apiTarget,
  configInput,
  createApiClient,
  hostedConfigInput,
  parseConfig,
  runIfMain,
  unsetIfEmpty,
} from "./mcp-developer.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const CUSTOMERS_DIR = "docs/agents/customers";
const RULES = "docs/agents/night-shift.md";
const PLANS_DIR = ".night-shift";

export const CHECKOUT_EMAIL = "checkout@ghostshift.test";

// The checkout account signs in to read the queue and to upload. The hosted account has its own
// password, never the local SEED_PASSWORD.
const customerConfigInput = configInput.omit({ SEED_DEVELOPER_EMAIL: true });
const customerHostedConfigInput = hostedConfigInput.extend({
  HOSTED_CHECKOUT_PASSWORD: z.preprocess(
    unsetIfEmpty,
    z.string({
      error: "HOSTED_CHECKOUT_PASSWORD is required. Set it in .hosted.vars.",
    }),
  ),
});

export function readCustomerConfig(env: NodeJS.ProcessEnv, hosted: boolean) {
  if (hosted) {
    const config = parseConfig(customerHostedConfigInput, env);
    return {
      ...apiTarget(config),
      email: CHECKOUT_EMAIL,
      password: config.HOSTED_CHECKOUT_PASSWORD,
    };
  }
  const config = parseConfig(customerConfigInput, env);
  return {
    ...apiTarget(config),
    email: CHECKOUT_EMAIL,
    password: config.SEED_PASSWORD,
  };
}

const timeZone = z.string().refine(
  (zone) => {
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  },
  { error: "Unknown time zone. Use an IANA name, for example Europe/Berlin." },
);

// Mon to Sun, as in the persona files. Date.getUTCDay() counts from Sunday, hence the shift.
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const day = "(Mon|Tue|Wed|Thu|Fri|Sat|Sun)";
const time = "([01][0-9]|2[0-3]):([0-5][0-9])";
const windowPattern = new RegExp(`^${day}(?:-${day})? ${time}-${time}$`);

// "Mon-Fri 19:00-23:00" or "Sat 10:00-14:00". An end before the start runs past midnight.
const visitWindow = z
  .string()
  .regex(windowPattern, { error: 'Write a window like "Mon-Fri 19:00-23:00".' })
  .transform((text) => {
    // The regex guarantees every group, so these defaults only satisfy the types.
    const [
      ,
      first = "",
      last = first,
      startHour = "0",
      startMinute = "0",
      endHour = "0",
      endMinute = "0",
    ] = windowPattern.exec(text) ?? [];
    const days = new Set<number>();
    for (let index = DAYS.indexOf(first); ; index = (index + 1) % 7) {
      days.add((index + 1) % 7);
      if (DAYS[index] === last) break;
    }
    return {
      days,
      start: Number(startHour) * 60 + Number(startMinute),
      end: Number(endHour) * 60 + Number(endMinute),
    };
  })
  .refine((window) => window.start !== window.end, {
    error: "A window needs some time in it.",
  });

export const scheduleInput = z.object({
  timeZone: timeZone.describe("An IANA time zone, e.g. Europe/Berlin. Windows are in this zone."),
  ordersPerWeek: z
    .number()
    .positive()
    .max(400)
    .describe("Orders to expect per week on average. 0.5 is one every two weeks."),
  windows: z
    .array(visitWindow)
    .min(1)
    .describe(
      'When the customer shops, e.g. "Mon-Fri 19:00-23:00". An end before the start runs past midnight.',
    ),
});
export type Schedule = z.output<typeof scheduleInput>;

const formatters = new Map<string, Intl.DateTimeFormat>();

// How far the time zone's clock is ahead of UTC at this moment, in ms.
function offset(zone: string, at: number): number {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    formatters.set(zone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(at).map((part) => [part.type, part.value]));
  const local = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return local - Math.floor(at / MINUTE) * MINUTE;
}

// day: 0 is Sunday, minute: minutes since local midnight.
function activeAt(schedule: Schedule, day: number, minute: number): boolean {
  return schedule.windows.some(({ days, start, end }) =>
    start < end
      ? days.has(day) && minute >= start && minute < end
      : (days.has(day) && minute >= start) || (days.has((day + 6) % 7) && minute < end),
  );
}

export function isActive(schedule: Schedule, at: Date): boolean {
  const local = new Date(at.getTime() + offset(schedule.timeZone, at.getTime()));
  return activeAt(schedule, local.getUTCDay(), local.getUTCHours() * 60 + local.getUTCMinutes());
}

const activeMinutes = new WeakMap<Schedule, number>();

// Minutes per week inside the windows. Counted once per schedule: a plan asks for it every visit.
function weeklyActiveMinutes(schedule: Schedule): number {
  let count = activeMinutes.get(schedule);
  if (count === undefined) {
    count = 0;
    for (let minute = 0; minute < 7 * 1440; minute++)
      if (activeAt(schedule, Math.floor(minute / 1440), minute % 1440)) count++;
    activeMinutes.set(schedule, count);
  }
  return count;
}

// The next visit after `from`, at a random minute inside the windows. Visits come at random
// moments of active time (exponential gaps), ordersPerWeek of them per week on average, so the
// gaps are irregular and an hour of a window is as likely as any other.
export function nextVisit(schedule: Schedule, from: Date, random: () => number): Date {
  let left = -Math.log(1 - random()) * (weeklyActiveMinutes(schedule) / schedule.ordersPerWeek);

  // The first whole minute strictly after `from`, so a visit never repeats the one before it.
  const start = (Math.floor(from.getTime() / MINUTE) + 1) * MINUTE;
  let ahead = 0;
  for (let at = start; ; at += MINUTE) {
    // Offsets change at quarter hours at the earliest, so checking them that often is enough.
    if (at === start || at % (15 * MINUTE) === 0) ahead = offset(schedule.timeZone, at);
    const local = new Date(at + ahead);
    const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (activeAt(schedule, local.getUTCDay(), minute) && --left <= 0) return new Date(at);
  }
}

// Keys name a persona's stores and addresses, e.g. `fi` or `work`. Claude answers with keys and
// code fills in the rest, so Claude never copies an address, a price or a store id.
const dataKey = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,19}$/, { error: "Use a short lower-case key." });
const notEmpty = (record: object) => Object.keys(record).length > 0;

// The fixed facts every order of this customer reuses.
// Strict objects: a misspelled key is an error, in the editor and in the planner.
export const personaDataInput = z.object({
  customer: createOrderInput.shape.customer.strict(),
  stores: z
    .record(
      dataKey,
      z.strictObject({
        id: z.uuid().describe("The store's id, from src/shared/seed/seed-ids.json."),
        name: z
          .string()
          .min(1)
          .describe("Shown to Claude next to the key, e.g. Satin Sparrow (EUR)."),
        carrier: z.string().min(1),
        shippingFee: z
          .strictObject({
            name: z.string().min(1),
            unitPrice: z.number().int().min(0).describe("Minor units of the store's currency."),
            taxRate: z.number().int().min(0).max(10000).describe("Basis points: 2500 is 25 %."),
          })
          .describe("The shipping_fee line added when the basket has a physical product."),
      }),
    )
    .refine(notEmpty, { error: "Name at least one store." })
    .describe("The stores this customer shops in, by short key. The habits name the keys."),
  addresses: z
    .record(dataKey, addressInput.strict())
    .refine(notEmpty, { error: "Name at least one address." })
    .describe("The customer's addresses, by short key such as home or work."),
});
export type PersonaData = z.output<typeof personaDataInput>;

// A persona's <name>.json, next to its <name>.md: when the customer shops and the fixed facts.
// Code reads it; Claude only gets the .md and the keys. `$schema` points editors at the JSON Schema
// written from this (persona.schema.json), for autocomplete and errors while editing.
export const personaInput = z.strictObject({
  $schema: z.string().optional(),
  ...scheduleInput.shape,
  ...personaDataInput.shape,
});

export const PERSONA_SCHEMA = join(CUSTOMERS_DIR, "persona.schema.json");

// The JSON Schema of a persona file, as editors read it. `io: "input"`: what is written in the
// file, before Zod turns the windows into numbers.
export function personaJsonSchema() {
  return z.toJSONSchema(personaInput, { io: "input", target: "draft-7" });
}

export function parsePersona(name: string, value: unknown) {
  const parsed = personaInput.safeParse(value);
  if (!parsed.success) throw new Error(`${name}: ${z.prettifyError(parsed.error)}`);
  const { timeZone: zone, ordersPerWeek, windows, customer, stores, addresses } = parsed.data;
  return {
    schedule: { timeZone: zone, ordersPerWeek, windows },
    data: { customer, stores, addresses },
  };
}

export type Persona = {
  name: string;
  text: string;
  schedule: Schedule;
  data: PersonaData;
};

// One planned visit. Claude sees the local time and the dice; the order is placed at `dueAt`.
export type Slot = {
  slotId: string;
  persona: string;
  dueAt: string;
  localTime: string;
  variety: number;
};

const localFormats = new Map<string, Intl.DateTimeFormat>();

function localTime(zone: string, at: Date) {
  let format = localFormats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    localFormats.set(zone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(at).map((part) => [part.type, part.value]));
  return `${parts.weekday} ${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

// Every visit of every persona from `start` until `end`, in time order. The draws come from
// `random`, so a fixed seed gives the same plan.
export function planSlots(personas: Persona[], start: Date, end: Date, random: () => number) {
  const slots: Slot[] = [];
  for (const persona of personas) {
    let at = start;
    for (let n = 1; ; n++) {
      at = nextVisit(persona.schedule, at, random);
      if (at >= end) break;
      slots.push({
        slotId: `${persona.name}-${n}`,
        persona: persona.name,
        dueAt: at.toISOString(),
        localTime: localTime(persona.schedule.timeZone, at),
        variety: Math.floor(random() * 100),
      });
    }
  }
  return slots.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

// Every persona is a pair: <name>.md for Claude and <name>.json for code. A half pair stops the
// planner, so the two can't drift apart unnoticed.
export function readPersonas(dir = CUSTOMERS_DIR): Persona[] {
  const files = readdirSync(dir);
  const names = (ext: string) =>
    files
      .filter((file) => file.endsWith(ext) && !file.endsWith(".schema.json"))
      .map((file) => file.slice(0, -ext.length));
  const md = names(".md");
  const json = names(".json");
  const lonely = [
    ...md.filter((name) => !json.includes(name)),
    ...json.filter((name) => !md.includes(name)),
  ];
  if (lonely.length > 0)
    throw new Error(
      `Each persona needs both <name>.md and <name>.json in ${dir}. Missing a half: ${lonely.join(
        ", ",
      )}.`,
    );
  return md.map((name) => ({
    name,
    text: readFileSync(join(dir, `${name}.md`), "utf8"),
    ...parsePersona(`${name}.json`, JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"))),
  }));
}

// What Claude answers for one visit: only the choices. Keys point into the persona's data, and the
// products are numbers in the store's catalog, so code builds the whole order from about 40 tokens.
const visitAnswer = z.object({
  slotId: z.string(),
  store: z.string(),
  items: z
    .array(
      z.object({
        type: z.enum(["physical", "digital"]),
        pick: z.number().int().min(0).max(PICK_MAX),
        quantity: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(5),
  payment: z.enum(PAYMENT_METHODS),
  billTo: z.string(),
  shipTo: z.string(),
});
// Sent as --json-schema, so the answer has this shape.
export const answerInput = z.object({ orders: z.array(visitAnswer) });
// The same, read loosely, so one bad visit fails only its own slot.
const looseAnswer = z.object({
  orders: z.array(z.looseObject({ slotId: z.string() })),
});

// Keeps each persona to the stores the checkout account may order in, here and now. A persona with
// none left (its store doesn't exist in this database, or isn't assigned) is skipped, so one
// missing store doesn't make the whole upload fail.
export function openPersonas(personas: Persona[], storeIds: string[]) {
  const open: Persona[] = [];
  const skipped: string[] = [];
  for (const persona of personas) {
    const stores = Object.fromEntries(
      Object.entries(persona.data.stores).filter(([, store]) => storeIds.includes(store.id)),
    );
    if (!notEmpty(stores)) skipped.push(persona.name);
    else open.push({ ...persona, data: { ...persona.data, stores } });
  }
  return { open, skipped };
}

// Spelled out: a short prompt in a code repo reads like a coding task to a small model. Claude gets
// the persona's .md and the keys from its .json, never the .json itself.
export function planPrompt(personas: Persona[], slots: Slot[], rules: string) {
  const used = personas.filter((persona) => slots.some((slot) => slot.persona === persona.name));
  const visits = used.map((persona) => {
    const own = slots
      .filter((slot) => slot.persona === persona.name)
      .map((slot) => `- ${slot.slotId}: ${slot.localTime}, variety ${slot.variety}`);
    const stores = Object.entries(persona.data.stores).map(
      ([key, store]) => `${key} = ${store.name}`,
    );
    const keys = `Open stores (\`store\`): ${stores.join(", ")}. Addresses (\`billTo\`, \`shipTo\`): ${Object.keys(persona.data.addresses).join(", ")}.`;
    return `## ${persona.name}\n\n${persona.text.trim()}\n\n${keys}\n\nVisits:\n\n${own.join("\n")}`;
  });
  return `You plan orders for simulated customers in a test shop, not code. Follow these rules:

${rules}

# Customers and their visits

${visits.join("\n\n")}`;
}

// No built-in tools and no MCP server: Claude only reads the prompt and answers in the schema.
// Two turns: the structured answer is a tool call of its own.
export function claudeArgs(): string[] {
  // Draft 7: the CLI's validator doesn't know the 2020-12 draft that Zod writes by default.
  const schema = JSON.stringify(z.toJSONSchema(answerInput, { target: "draft-7" }));
  // prettier-ignore
  return [
    "-p",
    "--model", "haiku",
    "--effort", "low",
    "--max-turns", "4",
    "--tools", "",
    "--strict-mcp-config",
    "--output-format", "json",
    "--json-schema", schema,
  ];
}

const oneLine = (error: z.ZodError) => z.prettifyError(error).replace(/\n/g, " ");
// Object.hasOwn: a key such as "constructor" must not find something on the object's prototype.
const pick = <T>(record: Record<string, T>, key: string) =>
  Object.hasOwn(record, key) ? record[key] : undefined;

// A catalog product as an order line, without the quantity the customer picked.
export type CatalogLine = {
  type: "physical" | "digital";
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

// The order both planners place: the products, plus the store's shipping fee when one is physical.
// Shared so a planned order and a cron order are checked the same way.
export function storeOrder(
  shop: Persona["data"]["stores"][string],
  customer: Persona["data"]["customer"],
  billingAddress: AddressInput,
  shippingAddress: AddressInput,
  paymentMethod: PaymentMethod,
  products: CatalogLine[],
): CreateOrderInput | string {
  const fee = { type: "shipping_fee" as const, quantity: 1, ...shop.shippingFee };
  const physical = products.some((line) => line.type === "physical");
  const order = createOrderInput.safeParse({
    storeId: shop.id,
    customer,
    billingAddress,
    shippingAddress,
    paymentMethod,
    shippingCarrier: shop.carrier,
    lines: physical ? [...products, fee] : products,
  });
  return order.success ? order.data : oneLine(order.error);
}

// Builds the whole order from Claude's choices for one visit, or says why it can't. Customer,
// addresses, prices, names, carrier and shipping fee all come from the persona and the store catalog.
export function buildOrder(answer: unknown, persona: Persona): CreateOrderInput | string {
  const parsed = visitAnswer.safeParse(answer);
  if (!parsed.success) return oneLine(parsed.error);
  const { store, items, payment, billTo, shipTo } = parsed.data;
  const { stores, addresses, customer } = persona.data;
  const shop = pick(stores, store);
  if (!shop) return `store "${store}" isn't one of ${Object.keys(stores).join(", ")}`;
  const billing = pick(addresses, billTo);
  const shipping = pick(addresses, shipTo);
  if (!billing || !shipping)
    return `address "${billing ? shipTo : billTo}" isn't one of ${Object.keys(addresses).join(
      ", ",
    )}`;
  if (new Set(items.map((item) => `${item.type} ${item.pick}`)).size !== items.length)
    return "a product is listed twice; raise its quantity instead";
  if (!catalogPick(shop.id, "physical", 0)) return `store "${store}" has no catalog`;

  const products = [];
  for (const { type, pick: position, quantity } of items) {
    const item = catalogPick(shop.id, type, position);
    if (!item) return `store "${store}" has no ${type} item at pick ${position}`;
    products.push({
      type,
      sku: item.sku,
      name: item.name,
      quantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
    });
  }
  return storeOrder(shop, customer, billing, shipping, payment, products);
}

// Checks Claude's answer slot by slot: exactly one valid order for each.
export function checkAnswer(answer: unknown, slots: Slot[], personas: Persona[]) {
  const parsed = looseAnswer.safeParse(answer);
  const orders = parsed.success ? parsed.data.orders : [];
  const checkouts: ScheduledCheckoutInput[] = [];
  const failed: { slot: Slot; reason: string }[] = [];
  for (const slot of slots) {
    const persona = personas.find((candidate) => candidate.name === slot.persona)!;
    const answered = orders.filter((entry) => entry.slotId === slot.slotId);
    const result =
      answered.length !== 1
        ? `${answered.length} orders instead of 1`
        : buildOrder(answered[0], persona);
    if (typeof result === "string") failed.push({ slot, reason: result });
    else
      checkouts.push({
        dueAt: slot.dueAt,
        persona: slot.persona,
        order: result,
      });
  }
  return { checkouts, failed };
}

// The most visits one Claude run answers. A visit's answer is about 50 tokens of JSON, so 150 stay
// well under Haiku's 32,000-token answer limit; a bigger plan takes one run per 150 visits.
export const VISITS_PER_RUN = 150;

// Asks Claude for the orders, then once more for the slots whose orders didn't pass the checks.
export async function fillSlots(
  slots: Slot[],
  personas: Persona[],
  rules: string,
  ask: (prompt: string) => Promise<unknown>,
) {
  const inRuns = async (some: Slot[]) => {
    const checkouts: ScheduledCheckoutInput[] = [];
    const failed: { slot: Slot; reason: string }[] = [];
    for (let at = 0; at < some.length; at += VISITS_PER_RUN) {
      const part = some.slice(at, at + VISITS_PER_RUN);
      const result = checkAnswer(await ask(planPrompt(personas, part, rules)), part, personas);
      checkouts.push(...result.checkouts);
      failed.push(...result.failed);
    }
    return { checkouts, failed };
  };
  const first = await inRuns(slots);
  if (first.failed.length === 0) return first;
  const second = await inRuns(first.failed.map(({ slot }) => slot));
  return {
    checkouts: [...first.checkouts, ...second.checkouts].sort((a, b) =>
      a.dueAt.localeCompare(b.dueAt),
    ),
    failed: second.failed,
  };
}

const planOptions = z.object({
  days: z.coerce
    .number({ error: "--days takes a whole number of days, for example 7." })
    .int()
    .min(1)
    .max(28)
    .default(7),
  hosted: z.boolean().default(false),
});

async function plan(args: string[]) {
  const { values } = parseArgs({
    args,
    options: { days: { type: "string" }, hosted: { type: "boolean" } },
  });
  const options = parseConfig(planOptions, values);
  // A plan not uploaded yet would be overwritten (same start date) or overlapped (the queue doesn't
  // know its times yet, so the new plan would start at the same place).
  const waiting = existsSync(PLANS_DIR)
    ? readdirSync(PLANS_DIR).filter((file) => file.endsWith(".json") && !file.endsWith(UPLOADED))
    : [];
  if (waiting.length > 0)
    throw new Error(
      `Upload or delete ${waiting.map((file) => join(PLANS_DIR, file)).join(", ")} first.`,
    );
  const api = createApiClient(readCustomerConfig(process.env, options.hosted));
  const { lastDueAt, storeIds } = (await api.request("/api/v1/scheduled-checkouts")) as {
    lastDueAt: string | null;
    storeIds: string[];
  };

  // An hour ahead leaves time to read the plan; after the queue's last checkout, plans never overlap.
  const soonest = Date.now() + HOUR;
  const start = new Date(Math.max(soonest, lastDueAt ? Date.parse(lastDueAt) : 0));
  const end = new Date(start.getTime() + options.days * DAY);
  const { open: personas, skipped } = openPersonas(readPersonas(), storeIds);
  for (const name of skipped)
    console.log(`Skipped ${name}: none of its stores is open to the checkout account here.`);
  if (personas.length === 0)
    throw new Error("No persona has an open store. Check the checkout account's store roles.");
  const random = () => randomInt(1_000_000) / 1_000_000;
  const slots = planSlots(personas, start, end, random);
  if (slots.length === 0) return console.log("No visits fall in that time. Try more --days.");
  if (slots.length > MAX_SCHEDULED_CHECKOUTS)
    throw new Error(`${slots.length} visits is more than one upload takes. Use fewer --days.`);

  console.log(
    `Planning ${slots.length} visits from ${start.toISOString()} to ${end.toISOString()}.`,
  );
  const claude = findClaude();
  const rules = readFileSync(RULES, "utf8");
  const seconds = (since: number) => ((performance.now() - since) / 1000).toFixed(1);
  const began = performance.now();
  const { checkouts, failed } = await fillSlots(slots, personas, rules, async (prompt) => {
    const run = performance.now();
    const answer = structuredOutput(await runClaude(claude, claudeArgs(), prompt));
    console.log(`Claude run took ${seconds(run)} s.`);
    return answer;
  });
  console.log(`Planning took ${seconds(began)} s in all.`);
  for (const { slot, reason } of failed) console.log(`Left out ${slot.slotId}: ${reason}`);
  if (checkouts.length === 0) throw new Error("No order passed the checks, so there is no plan.");

  mkdirSync(PLANS_DIR, { recursive: true });
  const file = join(PLANS_DIR, `plan-${start.toISOString().slice(0, 10)}.json`);
  writeFileSync(file, `${JSON.stringify({ planId: randomUUID(), checkouts }, null, 2)}\n`);
  for (const persona of personas) {
    const count = checkouts.filter((checkout) => checkout.persona === persona.name).length;
    if (count > 0) console.log(`${persona.name}: ${count}`);
  }
  console.log(
    `Wrote ${file}. Read it, then: pnpm night-shift:upload${options.hosted ? ":hosted" : ""} ${file}`,
  );
}

// After an upload the plan file is renamed to *.uploaded.json, and such a file is refused, so the
// same plan isn't queued twice by accident. A copy under another name still uploads.
export const UPLOADED = ".uploaded.json";
export const uploadedName = (file: string) => file.replace(/\.json$/, "") + UPLOADED;

async function upload(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { hosted: { type: "boolean" } },
  });
  const [file] = positionals;
  if (!file) throw new Error("Name the plan file, for example .night-shift/plan-2026-10-21.json.");
  if (file.endsWith(UPLOADED))
    throw new Error(`${file} is already uploaded. Plan again for more orders.`);
  const planned = parseConfig(scheduledCheckoutsInput, JSON.parse(readFileSync(file, "utf8")));

  // The database refuses times in the past, so checkouts whose time went by while reading are left out.
  const soonest = Date.now() + MINUTE;
  const checkouts = planned.checkouts.filter((checkout) => Date.parse(checkout.dueAt) > soonest);
  const late = planned.checkouts.length - checkouts.length;
  if (late > 0) console.log(`Left out ${late} checkouts whose time has passed.`);
  if (checkouts.length === 0) throw new Error("Nothing left to upload. Plan again.");

  const api = createApiClient(readCustomerConfig(process.env, values.hosted ?? false));
  const result = (await api.request("/api/v1/scheduled-checkouts", {
    method: "POST",
    body: JSON.stringify({ planId: planned.planId, checkouts }),
  })) as { queued: number };
  renameSync(file, uploadedName(file));
  console.log(
    `Queued ${result.queued} checkouts (plan ${
      planned.planId
    }). Renamed the file to ${uploadedName(file)}.`,
  );
}

// Writes persona.schema.json from personaInput. Run it after changing the persona schema; a test
// fails while the file is out of date.
async function writePersonaSchema() {
  writeFileSync(PERSONA_SCHEMA, `${JSON.stringify(personaJsonSchema(), null, 2)}\n`);
  console.log(`Wrote ${PERSONA_SCHEMA}. Run pnpm format to tidy it.`);
}

runIfMain(import.meta.url, async () => {
  const [command, ...args] = process.argv.slice(2);
  if (command === "plan") return plan(args);
  if (command === "upload") return upload(args);
  if (command === "schema") return writePersonaSchema();
  throw new Error(
    "Use pnpm night-shift:plan, pnpm night-shift:upload <plan file> or pnpm night-shift:schema.",
  );
});
