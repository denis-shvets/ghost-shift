import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { catalogPick } from "../src/features/orders/model/store-catalogs.ts";
import { itemAt } from "./item-at.ts";

import {
  buildOrder,
  checkAnswer,
  claudeArgs,
  fillSlots,
  findClaude,
  isActive,
  nextVisit,
  openPersonas,
  type Persona,
  PERSONA_SCHEMA,
  type PersonaData,
  parsePersona,
  personaJsonSchema,
  planPrompt,
  planSlots,
  readPersonas,
  runClaude,
  scheduleInput,
  structuredOutput,
  uploadedName,
  VISITS_PER_RUN,
} from "./night-shift.ts";

// A small seeded generator (mulberry32), so the draws are the same on every run.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STORE = "b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b18";
const OTHER_STORE = "b2e4d8f3-5c6e-4d9b-8f21-3a7c8e9d0b03";
const schedule = (value: object) => scheduleInput.parse(value);
const lena = schedule({
  timeZone: "Europe/Berlin",
  ordersPerWeek: 2,
  windows: ["Mon-Fri 19:00-23:00", "Sat 10:00-14:00"],
});
const mikko = schedule({
  timeZone: "Europe/Helsinki",
  ordersPerWeek: 3,
  windows: ["Mon-Sun 22:00-03:00"],
});

describe("schedule", () => {
  it("refuses bad windows, rates and time zones", () => {
    const base = { timeZone: "Europe/Berlin", ordersPerWeek: 2 };
    expect(() => schedule({ ...base, windows: ["Mon-Fri 19:00-24:00"] })).toThrow(/window/);
    expect(() => schedule({ ...base, windows: ["Monday 19:00-23:00"] })).toThrow(/window/);
    expect(() => schedule({ ...base, windows: ["Mon 19:00-19:00"] })).toThrow(/time in it/);
    expect(() => schedule({ ...base, windows: [] })).toThrow();
    expect(() => schedule({ ...base, ordersPerWeek: 0, windows: ["Sat 10:00-14:00"] })).toThrow();
    expect(() =>
      schedule({
        ...base,
        timeZone: "Mars/Base",
        windows: ["Sat 10:00-14:00"],
      }),
    ).toThrow(/time zone/);
  });

  it("uses the persona's local time, also across the change from summer time", () => {
    // Wednesday 2026-10-21 is summer time in Berlin (UTC+2), Monday 2026-10-26 winter time (UTC+1).
    expect(isActive(lena, new Date("2026-10-21T17:30:00Z"))).toBe(true); // 19:30
    expect(isActive(lena, new Date("2026-10-21T16:59:00Z"))).toBe(false); // 18:59
    expect(isActive(lena, new Date("2026-10-26T18:30:00Z"))).toBe(true); // 19:30
    expect(isActive(lena, new Date("2026-10-26T17:30:00Z"))).toBe(false); // 18:30
    expect(isActive(lena, new Date("2026-10-25T08:00:00Z"))).toBe(false); // Sunday 09:00
  });

  it("runs a window past midnight into the next day", () => {
    // Helsinki is UTC+3 on 2026-10-21.
    expect(isActive(mikko, new Date("2026-10-21T19:00:00Z"))).toBe(true); // 22:00
    expect(isActive(mikko, new Date("2026-10-21T23:59:00Z"))).toBe(true); // 02:59
    expect(isActive(mikko, new Date("2026-10-22T00:00:00Z"))).toBe(false); // 03:00
    expect(isActive(mikko, new Date("2026-10-21T18:59:00Z"))).toBe(false); // 21:59
  });
});

