import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { requireUser } from "~/features/auth/server/session";
import { requirePlatformDeveloper } from "~/features/access/server/require-platform-developer";
import { createDb } from "~/shared/db/client";
import { parseServerEnv } from "~/shared/env/server-env";

import { createOrderInput } from "../model/create-order-input";
import { orderActionInput } from "../model/order-action-input";
import { orderIdInput } from "../model/order-id-input";
import { orderListInput } from "../model/order-list-input";
import {
  OrderActionError,
  applyOrderAction,
  createOrder,
  getOrder,
  listOrdersOrFirstPage,
  listStoresForOrder,
} from "./orders-repository";

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

// Server functions are public HTTP endpoints, so the role check runs here, not only in the page.
// It only keeps the developer page for platform developers. Who may create an order is still decided
// by the database (orders.create), the same as POST /api/v1/orders.
export const createOrderFn = createServerFn({ method: "POST" })
  .validator(createOrderInput)
  .handler(async ({ data }) => {
    const user = await requireUser(parseServerEnv(env));
    requirePlatformDeveloper(user);
    return withDb((db) => createOrder(db, user, data));
  });

export const fetchStoresFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser(parseServerEnv(env));
  requirePlatformDeveloper(user);
  return withDb((db) => listStoresForOrder(db, user));
});

// Capture, cancel or refund. No role check here: the database decides who may do which action.
// A refusal comes back as an Error with the database's message, so the page and WebMCP can show it.
// Anything else only goes to the log: its message holds the SQL and the input.
export const orderActionFn = createServerFn({ method: "POST" })
  .validator(orderActionInput)
  .handler(async ({ data }) => {
    const user = await requireUser(parseServerEnv(env));
    return withDb((db) =>
      applyOrderAction(db, user, data).catch((error: unknown) => {
        if (error instanceof OrderActionError) throw new Error(error.message);
        console.error(error);
        throw new Error("Something went wrong");
      }),
    );
  });
