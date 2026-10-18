import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { parseServerEnv } from "~/shared/env/server-env";

import { loginInput } from "../model/login-input";
import { endSession, saveSession } from "./session";
import { createAuthClient } from "./supabase-auth";

// Server functions are public HTTP endpoints, so the input is checked at runtime, not just typed.
export const signIn = createServerFn({ method: "POST" })
  .validator(loginInput)
  .handler(async ({ data }) => {
    const settings = parseServerEnv(env);
    const { data: result, error } = await createAuthClient(settings).auth.signInWithPassword(data);
    if (error || !result.session) {
      // Same message for a wrong password and an unknown email, so the form can't be used to find accounts.
      return { ok: false as const, message: "Email or password is not right." };
    }
    saveSession(result.session);
    return { ok: true as const };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await endSession(parseServerEnv(env));
});