describe("nextVisit", () => {
  // Draws visit after visit for a year and returns them.
  function year(of: typeof lena, seed: number) {
    const random = seeded(seed);
    const end = new Date("2027-10-21T00:00:00Z").getTime();
    const visits: Date[] = [];
    for (let at = new Date("2026-10-21T00:00:00Z"); ;) {
      at = nextVisit(of, at, random);
      if (at.getTime() >= end) return visits;
      visits.push(at);
    }
  }

  it("never repeats the minute it starts from, even with the smallest draw", () => {
    // 19:30 in Berlin, inside Lena's window. A draw of 0 takes the first active minute it checks.
    const from = new Date("2026-10-21T17:30:00Z");
    expect(nextVisit(lena, from, () => 0)).toEqual(new Date("2026-10-21T17:31:00Z"));
  });

  it("always falls inside the windows", () => {
    for (const persona of [lena, mikko])
      for (const visit of year(persona, 1)) expect(isActive(persona, visit)).toBe(true);
  });

  it("comes close to the expected orders per week", () => {
    const busy = schedule({
      timeZone: "Europe/Stockholm",
      ordersPerWeek: 20,
      windows: ["Mon-Fri 12:00-13:00"],
    });
    const weeks = 365 / 7;
    expect(year(busy, 2).length / weeks).toBeGreaterThan(18);
    expect(year(busy, 2).length / weeks).toBeLessThan(22);
    expect(year(lena, 3).length / weeks).toBeGreaterThan(1.5);
    expect(year(lena, 3).length / weeks).toBeLessThan(2.5);
  });

  it("leaves irregular gaps", () => {
    const gaps = new Set(
      year(mikko, 4)
        .slice(0, 30)
        .map((visit, index, visits) =>
          index ? visit.getTime() - itemAt(visits, index - 1).getTime() : 0,
        ),
    );
    expect(gaps.size).toBeGreaterThan(25);
  });
});

const home = {
  firstName: "Lena",
  lastName: "Vogt",
  streetAddress: "Lindenweg 4",
  postalCode: "10115",
  city: "Berlin",
  country: "DE",
};
const office = {
  ...home,
  company: "Vogt Design",
  streetAddress: "Torstraße 1",
};
const data = (stores: string[]): PersonaData => ({
  customer: {
    firstName: "Lena",
    lastName: "Vogt",
    email: "lena.vogt@example.com",
  },
  stores: Object.fromEntries(
    stores.map((id, index) => [
      index === 0 ? "de" : "se",
      {
        id,
        name: index === 0 ? "Satin Sparrow (EUR)" : "Velour Vault (SEK)",
        carrier: "DHL",
        shippingFee: { name: "Shipping, DHL", unitPrice: 490, taxRate: 0 },
      },
    ]),
  ),
  addresses: { home, office },
});
const persona = (name: string, sched: typeof lena, stores = [STORE]): Persona => ({
  name,
  text: `# ${name}\n\n## Basket\n\n- Habits.`,
  schedule: sched,
  data: data(stores),
});
const personas = [persona("lena", lena), persona("mikko", mikko)];

describe("planSlots", () => {
  const start = new Date("2026-10-21T00:00:00Z");
  const end = new Date("2026-10-28T00:00:00Z");

  it("draws every persona's visits inside its windows, in time order", () => {
    const slots = planSlots(personas, start, end, seeded(5));

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const at = new Date(slot.dueAt);
      expect(at >= start && at < end).toBe(true);
      expect(isActive(slot.persona === "lena" ? lena : mikko, at)).toBe(true);
      expect(slot.variety).toBeGreaterThanOrEqual(0);
      expect(slot.variety).toBeLessThan(100);
    }
    expect(slots.map((slot) => slot.dueAt)).toEqual(slots.map((slot) => slot.dueAt).sort());
    expect(new Set(slots.map((slot) => slot.slotId)).size).toBe(slots.length);
  });

  it("gives each slot the persona's local time", () => {
    const [slot] = planSlots([persona("lena", lena)], start, end, seeded(5));
    // Lena shops on weekday evenings or Saturday late mornings, Berlin time.
    expect(slot?.localTime).toMatch(
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) 2026-10-2\d (1\d|2[0-2]):\d\d$/,
    );
  });

  it("gives the same plan for the same seed", () => {
    expect(planSlots(personas, start, end, seeded(9))).toEqual(
      planSlots(personas, start, end, seeded(9)),
    );
  });
});

