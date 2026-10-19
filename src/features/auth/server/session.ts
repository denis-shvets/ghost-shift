import { redirect } from "@tanstack/react-router";
import { deleteCookie, getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";
import { type Session, isAuthRetryableFetchError } from "@supabase/supabase-js";

import { type UserClaims, toUserClaims } from "~/shared/auth/user-claims";
import type { ServerEnv } from "~/shared/env/server-env";

import { createAuthClient, revokeSession } from "./supabase-auth";

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

// Ends the Supabase session, then clears the cookie even if Supabase can't be reached.
export async function endSession(env: ServerEnv) {
  const token = getCookie(ACCESS_TOKEN_COOKIE);
  try {
    if (token) await revokeSession(env, token);
  } catch {
    // The cookie is still cleared below. The token then expires on its own.
  } finally {
    clearSession();
  }
}

// Browsers send the cookie. Scripts and local tools send "Authorization: Bearer <token>" instead.
// A malformed header is ignored, so the cookie (or no token) decides.
function readAccessToken(): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(getRequestHeader("authorization") ?? "");
  return match?.[1] ?? getCookie(ACCESS_TOKEN_COOKIE);
}

// shortcut: makes two Supabase calls per request, revisit if traffic grows.
// getUser asks Supabase that the session still exists (a revoked token fails here),
// and getClaims reads the custom claims such as global_roles.
export async function readCurrentUser(env: ServerEnv): Promise<UserClaims | null> {
  const token = readAccessToken();
  if (!token) return null;

  const auth = createAuthClient(env).auth;
  const { error: sessionError } = await auth.getUser(token);
  // Supabase unreachable is an outage, not a signed-out user; throwing keeps it from looking like a 401.
  if (isAuthRetryableFetchError(sessionError)) throw sessionError;
  if (sessionError) return null;

  const { data, error } = await auth.getClaims(token);
  if (error || !data) return null;
  return toUserClaims(data.claims);
}

// For server functions that need a signed-in user. Anyone else is sent to the login page.
export async function requireUser(env: ServerEnv): Promise<UserClaims> {
  const user = await readCurrentUser(env);
  if (!user) throw redirect({ to: "/login" });
  return user;
}
