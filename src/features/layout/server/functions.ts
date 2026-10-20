import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";

import { readCurrentUser } from "~/features/auth/server/session";
import type { UserClaims } from "~/shared/auth/user-claims";
import { parseServerEnv } from "~/shared/env/server-env";

// Never redirects, so /login still renders for signed-out visitors.
export const fetchCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<UserClaims | null> => {
    try {
      return await readCurrentUser(parseServerEnv(env));
    } catch (error) {
      // Supabase outage: show the page as signed out instead of failing every page.
      if (!isAuthRetryableFetchError(error)) throw error;
      console.error("Could not read the current user", error);
      return null;
    }
  },
);
