import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { requireUser } from "~/features/auth/server/session";
import { withDb } from "~/shared/db/request-db";
import { parseServerEnv } from "~/shared/env/server-env";

import { activityListInput } from "../model/activity-list-input";
import { listReadableStores } from "~/features/stores/server/stores-repository";

import { listActivityOrFirstPage } from "./activity-repository";

// Server functions are public HTTP endpoints, so the filters and cursor are checked here.
export const fetchActivity = createServerFn({ method: "GET" })
  .validator(activityListInput)
  .handler(async ({ data }) => {
    const user = await requireUser(parseServerEnv(env));
    return withDb((db) => listActivityOrFirstPage(db, user, data));
  });

// The refunds page is the activity log with the action fixed to "refunded" (set here, not taken from the caller), plus the stores for its filter.
export const fetchRefunds = createServerFn({ method: "GET" })
  .validator(activityListInput.omit({ action: true }))
  .handler(async ({ data }) => {
    const user = await requireUser(parseServerEnv(env));
    return withDb(async (db) => {
      const page = await listActivityOrFirstPage(db, user, { ...data, action: "refunded" });
      return { ...page, stores: await listReadableStores(db, user) };
    });
  });
