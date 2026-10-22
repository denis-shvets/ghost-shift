// Local test-order cron: creates one order every 5 to 15 seconds in the stores the developer can use.
// Run with `pnpm orders:cron` while `pnpm dev` is up, or `pnpm orders:cron 2-10` for other seconds.
// No AI: every choice is a random pick from a list. Customers, addresses, carriers and shipping fees
// come from the customer agents' persona files.
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

import type { CreateOrderInput } from "../src/features/orders/model/create-order-input.ts";
import { PAYMENT_METHODS } from "../src/features/orders/model/payment-methods.ts";
import { catalogProducts } from "../src/features/orders/model/store-catalogs.ts";
import {
  apiTarget,
  configInput,
  createApiClient,
  parseConfig,
  runIfMain,
} from "./mcp-developer.ts";
import { itemAt } from "./item-at.ts";
import { type Persona, readPersonas, storeOrder } from "./night-shift.ts";

const MIN_DELAY = 5_000;
const MAX_DELAY = 15_000;

const storesResponse = z.array(z.object({ id: z.uuid() }));

const choose = <T>(items: T[], random: () => number): T =>
  itemAt(items, Math.floor(random() * items.length));

// A wait between min and max milliseconds, 5 to 15 seconds unless the command line says otherwise.
export const nextDelay = (random: () => number, min = MIN_DELAY, max = MAX_DELAY) =>
  min + Math.floor(random() * (max - min + 1));

// Seconds between orders, as `pnpm orders:cron 2-10`, turned into [min, max] milliseconds. Rounding
// happens before the check, so a range that would round to no pause at all is refused.
export const cronRange = z
  .string()
  .regex(/^\d+(\.\d+)?-\d+(\.\d+)?$/, { error: "Write a range in seconds, for example 2-10." })
  .transform(
    (text) =>
      text.split("-").map((seconds) => Math.round(Number(seconds) * 1000)) as [number, number],
  )
  .refine(([min, max]) => min >= 1 && min <= max, {
    error: "The range needs at least 1 ms and min <= max, for example 2-10.",
  });

// One order at a random store from `storeIds`. A persona who shops there supplies the customer, the
// addresses and the carrier, so the order matches a real customer. A string says why no order was made.
export function pickOrder(
  storeIds: string[],
  personas: Persona[],
  random: () => number,
): CreateOrderInput | string {
  if (storeIds.length === 0) return "the account has no stores";
  // Only stores a persona shops at, so no pick is wasted on a store with no customer.
  const shopped = storeIds.filter((id) =>
    personas.some((persona) => Object.values(persona.data.stores).some((store) => store.id === id)),
  );
  if (shopped.length === 0) return "no customer shops at any of the account's stores";
  const storeId = choose(shopped, random);
  const shops = personas.flatMap((persona) =>
    Object.values(persona.data.stores)
      .filter((store) => store.id === storeId)
      .map((store) => ({ persona, store })),
  );
  const { persona, store } = choose(shops, random);

  // Distinct products: a product listed twice would need a higher quantity instead.
  const products = catalogProducts(storeId);
  if (products.length === 0) return "the chosen store has no catalog";
  const count = Math.min(1 + Math.floor(random() * 3), products.length);
  const lines = Array.from({ length: count }, () => {
    const [product] = products.splice(Math.floor(random() * products.length), 1);
    if (!product) throw new Error("count is at most products.length, so a product is always left");
    return {
      type: product.type,
      sku: product.sku,
      name: product.name,
      quantity: 1 + Math.floor(random() * 3),
      unitPrice: product.unitPrice,
      taxRate: product.taxRate,
    };
  });

  const addresses = Object.values(persona.data.addresses);
  return storeOrder(
    store,
    persona.data.customer,
    choose(addresses, random),
    choose(addresses, random),
    choose([...PAYMENT_METHODS], random),
    lines,
  );
}

async function run() {
  const { positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {},
  });
  const [minMs, maxMs] = parseConfig(cronRange, positionals[0] ?? "5-15");
  const config = parseConfig(configInput, process.env);
  const api = createApiClient({
    ...apiTarget(config),
    email: config.SEED_DEVELOPER_EMAIL,
    password: config.SEED_PASSWORD,
  });
  const personas = readPersonas();
  const random = () => randomInt(1_000_000) / 1_000_000;

  // Ctrl+C cuts a wait short and stops the loop. A request already in flight finishes and is logged.
  let stopping = false;
  const interrupt = new AbortController();
  process.on("SIGINT", () => {
    stopping = true;
    interrupt.abort();
  });

  while (!stopping) {
    await sleep(nextDelay(random, minMs, maxMs), undefined, { signal: interrupt.signal }).catch(
      () => {},
    );
    if (stopping) break;
    try {
      const stores = storesResponse.parse(await api.request("/api/v1/stores"));
      const order = pickOrder(
        stores.map((store) => store.id),
        personas,
        random,
      );
      if (typeof order === "string") {
        console.log(`Skipped: ${order}.`);
        continue;
      }
      await api.request("/api/v1/orders", { method: "POST", body: JSON.stringify(order) });
      console.log(`${new Date().toISOString()} Created an order at ${order.storeId}.`);
    } catch (error) {
      console.log(`Failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log("Stopped.");
}

runIfMain(import.meta.url, run);
