import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type Database = ReturnType<typeof createDb>;

// Workers can't share connections between requests, so each request makes its own client.
// `prepare: false` is required behind Supabase's transaction pooler.
export function createDb(url: string) {
  const client = postgres(url, { prepare: false, max: 1 });
  return Object.assign(drizzle({ client, casing: "snake_case" }), {
    close: () => client.end(),
  });
}

export type Role = "anon" | "authenticated";

/**
 * Runs queries as a Supabase role, so row-level security applies.
 * Request handlers must query through this, never as the connection's own user.
 */
export function withRole<T>(
  db: Database,
  role: Role,
  run: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`set local role ${role}`));
    return run(tx);
  });
}
