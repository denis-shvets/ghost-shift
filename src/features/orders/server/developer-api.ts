import { env } from "cloudflare:workers";

import { requirePlatformDeveloper } from "~/features/access/server/require-platform-developer";
import { readCurrentUser } from "~/features/auth/server/session";
import type { UserClaims } from "~/shared/auth/user-claims";
import { type Database, createDb } from "~/shared/db/client";
import { parseServerEnv } from "~/shared/env/server-env";

import { StoreNotFoundError } from "./orders-repository";

export function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

// Shared by the developer API routes: checks the caller, opens one database connection, and
// turns the common failures into JSON. Browsers send the cookie, scripts send a bearer token.
export async function handleDeveloperRequest(
  run: (db: Database, user: UserClaims) => Promise<Response>,
): Promise<Response> {
  const config = parseServerEnv(env);
  const user = await readCurrentUser(config);
  if (!user) return json({ error: "Unauthorized" }, 401);

  try {
    requirePlatformDeveloper(user);
  } catch {
    return json({ error: "Forbidden" }, 403);
  }

  const db = createDb(config.DATABASE_URL);
  try {
    return await run(db, user);
  } catch (error) {
    // A store the user can't see is reported as missing, the same as one that doesn't exist.
    if (error instanceof StoreNotFoundError) return json({ error: "Store not found" }, 404);
    throw error;
  } finally {
    await db.close();
  }
}
