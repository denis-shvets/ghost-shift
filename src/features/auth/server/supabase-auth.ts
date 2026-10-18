import { createClient } from "@supabase/supabase-js";

import type { ServerEnv } from "~/shared/env/server-env";

// A new client per request, with no session kept in memory. Workers don't share state
// between requests, so the tokens live in cookies instead (see session.ts).
export function createAuthClient(
  env: Pick<ServerEnv, "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY">,
) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
