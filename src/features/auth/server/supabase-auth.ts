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

// Ends this browser's session at Supabase. Only the access token is stored, so the client
// has no session to sign out, and the logout route is called directly with the token.
export async function revokeSession(
  env: Pick<ServerEnv, "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY">,
  token: string,
) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/logout?scope=local`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Supabase logout failed with ${response.status}`);
}
