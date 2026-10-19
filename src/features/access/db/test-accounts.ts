import { sql } from "drizzle-orm";

import type { Database } from "~/shared/db/client";

// The database the tests use. Tests may write fake accounts to it, so it must be local.
export const testDatabaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

const localHosts = new Set(["127.0.0.1", "localhost"]);

// Throws unless the URL is a Postgres URL on this machine. Parsing the URL, rather than
// matching text, stops a hostname like "127.0.0.1.example.com" from passing.
export function assertLocalDatabase(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const isPostgres = url.protocol === "postgres:" || url.protocol === "postgresql:";
  if (!isPostgres || !localHosts.has(url.hostname)) {
    throw new Error(
      `Refusing to create test accounts in ${url.hostname || "an unknown host"}. Tests may only write to a local database.`,
    );
  }
}

// Fixed ids for test accounts, so tests can refer to them by name. They are created with
// the access they need, and left in place: they are idempotent, and `pnpm db:reset` clears them.
export const testAccounts = {
  // merchant_order_manager and merchant_dispute_handler at Moonlight Goods (merchant A).
  merchantA: "11111111-1111-4111-8111-111111111111",
  // merchant_dispute_handler at Nordic Bikes (merchant B).
  merchantB: "22222222-2222-4222-8222-222222222222",
  // agent_first_line and agent_second_line at Nordic Bikes Germany only.
  agent: "33333333-3333-4333-8333-333333333333",
  // platform_developer, a global role.
  developer: "44444444-4444-4444-8444-444444444444",
  // platform_operator, a global role without organization permissions.
  operator: "66666666-6666-4666-8666-666666666666",
  // Has no access at all.
  stranger: "55555555-5555-4555-8555-555555555555",
} as const;

// Ids shared with supabase/seed.sql through src/shared/seed/seed-ids.json.
import seedIds from "~/shared/seed/seed-ids.json" with { type: "json" };

const moonlightGoods = seedIds.organizations.moonlightGoods;
const nordicBikes = seedIds.organizations.nordicBikes;
const nordicBikesGermany = seedIds.stores.nordicBikesGermany;

export async function createTestAccounts(db: Database) {
  assertLocalDatabase(testDatabaseUrl);
  for (const [name, id] of Object.entries(testAccounts)) {
    await db.execute(
      sql`insert into auth.users (id, email, raw_app_meta_data)
        values (${id}::uuid, ${`${name}@test.ghostshift.test`}, '{}'::jsonb)
        on conflict do nothing`,
    );
  }
  await db.execute(
    sql`insert into public.user_roles (user_id, role)
      values (${testAccounts.developer}::uuid, 'platform_developer'),
        (${testAccounts.operator}::uuid, 'platform_operator')
      on conflict do nothing`,
  );
  await db.execute(
    sql`insert into public.org_members (user_id, organization_id, role) values
      (${testAccounts.merchantA}::uuid, ${moonlightGoods}::uuid, 'merchant_order_manager'),
      (${testAccounts.merchantA}::uuid, ${moonlightGoods}::uuid, 'merchant_dispute_handler'),
      (${testAccounts.merchantB}::uuid, ${nordicBikes}::uuid, 'merchant_dispute_handler')
      on conflict do nothing`,
  );
  await db.execute(
    sql`insert into public.store_assignments (user_id, store_id, role) values
      (${testAccounts.agent}::uuid, ${nordicBikesGermany}::uuid, 'agent_first_line'),
      (${testAccounts.agent}::uuid, ${nordicBikesGermany}::uuid, 'agent_second_line')
      on conflict do nothing`,
  );
}
