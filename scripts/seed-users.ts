// Creates the local sign-in accounts and gives each one its access (ADR 0007, ADR 0015).
// Run `pnpm db:start` and `pnpm db:reset` first, then `pnpm db:seed-users`.
// Safe to run again: accounts get their password reset and their access rows replaced.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

// Ids shared with supabase/seed.sql through src/shared/seed/seed-ids.json.
import seedIds from "../src/shared/seed/seed-ids.json" with { type: "json" };

import { CHECKOUT_EMAIL } from "./night-shift.ts";

const northstarThreads = seedIds.organizations.northstarThreads;
const pocketAtelier = seedIds.organizations.pocketAtelier;
const satinSparrow = seedIds.stores.satinSparrow;
// The live stores. Night Shift customers may order only here; Silk Pine Oslo is a test store.
const liveStores = [
  seedIds.stores.larkLoomStockholm,
  seedIds.stores.hemlineHelsinki,
  seedIds.stores.velourVault,
  seedIds.stores.mossAndMirror,
  seedIds.stores.ginghamGalaxy,
  seedIds.stores.cobaltCloset,
  seedIds.stores.tangerineThread,
  seedIds.stores.fjordFabric,
  seedIds.stores.plaidParade,
  seedIds.stores.woolWhisper,
  seedIds.stores.denimDune,
  seedIds.stores.linenLantern,
  seedIds.stores.corduroyComet,
  seedIds.stores.rayonRhapsody,
  seedIds.stores.chiffonCascade,
  seedIds.stores.thimbleThyme,
  seedIds.stores.satinSparrow,
  seedIds.stores.buttonBazaar,
  seedIds.stores.zipperZenith,
];
// A fixed id, so running the script again updates the same sample run.
const sampleRunId = "5a3b1e00-0000-4000-8000-000000000001";

// Your own accounts live in the main checkout's scripts/ folder, git-ignored, so worktrees read the same file. Skipped when absent.
const mainRoot = dirname(
  execSync("git rev-parse --path-format=absolute --git-common-dir", { encoding: "utf8" }).trim(),
);
const localPath = join(mainRoot, "scripts", "seed-users.local.ts");
const localSeedUsers = existsSync(localPath)
  ? (await import(pathToFileURL(localPath).href)).default(seedIds)
  : [];

// A person may hold several roles at the same company or store (ADR 0015).
type SeedUser = {
  email: string;
  globalRoles: string[];
  organizationRoles: { organizationId: string; role: string }[];
  storeRoles: { storeId: string; role: string }[];
};

const seedUsers: SeedUser[] = [
  {
    email: "platform-operator@ghostshift.test",
    globalRoles: ["platform_operator"],
    organizationRoles: [],
    storeRoles: [],
  },
  {
    // Two roles at one company.
    email: "merchant-orders@ghostshift.test",
    globalRoles: [],
    organizationRoles: [
      { organizationId: northstarThreads, role: "merchant_order_manager" },
      { organizationId: northstarThreads, role: "merchant_dispute_handler" },
    ],
    storeRoles: [],
  },
  {
    email: "merchant-nordic@ghostshift.test",
    globalRoles: [],
    organizationRoles: [{ organizationId: pocketAtelier, role: "merchant_dispute_handler" }],
    storeRoles: [],
  },
  { email: "viewer@ghostshift.test", globalRoles: [], organizationRoles: [], storeRoles: [] },
  // The Night Shift customers' checkout account (docs/guides/night-shift.md). Creates orders, nothing else.
  {
    email: CHECKOUT_EMAIL,
    globalRoles: [],
    organizationRoles: [],
    storeRoles: liveStores.map((storeId) => ({ storeId, role: "checkout_customer" })),
  },
  ...localSeedUsers,
];

