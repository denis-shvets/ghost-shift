import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { createDb } from "~/shared/db/client";
import { parseServerEnv } from "~/shared/env/server-env";

import { orderIdInput } from "../model/order-id-input";
import { getOrder, listOrders } from "./orders-repository";

function openDb() {
  return createDb(parseServerEnv(env).DATABASE_URL);
}

export const fetchOrders = createServerFn({ method: "GET" }).handler(async () => {
  const db = openDb();
  try {
    return await listOrders(db);
  } finally {
    await db.close();
  }
});

// Server functions are public HTTP endpoints, so the input is checked at runtime, not just typed.
export const fetchOrder = createServerFn({ method: "GET" })
  .validator(orderIdInput)
  .handler(async ({ data: id }) => {
    const db = openDb();
    try {
      return await getOrder(db, id);
    } finally {
      await db.close();
    }
  });
