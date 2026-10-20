// Creates the local sign-in accounts and gives each one its access (ADR 0007, ADR 0015).
// Run `pnpm db:start` and `pnpm db:reset` first, then `pnpm db:seed-users`.
// Safe to run again: accounts get their password reset and their access rows replaced.
import { execSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { z } from "zod";

// Ids shared with supabase/seed.sql through src/shared/seed/seed-ids.json.
import seedIds from "../src/shared/seed/seed-ids.json" with { type: "json" };

const moonlightGoods = seedIds.organizations.moonlightGoods;
const nordicBikes = seedIds.organizations.nordicBikes;
const nordicBikesGermany = seedIds.stores.nordicBikesGermany;
// A fixed id, so running the script again updates the same sample run.
const sampleRunId = "5a3b1e00-0000-4000-8000-000000000001";

// The agent's address lives in .dev.vars, not in this public repo, so any address works.
// The script checks it is a valid email and stops with a clear error if it is missing or wrong.
const agentEmail = z.email().safeParse(process.env.SEED_AGENT_EMAIL);
if (!agentEmail.success) {
  throw new Error(
    "Set SEED_AGENT_EMAIL in .dev.vars to a valid email address (see .dev.vars.example).",
  );
}

// The MCP server signs in with the same address, so both read SEED_DEVELOPER_EMAIL. Empty means the default.
const developerEmail = z
  .email()
  .default("developer@ghostshift.test")
  .safeParse(process.env.SEED_DEVELOPER_EMAIL || undefined);
if (!developerEmail.success) {
  throw new Error("SEED_DEVELOPER_EMAIL must be a valid email address, or empty for the default.");
}

// A person may hold several roles at the same company or store (ADR 0015).
const seedUsers = [
  {
    email: developerEmail.data,
    globalRoles: ["platform_developer"],
    organizationRoles: [],
    storeRoles: [],
  },
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
      { organizationId: moonlightGoods, role: "merchant_order_manager" },
      { organizationId: moonlightGoods, role: "merchant_dispute_handler" },
    ],
    storeRoles: [],
  },
  {
    email: "merchant-nordic@ghostshift.test",
    globalRoles: [],
    organizationRoles: [{ organizationId: nordicBikes, role: "merchant_dispute_handler" }],
    storeRoles: [],
  },
  { email: "viewer@ghostshift.test", globalRoles: [], organizationRoles: [], storeRoles: [] },
  // The agent's address comes from SEED_AGENT_EMAIL. Two roles at one store.
  {
    email: agentEmail.data,
    globalRoles: [],
    organizationRoles: [],
    storeRoles: [
      { storeId: nordicBikesGermany, role: "agent_first_line" },
      { storeId: nordicBikesGermany, role: "agent_second_line" },
    ],
  },
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
      where o.store_id = ${nordicBikesGermany} and e.action = 'captured'
      order by e.occurred_at desc, e.id desc
      limit 3`;
    if (events.length === 0) return;
    const times = events.map((event) => event.occurred_at.getTime());
    const startedAt = new Date(Math.min(...times) - 60_000);
    const endedAt = new Date(Math.max(...times) + 60_000);
    // An insert, not an update: the agent_runs_end_now trigger would set ended_at to now().
    await tx`insert into public.agent_runs (id, agent_user_id, started_at, ended_at, purpose, summary)
      values (${sampleRunId}, ${agentUserId}, ${startedAt}, ${endedAt},
        'Sample: capture shipped orders at Nordic Bikes Germany',
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

    if (seedUser.email === agentEmail.data) await seedSampleRun(userId);

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
