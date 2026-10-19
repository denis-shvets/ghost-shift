import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { requireUser } from "~/features/auth/server/session";
import { createDb } from "~/shared/db/client";
import { parseServerEnv } from "~/shared/env/server-env";

import { orderIdInput } from "../model/order-id-input";
import { orderListInput } from "../model/order-list-input";
import { getOrder, listOrdersOrFirstPage } from "./orders-repository";

// Each request gets its own connection, closed when the request ends.
async function withDb<T>(run: (db: ReturnType<typeof createDb>) => Promise<T>) {
  const db = createDb(parseServerEnv(env).DATABASE_URL);
  try {
    return await run(db);
  } finally {
    await db.close();
  }
}

// Server functions are public HTTP endpoints, so the page size and cursor are checked here.
export const fetchOrders = createServerFn({ method: "GET" })
  .validator(orderListInput)
  .handler(async ({ data }) => {
    const user = await requireUser(parseServerEnv(env));
    return withDb((db) => listOrdersOrFirstPage(db, user, data));
  });

// Server functions are public HTTP endpoints, so the input is checked at runtime, not just typed.
export const fetchOrder = createServerFn({ method: "GET" })
  .validator(orderIdInput)
  .handler(async ({ data: id }) => {
    const user = await requireUser(parseServerEnv(env));
    return withDb((db) => getOrder(db, user, id));
  });
