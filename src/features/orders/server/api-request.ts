import { env } from "cloudflare:workers";

import { readCurrentUser } from "~/features/auth/server/session";
import type { UserClaims } from "~/shared/auth/user-claims";
import { type Database, createDb } from "~/shared/db/client";
import { parseServerEnv } from "~/shared/env/server-env";

import {
  OrderActionError,
  OrderCreateForbiddenError,
  StoreNotFoundError,
} from "./orders-repository";

export function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

// Shared by the API routes: checks the caller, opens one database connection, and
// turns the common failures into JSON. Browsers send the cookie, scripts send a bearer token.
// No role check here: row-level security and public.order_action() decide what each user may do.
export async function handleApiRequest(
  run: (db: Database, user: UserClaims) => Promise<Response>,
): Promise<Response> {
  // Everything that can fail sits inside the try, so scripts always get JSON back.
  let db: Database | undefined;
  try {
    const config = parseServerEnv(env);
    const user = await readCurrentUser(config);
    if (!user) return json({ error: "Unauthorized" }, 401);

    // Caps each signed-in user, so one agent in a loop can't flood the database. Checked before
    // the database opens, so a refused call costs no query. The binding's period is 60 seconds.
    const { success } = await env.API_LIMITER.limit({ key: user.sub });
    if (!success) {
      return Response.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    db = createDb(config.DATABASE_URL);
    return await run(db, user);
  } catch (error) {
    // A store the user can't see is reported as missing, the same as one that doesn't exist.
    if (error instanceof StoreNotFoundError) return json({ error: "Store not found" }, 404);
    // A capture, cancel or refund the database refused: its message says why.
    if (error instanceof OrderActionError) return json({ error: error.message }, error.status);
    // The user can see the store but may not create orders in it.
    if (error instanceof OrderCreateForbiddenError) return json({ error: "Forbidden" }, 403);
    // Anything else (a database rule, a reference clash) still answers in JSON, so scripts can read it.
    console.error(error);
    return json({ error: "Internal error" }, 500);
  } finally {
    await db?.close();
  }
}
