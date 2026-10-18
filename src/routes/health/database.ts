import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { createDb } from "~/shared/db/client";
import { parseServerEnv } from "~/shared/env/server-env";

// Public on purpose: the daily keepalive workflow calls it without signing in.
// It runs one query so the free Supabase project counts the request as activity.
export const Route = createFileRoute("/health/database")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Public and runs a query, so cap each caller; the 429 skips the database.
        const { success } = await env.HEALTH_LIMITER.limit({
          key: request.headers.get("cf-connecting-ip") ?? "unknown",
        });
        if (!success) return new Response("Too many requests", { status: 429 });

        const db = createDb(parseServerEnv(env).DATABASE_URL);
        try {
          await db.execute(sql`select 1`);
          return new Response("ok", { status: 200 });
        } finally {
          await db.close();
        }
      },
    },
  },
});
