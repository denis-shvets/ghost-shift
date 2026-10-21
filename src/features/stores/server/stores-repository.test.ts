import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAccounts,
  testAccounts,
  testDatabaseUrl,
} from "~/features/access/db/test-accounts";
import type { UserClaims } from "~/shared/auth/user-claims";
import { createDb } from "~/shared/db/client";

import { listReadableStores } from "./stores-repository";

// Runs against the local Supabase database with seed data (`pnpm db:reset`).
const db = createDb(testDatabaseUrl);

beforeAll(() => createTestAccounts(db));
afterAll(() => db.close());

describe("listReadableStores", () => {
  it("lists every store for a platform operator, who can read stores but not organizations", async () => {
    const operator: UserClaims = {
      sub: testAccounts.operator,
      global_roles: ["platform_operator"],
    };

    const names = (await listReadableStores(db, operator)).map((store) => store.name);

    expect(names).toHaveLength(20);
    expect(names).toContain("Satin Sparrow");
  });

  it("lists only the stores an agent is assigned to", async () => {
    const agent: UserClaims = { sub: testAccounts.agent, global_roles: [] };

    const names = (await listReadableStores(db, agent)).map((store) => store.name);

    expect(names).toEqual(["Satin Sparrow"]);
  });

  it("lists no stores to a user with no access", async () => {
    const stranger: UserClaims = {
      sub: testAccounts.stranger,
      global_roles: [],
    };

    expect(await listReadableStores(db, stranger)).toEqual([]);
  });
});
