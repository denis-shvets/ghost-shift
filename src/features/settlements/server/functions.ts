import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { requirePlatformDeveloper } from "~/features/access/server/require-platform-developer";
import { requireUser } from "~/features/auth/server/session";
import { withDb } from "~/shared/db/request-db";
import { parseServerEnv } from "~/shared/env/server-env";
import { refusalOrLog } from "~/shared/errors/refusal-or-log";

import { scheduleInput } from "../model/settlement-input";
import {
  SettlementError,
  approvePayouts,
  getSettlementSummary,
  listPendingPayouts,
  listSettlementsPage,
  saveSchedule,
} from "./settlements-repository";

const refuse = refusalOrLog(SettlementError);

// The database decides which stores and accounts each person sees and may change.
export const fetchSettlementsPage = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser(parseServerEnv(env));
  return withDb((db) => listSettlementsPage(db, user));
});

export const fetchSettlementSummary = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser(parseServerEnv(env));
  return withDb((db) => getSettlementSummary(db, user));
});

export const saveScheduleFn = createServerFn({ method: "POST" })
  .validator(scheduleInput)
  .handler(async ({ data }) => {
    const user = await requireUser(parseServerEnv(env));
    return withDb((db) => saveSchedule(db, user, data).catch(refuse));
  });

// Payouts waiting for a developer's approval. Developers only.
export const fetchPendingPayoutsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser(parseServerEnv(env));
  requirePlatformDeveloper(user);
  return withDb((db) => listPendingPayouts(db, user));
});

// Moves the picked pending payouts to paid. Developers only; the database checks the role and each status.
export const approvePayoutsFn = createServerFn({ method: "POST" })
  .validator(z.array(z.uuid()).min(1).max(100))
  .handler(async ({ data: settlementIds }) => {
    const user = await requireUser(parseServerEnv(env));
    requirePlatformDeveloper(user);
    return withDb((db) => approvePayouts(db, user, settlementIds).catch(refuse));
  });
