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
  // merchant_order_manager and merchant_dispute_handler at Northstar Threads (merchant A).
  merchantA: "11111111-1111-4111-8111-111111111111",
  // merchant_dispute_handler at Pocket Atelier (merchant B).
  merchantB: "22222222-2222-4222-8222-222222222222",
  // merchant_admin at Northstar Threads. The only test account that may edit store settings.
  merchantAdmin: "99999999-9999-4999-8999-999999999999",
  // agent_first_line and agent_second_line at Satin Sparrow only.
  agent: "33333333-3333-4333-8333-333333333333",
  // agent_first_line only at Satin Sparrow. Cannot capture, cancel or refund.
  firstLineAgent: "77777777-7777-4777-8777-777777777777",
  // platform_developer, a global role.
  developer: "44444444-4444-4444-8444-444444444444",
  // platform_operator, a global role without organization permissions.
  operator: "66666666-6666-4666-8666-666666666666",
  // checkout_customer at Satin Sparrow only (Night Shift).
  customer: "88888888-8888-4888-8888-888888888888",
  // Has no access at all.
  stranger: "55555555-5555-4555-8555-555555555555",
} as const;

// Ids shared with supabase/seed.sql through src/shared/seed/seed-ids.json.
import seedIds from "~/shared/seed/seed-ids.json" with { type: "json" };

const northstarThreads = seedIds.organizations.northstarThreads;
const pocketAtelier = seedIds.organizations.pocketAtelier;
const satinSparrow = seedIds.stores.satinSparrow;

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
      (${testAccounts.merchantA}::uuid, ${northstarThreads}::uuid, 'merchant_order_manager'),
      (${testAccounts.merchantA}::uuid, ${northstarThreads}::uuid, 'merchant_dispute_handler'),
      (${testAccounts.merchantB}::uuid, ${pocketAtelier}::uuid, 'merchant_dispute_handler'),
      (${testAccounts.merchantAdmin}::uuid, ${northstarThreads}::uuid, 'merchant_admin')
      on conflict do nothing`,
  );
  await db.execute(
    sql`insert into public.store_assignments (user_id, store_id, role) values
      (${testAccounts.agent}::uuid, ${satinSparrow}::uuid, 'agent_first_line'),
      (${testAccounts.agent}::uuid, ${satinSparrow}::uuid, 'agent_second_line'),
      (${testAccounts.firstLineAgent}::uuid, ${satinSparrow}::uuid, 'agent_first_line'),
      (${testAccounts.customer}::uuid, ${satinSparrow}::uuid, 'checkout_customer')
      on conflict do nothing`,
  );
}
