import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { requireUser } from "~/features/auth/server/session";
import { withDb } from "~/shared/db/request-db";
import { parseServerEnv } from "~/shared/env/server-env";
import { refusalOrLog } from "~/shared/errors/refusal-or-log";

import {
  payoutAccountInput,
  storeIdInput,
  storeSettingsInput,
} from "../model/store-settings-input";
import {
  StoreSettingsError,
  createPayoutAccount,
  getStoreSettings,
  listReadableStores,
  updateStoreSettings,
} from "./stores-repository";

// Server functions are public HTTP endpoints, so every input is checked here. The database decides
// who may read or change each store (row-level security), so there is no role check in this file.
const refuse = refusalOrLog(StoreSettingsError);

export const fetchStores = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser(parseServerEnv(env));
  return withDb((db) => listReadableStores(db, user));
});

export const fetchStoreSettings = createServerFn({ method: "GET" })
  .validator(storeIdInput)
  .handler(async ({ data: storeId }) => {
    const user = await requireUser(parseServerEnv(env));
    return withDb((db) => getStoreSettings(db, user, storeId));
  });

export const saveStoreSettingsFn = createServerFn({ method: "POST" })
  .validator(storeSettingsInput)
  .handler(async ({ data }) => {
    const user = await requireUser(parseServerEnv(env));
    return withDb((db) => updateStoreSettings(db, user, data).catch(refuse));
  });

export const createPayoutAccountFn = createServerFn({ method: "POST" })
  .validator(payoutAccountInput)
  .handler(async ({ data }) => {
    const user = await requireUser(parseServerEnv(env));
    return withDb((db) => createPayoutAccount(db, user, data).catch(refuse));
  });
