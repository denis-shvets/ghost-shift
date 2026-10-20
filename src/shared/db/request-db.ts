import { env } from "cloudflare:workers";

import { parseServerEnv } from "~/shared/env/server-env";

import { createDb } from "./client";

// Each request gets its own connection, closed when the request ends.
export async function withDb<T>(run: (db: ReturnType<typeof createDb>) => Promise<T>) {
  const db = createDb(parseServerEnv(env).DATABASE_URL);
  try {
    return await run(db);
  } finally {
    await db.close();
  }
}
