import { setCookie } from "@tanstack/react-start/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signIn } from "./functions";
import { createAuthClient } from "./supabase-auth";

const { signInWithPassword } = vi.hoisted(() => ({ signInWithPassword: vi.fn() }));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("~/shared/env/server-env", () => ({
  parseServerEnv: () => ({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  }),
}));

// The real createServerFn needs a running Start request context. This stub keeps the real
// validator (loginInput) and handler, and calls them directly.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (schema: { parse: (value: unknown) => unknown }) => ({
      handler: (fn: (ctx: { data: unknown }) => unknown) => async (input: { data: unknown }) =>
        fn({ data: schema.parse(input.data) }),
    }),
    handler: (fn: (ctx: { data?: unknown }) => unknown) => async (input?: { data?: unknown }) =>
      fn({ data: input?.data }),
  }),
}));

vi.mock("@tanstack/react-start/server", () => ({
  setCookie: vi.fn(),
  getCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

vi.mock("./supabase-auth", () => ({
  createAuthClient: vi.fn(),
  revokeSession: vi.fn(),
}));

const credentials = { email: "owner@example.com", password: "correct-password" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAuthClient).mockReturnValue({
    auth: { signInWithPassword },
  } as unknown as ReturnType<typeof createAuthClient>);
});

describe("signIn", () => {
  // The same message for a wrong password and an unknown email, so the form can't be used to find accounts.
  it("returns the generic message and sets no cookie when the password is wrong", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });

    await expect(signIn({ data: credentials })).resolves.toEqual({
      ok: false,
      message: "Email or password is not right.",
    });
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("returns the same generic message when Supabase returns no session", async () => {
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: null });

    await expect(signIn({ data: credentials })).resolves.toEqual({
      ok: false,
      message: "Email or password is not right.",
    });
    expect(setCookie).not.toHaveBeenCalled();
  });

  // The token must be stored in the httpOnly cookie that the rest of the app reads.
  it("stores the session token in the cookie and returns ok", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "token-value", expires_in: 3600 } },
      error: null,
    });

    await expect(signIn({ data: credentials })).resolves.toEqual({ ok: true });
    expect(signInWithPassword).toHaveBeenCalledWith(credentials);
    expect(setCookie).toHaveBeenCalledWith("ghost-shift-access-token", "token-value", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    });
  });

  it("rejects an invalid email before Supabase is called", async () => {
    await expect(signIn({ data: { email: "not-an-email", password: "x" } })).rejects.toThrow();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
