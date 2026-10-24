import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { requirePlatformDeveloper } from "~/features/access/server/require-platform-developer";
import { requireUser } from "~/features/auth/server/session";
import { listReadableStores } from "~/features/stores/server/stores-repository";
import { withDb } from "~/shared/db/request-db";
import { parseServerEnv } from "~/shared/env/server-env";
import { refusalOrLog } from "~/shared/errors/refusal-or-log";

import { listDisputesInput } from "../model/list-disputes-input";
import { openDisputeInput } from "../model/open-dispute-input";
import {
  DisputeError,
  listDisputes,
  listDisputesOrFirstPage,
  openDispute,
} from "./disputes-repository";

const refuse = refusalOrLog(DisputeError);

// Server functions are public HTTP endpoints, so the role check runs here, not only in the page.
// It only keeps the developer page for platform developers. Who may open a dispute is still decided
// by the database (disputes.manage at the order's store).
export const fetchOpenDisputesFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser(parseServerEnv(env));
  requirePlatformDeveloper(user);
  // shortcut: capped at 100 open disputes, no paging on the developer page, upgrade if a store passes that
  return withDb(
    async (db) => (await listDisputes(db, user, { limit: 100, status: "open" })).disputes,
  );
});

// Any signed-in user may read the disputes RLS shows them. requireUser redirects anonymous visitors to /login.
export const fetchDisputesFn = createServerFn({ method: "GET" })
  .validator(listDisputesInput)
  .handler(async ({ data }) => {
    const user = await requireUser(parseServerEnv(env));
    return withDb(async (db) => ({
      ...(await listDisputesOrFirstPage(db, user, data)),
      stores: await listReadableStores(db, user),
    }));
  });

export const openDisputeFn = createServerFn({ method: "POST" })
  .validator(openDisputeInput)
  .handler(async ({ data }) => {
    const user = await requireUser(parseServerEnv(env));
    requirePlatformDeveloper(user);
    // Refusals keep their message; anything else is logged and replaced, so SQL and the reason never reach the page.
    return withDb((db) => openDispute(db, user, data).catch(refuse));
  });