// One finished agent run for the agent, linked to the three latest captures at its store, so the
// audit log's Run column shows something locally. The events are seeded, not made by the run.
// The old sample run is deleted first (its events lose the link), then made again.
async function seedSampleRun(agentUserId: string) {
  await db.begin(async (tx) => {
    await tx`delete from public.agent_runs where id = ${sampleRunId}`;
    const events = await tx<{ id: string; occurred_at: Date }[]>`
      select e.id, e.occurred_at
      from public.order_events e
      join public.orders o on o.id = e.order_id
      where o.store_id = ${satinSparrow} and e.action = 'captured'
      order by e.occurred_at desc, e.id desc
      limit 3`;
    if (events.length === 0) return;
    const times = events.map((event) => event.occurred_at.getTime());
    const startedAt = new Date(Math.min(...times) - 60_000);
    const endedAt = new Date(Math.max(...times) + 60_000);
    // An insert, not an update: the agent_runs_end_now trigger would set ended_at to now().
    await tx`insert into public.agent_runs (id, agent_user_id, started_at, ended_at, purpose, summary)
      values (${sampleRunId}, ${agentUserId}, ${startedAt}, ${endedAt},
        'Sample: capture shipped orders at Satin Sparrow',
        ${`Captured ${events.length} shipped orders.`})`;
    await tx`update public.order_events set agent_run_id = ${sampleRunId}
      where id in ${tx(events.map((event) => event.id))}`;
  });
}

// `supabase status -o env` prints lines like KEY="value". Those hold the local URL and keys.
function readLocalSettings() {
  const output = execSync("pnpm exec supabase status -o env", { encoding: "utf8" });
  const settings = new Map<string, string>();
  for (const line of output.split("\n")) {
    const match = /^([A-Z_]+)="?([^"]*)"?$/.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) settings.set(match[1], match[2]);
  }
  return settings;
}

const local = readLocalSettings();
const apiUrl = local.get("API_URL");
const secretKey = local.get("SECRET_KEY") ?? local.get("SERVICE_ROLE_KEY");
const password = process.env.SEED_PASSWORD;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

if (!apiUrl || !secretKey) {
  throw new Error("Couldn't read the local Supabase URL and key. Is `pnpm db:start` running?");
}
// The service key and the database user can do anything, so this script only talks to this machine.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(apiUrl)) {
  throw new Error(`Refusing to seed users at ${apiUrl}. This script is for local Supabase only.`);
}
if (!/@(127\.0\.0\.1|localhost):/.test(databaseUrl)) {
  throw new Error("Refusing to write access rows to a database that isn't local.");
}
if (!password) {
  throw new Error("Set SEED_PASSWORD in .dev.vars (see .dev.vars.example).");
}

const supabase = createClient(apiUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = postgres(databaseUrl, { max: 1 });

try {
  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;

  for (const seedUser of seedUsers) {
    const existing = listed.users.find((user) => user.email === seedUser.email);
    const attributes = { password, email_confirm: true };

    let userId: string;
    if (existing) {
      const { error } = await supabase.auth.admin.updateUserById(existing.id, attributes);
      if (error) throw error;
      userId = existing.id;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: seedUser.email,
        ...attributes,
      });
      if (error) throw error;
      userId = data.user.id;
    }

    // Replace this user's access rows, so running the script again gives the same result.
    await db.begin(async (tx) => {
      await tx`delete from public.user_roles where user_id = ${userId}`;
      await tx`delete from public.org_members where user_id = ${userId}`;
      await tx`delete from public.store_assignments where user_id = ${userId}`;
      for (const role of seedUser.globalRoles) {
        await tx`insert into public.user_roles (user_id, role) values (${userId}, ${role})`;
      }
      for (const membership of seedUser.organizationRoles) {
        await tx`insert into public.org_members (user_id, organization_id, role)
          values (${userId}, ${membership.organizationId}, ${membership.role})`;
      }
      for (const assignment of seedUser.storeRoles) {
        await tx`insert into public.store_assignments (user_id, store_id, role)
          values (${userId}, ${assignment.storeId}, ${assignment.role})`;
      }
    });

    if (seedUser.email === process.env.SEED_AGENT_EMAIL) await seedSampleRun(userId);

    const access = [
      ...seedUser.globalRoles,
      ...seedUser.organizationRoles.map((membership) => `${membership.role} (organization)`),
      ...seedUser.storeRoles.map((assignment) => `${assignment.role} (store)`),
    ];
    console.log(
      `${existing ? "updated" : "created"}  ${seedUser.email}  access: ${access.join(", ") || "none"}`,
    );
  }
} finally {
  await db.end();
}
