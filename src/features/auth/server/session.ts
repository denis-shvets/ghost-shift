import { redirect } from "@tanstack/react-router";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import type { Session } from "@supabase/supabase-js";

import { type UserClaims, toUserClaims } from "~/shared/auth/user-claims";
import type { ServerEnv } from "~/shared/env/server-env";

import { createAuthClient } from "./supabase-auth";

// HttpOnly means page scripts can't read the token. It only travels with requests to this site.
const ACCESS_TOKEN_COOKIE = "ghost-shift-access-token";

export function saveSession(session: Session) {
  setCookie(ACCESS_TOKEN_COOKIE, session.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: session.expires_in,
  });
}

export function clearSession() {
  deleteCookie(ACCESS_TOKEN_COOKIE, { path: "/" });
}

// shortcut: checks the token on every request, revisit if traffic grows.
// Checks the token's signature with Supabase before trusting its claims.
export async function readCurrentUser(env: ServerEnv): Promise<UserClaims | null> {
  const token = getCookie(ACCESS_TOKEN_COOKIE);
  if (!token) return null;

  const { data, error } = await createAuthClient(env).auth.getClaims(token);
  if (error || !data) return null;
  return toUserClaims(data.claims);
}

// For server functions that need a signed-in user. Anyone else is sent to the login page.
export async function requireUser(env: ServerEnv): Promise<UserClaims> {
  const user = await readCurrentUser(env);
  if (!user) throw redirect({ to: "/login" });
  return user;
}