const physical = catalogPick(STORE, "physical", 2)!;
const choice = (slotId: string, change: object = {}) => ({
  slotId,
  store: "de",
  items: [{ type: "physical", pick: 2, quantity: 2 }],
  payment: "card",
  billTo: "home",
  shipTo: "office",
  ...change,
});
const slot = (slotId: string) => ({
  slotId,
  persona: "lena",
  dueAt: "2026-10-21T18:00:00.000Z",
  localTime: "Wednesday 2026-10-21 20:00",
  variety: 42,
});

describe("buildOrder", () => {
  it("builds the whole order from the choices, the persona's data and the store catalog", () => {
    expect(buildOrder(choice("lena-1"), personas[0]!)).toEqual({
      storeId: STORE,
      customer: {
        firstName: "Lena",
        lastName: "Vogt",
        email: "lena.vogt@example.com",
      },
      billingAddress: home,
      shippingAddress: office,
      paymentMethod: "card",
      shippingCarrier: "DHL",
      lines: [
        {
          type: "physical",
          sku: physical.sku,
          name: physical.name,
          quantity: 2,
          unitPrice: physical.unitPrice,
          taxRate: physical.taxRate,
        },
        {
          type: "shipping_fee",
          name: "Shipping, DHL",
          quantity: 1,
          unitPrice: 490,
          taxRate: 0,
        },
      ],
    });
  });

  it("adds no shipping fee to a basket of only digital products", () => {
    const order = buildOrder(
      choice("lena-1", { items: [{ type: "digital", pick: 0, quantity: 1 }] }),
      personas[0]!,
    );
    expect(typeof order === "object" && order.lines.map((line) => line.type)).toEqual(["digital"]);
  });

  it.each([
    ["a store key the persona hasn't", { store: "se" }, /store "se" isn't one of de/],
    ["a prototype key", { store: "constructor" }, /isn't one of/],
    [
      "an address key the persona hasn't",
      { shipTo: "gift" },
      /address "gift" isn't one of home, office/,
    ],
    ["a pick past the list", { items: [{ type: "physical", pick: 15, quantity: 1 }] }, /pick/],

    [
      "a product listed twice",
      {
        items: [
          { type: "physical", pick: 2, quantity: 1 },
          { type: "physical", pick: 2, quantity: 1 },
        ],
      },
      /twice/,
    ],
    ["a quantity of 0", { items: [{ type: "physical", pick: 2, quantity: 0 }] }, /quantity/],
    ["an unknown payment method", { payment: "cash" }, /payment/],
  ])("refuses %s", (_, change, reason) => {
    expect(buildOrder(choice("lena-1", change), personas[0]!)).toMatch(reason);
  });
});

describe("checkAnswer", () => {
  it("turns one good choice per slot into a checkout at the slot's time", () => {
    const result = checkAnswer({ orders: [choice("lena-1")] }, [slot("lena-1")], personas);

    expect(result.failed).toEqual([]);
    expect(result.checkouts).toEqual([
      {
        dueAt: "2026-10-21T18:00:00.000Z",
        persona: "lena",
        order: buildOrder(choice("lena-1"), personas[0]!),
      },
    ]);
  });

  it("refuses a missing slot, a doubled slot and an answer of the wrong shape", () => {
    const result = checkAnswer(
      { orders: [choice("lena-2"), choice("lena-2")] },
      [slot("lena-1"), slot("lena-2")],
      personas,
    );
    expect(result.failed.map((failure) => failure.reason)).toEqual([
      "0 orders instead of 1",
      "2 orders instead of 1",
    ]);
    expect(checkAnswer("nonsense", [slot("lena-1")], personas).failed).toHaveLength(1);
  });
});

describe("fillSlots", () => {
  it("asks again only for the slots that failed, once", async () => {
    const prompts: string[] = [];
    const answers = [
      { orders: [choice("lena-1"), choice("lena-2", { store: "nowhere" })] },
      { orders: [choice("lena-2")] },
    ];
    const result = await fillSlots(
      [slot("lena-1"), slot("lena-2")],
      personas,
      "Rules.",
      async (prompt) => {
        prompts.push(prompt);
        return answers[prompts.length - 1];
      },
    );

    expect(result.checkouts).toHaveLength(2);
    expect(result.failed).toEqual([]);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("lena-2");
    expect(prompts[1]).not.toContain("lena-1");
  });

  it("reports slots that fail twice", async () => {
    const result = await fillSlots([slot("lena-1")], personas, "Rules.", async () => ({
      orders: [],
    }));
    expect(result.failed.map((failure) => failure.slot.slotId)).toEqual(["lena-1"]);
  });

  it(`asks for at most ${VISITS_PER_RUN} visits per run`, async () => {
    const slots = Array.from({ length: VISITS_PER_RUN + 1 }, (_, n) => slot(`lena-${n + 1}`));
    const asked: number[] = [];
    const result = await fillSlots(slots, personas, "Rules.", async (prompt) => {
      const ids = [...prompt.matchAll(/^- (lena-\d+):/gm)].map((match) => match[1]!);
      asked.push(ids.length);
      return { orders: ids.map((slotId) => choice(slotId)) };
    });

    expect(asked).toEqual([VISITS_PER_RUN, 1]);
    expect(result.checkouts).toHaveLength(VISITS_PER_RUN + 1);
  });
});

describe("openPersonas", () => {
  it("keeps each persona to the open stores and skips one with none left", () => {
    const aino = persona("aino", mikko, [STORE, OTHER_STORE]);
    const { open, skipped } = openPersonas([aino, ...personas], [OTHER_STORE]);

    expect(open.map((each) => [each.name, Object.keys(each.data.stores)])).toEqual([
      ["aino", ["se"]],
    ]);
    expect(skipped).toEqual(["lena", "mikko"]);
  });
});

describe("planPrompt", () => {
  it("holds the rules, the keys and only the personas with visits, but no products", () => {
    const prompt = planPrompt(personas, [slot("lena-1")], "The planning rules.");
    expect(prompt).toContain("The planning rules.");
    expect(prompt).not.toContain(physical.name);
    expect(prompt).toContain(
      "Open stores (`store`): de = Satin Sparrow (EUR). Addresses (`billTo`, `shipTo`): home, office.",
    );
    expect(prompt).toContain("- lena-1: Wednesday 2026-10-21 20:00, variety 42");
    expect(prompt).toContain("## Basket");
    expect(prompt).not.toContain("# mikko");
  });
});

describe("persona files", () => {
  const good = {
    $schema: "./persona.schema.json",
    timeZone: "Europe/Berlin",
    ordersPerWeek: 2,
    windows: ["Sat 10:00-14:00"],
    customer: { firstName: "A", lastName: "B", email: "a@example.com" },
    stores: {
      de: {
        id: STORE,
        name: "Satin Sparrow (EUR)",
        carrier: "DHL",
        shippingFee: { name: "Shipping", unitPrice: 490, taxRate: 0 },
      },
    },
    addresses: { home },
  };

  it("reads every persona pair in docs/agents/customers", () => {
    const all = readPersonas();
    expect(all.length).toBeGreaterThan(0);
    for (const each of all) {
      expect(each.text).toMatch(/^# /);
      expect(Object.keys(each.data.stores).length).toBeGreaterThan(0);
      // Claude picks by number, so every store a persona shops in needs a catalog.
      for (const store of Object.values(each.data.stores))
        expect(catalogPick(store.id, "physical", 0), `${each.name}: ${store.name}`).toBeDefined();
    }
  });

  it("keeps persona.schema.json in step with the schema (pnpm night-shift:schema)", () => {
    expect(JSON.parse(readFileSync(PERSONA_SCHEMA, "utf8"))).toEqual(personaJsonSchema());
  });

  it("splits a persona into its schedule and data", () => {
    const { schedule: parsed, data: facts } = parsePersona("test", good);
    expect(parsed.ordersPerWeek).toBe(2);
    expect(facts).toEqual({
      customer: good.customer,
      stores: good.stores,
      addresses: good.addresses,
    });
  });

  it("refuses a half pair", () => {
    const dir = mkdtempSync(join(tmpdir(), "personas-"));
    writeFileSync(join(dir, "a.md"), "# A\n");
    writeFileSync(join(dir, "b.json"), JSON.stringify(good));
    writeFileSync(join(dir, "persona.schema.json"), "{}");
    expect(() => readPersonas(dir)).toThrow(/Missing a half: a, b/);
  });

  it.each([
    ["a misspelled key", { ...good, ordersPerWek: 2 }, /ordersPerWek/],
    [
      "a misspelled address field",
      { ...good, addresses: { home: { ...home, comapny: "X" } } },
      /comapny/,
    ],
    ["a key that isn't short and lower case", { ...good, addresses: { Home: home } }, /key/],
    ["a bad store id", { ...good, stores: { de: { ...good.stores.de, id: "not-a-uuid" } } }, /id/],
    ["no stores", { ...good, stores: {} }, /at least one store/],
    ["a bad country", { ...good, addresses: { home: { ...home, country: "Germany" } } }, /country/],
  ])("refuses %s", (_, value, reason) => {
    expect(() => parsePersona("test", value)).toThrow(reason);
  });
});

describe("claudeArgs", () => {
  it("runs Haiku at low effort with no tools or MCP servers, answering in the schema", () => {
    const args = claudeArgs();
    expect(args[0]).toBe("-p");
    expect(args[args.indexOf("--model") + 1]).toBe("haiku");
    expect(args[args.indexOf("--effort") + 1]).toBe("low");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(args).not.toContain("--mcp-config");
    const schema = JSON.parse(itemAt(args, args.indexOf("--json-schema") + 1));
    expect(schema.properties.orders.type).toBe("array");
  });
});

describe("structuredOutput", () => {
  it("returns the structured answer, and refuses an error or a plain answer", () => {
    expect(
      structuredOutput(JSON.stringify({ is_error: false, structured_output: { orders: [] } })),
    ).toEqual({ orders: [] });
    expect(() => structuredOutput(JSON.stringify({ is_error: true }))).toThrow(/no structured/);
    expect(() => structuredOutput(JSON.stringify({ result: "Sure!" }))).toThrow(/no structured/);
  });
});

describe("findClaude", () => {
  it("uses claude from PATH outside Windows", () => {
    expect(findClaude("linux", "")).toBe("claude");
  });

  it("finds claude.exe on Windows, also inside an npm shim's package", () => {
    const npm = mkdtempSync(join(tmpdir(), "npm-"));
    const bin = join(npm, "node_modules", "@anthropic-ai", "claude-code", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "claude.exe"), "");
    expect(findClaude("win32", `C:\nowhere;${npm}`)).toBe(join(bin, "claude.exe"));
    expect(() => findClaude("win32", "C:\nowhere")).toThrow(/on PATH/);
  });
});

describe("runClaude", () => {
  it("sends the input on stdin and resolves with the whole output", async () => {
    const echo = ["-e", "process.stdin.pipe(process.stdout)"];
    await expect(runClaude(process.execPath, echo, "line 1\nline 2")).resolves.toBe(
      "line 1\nline 2",
    );
  });

  it("stops a run that takes too long and rejects with timed out", async () => {
    const hang = ["-e", "setTimeout(() => {}, 60000)"];
    await expect(runClaude(process.execPath, hang, "", 300)).rejects.toThrow(/timed out/);
  });
});

describe("uploadedName", () => {
  it("marks a plan file as uploaded", () => {
    expect(uploadedName(".night-shift/plan-2026-10-21.json")).toBe(
      ".night-shift/plan-2026-10-21.uploaded.json",
    );
    expect(uploadedName("my-plan")).toBe("my-plan.uploaded.json");
  });
});
