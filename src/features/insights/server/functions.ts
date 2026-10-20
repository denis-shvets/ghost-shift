import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { requireUser } from "~/features/auth/server/session";
import { withDb } from "~/shared/db/request-db";
import { parseServerEnv } from "~/shared/env/server-env";

import { getInsights } from "./insights-repository";

export const fetchInsights = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser(parseServerEnv(env));
  return withDb((db) => getInsights(db, user));
});
