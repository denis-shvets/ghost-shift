// Creates the local sign-in accounts and gives each one its access (ADR 0007, ADR 0015).
// Run `pnpm db:start` and `pnpm db:reset` first, then `pnpm db:seed-users`.
// Safe to run again: accounts get their password reset and their access rows replaced.
import { execSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

// Ids shared with supabase/seed.sql through src/shared/seed/seed-ids.json.
import seedIds from "../src/shared/seed/seed-ids.json" with { type: "json" };

const moonlightGoods = seedIds.organizations.moonlightGoods;
const nordicBikes = seedIds.organizations.nordicBikes;
const nordicBikesGermany = seedIds.stores.nordicBikesGermany;

// A person may hold several roles at the same company or store (ADR 0015).
const seedUsers = [
  {
    email: "developer@ghostshift.test",
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
  // The agent uses the owner's Gmail with a plus-address, so its mail lands in the owner's inbox.
  // Two roles at one store.
  {
    email: "auth.shvets+orders-agent@gmail.com",
    globalRoles: [],
    organizationRoles: [],
    storeRoles: [
      { storeId: nordicBikesGermany, role: "agent_first_line" },
      { storeId: nordicBikesGermany, role: "agent_second_line" },
    ],
  },
];

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
