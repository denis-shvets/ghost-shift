import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import seedIds from "./seed-ids.json" with { type: "json" };

// The SQL seed can't read the JSON file, so it keeps its own copy of each id.
// This test fails if the two ever disagree.
const seedSql = readFileSync("supabase/seed.sql", "utf8");
const allIds = [...Object.values(seedIds.organizations), ...Object.values(seedIds.stores)];

describe("seed ids", () => {
  it.each(allIds)("seed.sql contains %s", (id) => {
    expect(seedSql).toContain(id);
  });
});
