import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { requireUser } from "~/features/auth/server/session";
import { withDb } from "~/shared/db/request-db";
import { parseServerEnv } from "~/shared/env/server-env";

import { activityListInput } from "../model/activity-list-input";
import { listActivityOrFirstPage } from "./activity-repository";

// Server functions are public HTTP endpoints, so the filters and cursor are checked here.
export const fetchActivity = createServerFn({ method: "GET" })
  .validator(activityListInput)
  .handler(async ({ data }) => {
    const user = await requireUser(parseServerEnv(env));
    return withDb((db) => listActivityOrFirstPage(db, user, data));
  });
