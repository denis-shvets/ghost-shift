import { getCookie, setCookie } from "@tanstack/react-start/server";
import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerEnv } from "~/shared/env/server-env";

import { createAuthClient } from "./supabase-auth";
import { readCurrentUser, requireUser, saveSession } from "./session";

const { getClaims } = vi.hoisted(() => ({ getClaims: vi.fn() }));

vi.mock("@tanstack/react-start/server", () => ({
  setCookie: vi.fn(),
  getCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

vi.mock("./supabase-auth", () => ({
  createAuthClient: vi.fn(),
}));

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "publishable-key",
} as ServerEnv;

const validClaims = {
  sub: "123e4567-e89b-42d3-a456-426614174000",
  email: "owner@example.com",
  global_roles: ["developer"],
};

describe("saveSession", () => {
  // The token must never be readable by page scripts, and must only be sent over HTTPS.
  it("stores the token in an httpOnly, secure, lax cookie that lasts as long as the token", () => {
    const session = { access_token: "token-value", expires_in: 3600 } as Session;

    saveSession(session);

    expect(setCookie).toHaveBeenCalledWith("ghost-shift-access-token", "token-value", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    });
  });
});

describe("sign-in gate", () => {
  beforeEach(() => {
    vi.mocked(getCookie).mockReset();
    getClaims.mockReset();
    vi.mocked(createAuthClient).mockReturnValue({
      auth: { getClaims },
    } as unknown as ReturnType<typeof createAuthClient>);
  });

  describe("readCurrentUser", () => {
    it("returns null without asking Supabase when there is no token cookie", async () => {
      vi.mocked(getCookie).mockReturnValue(undefined);

      await expect(readCurrentUser(env)).resolves.toBeNull();
      expect(getClaims).not.toHaveBeenCalled();
    });

    it("returns null when Supabase rejects the token, even if claims come back", async () => {
      vi.mocked(getCookie).mockReturnValue("expired-token");
      getClaims.mockResolvedValue({
        data: { claims: validClaims },
        error: { message: "invalid JWT" },
      });

      await expect(readCurrentUser(env)).resolves.toBeNull();
    });

    it("returns null when Supabase returns neither claims nor an error", async () => {
      vi.mocked(getCookie).mockReturnValue("token");
      getClaims.mockResolvedValue({ data: null, error: null });

      await expect(readCurrentUser(env)).resolves.toBeNull();
    });

    it("returns the user claims for a token Supabase verified", async () => {
      vi.mocked(getCookie).mockReturnValue("token");
      getClaims.mockResolvedValue({ data: { claims: validClaims }, error: null });

      await expect(readCurrentUser(env)).resolves.toEqual(validClaims);
      expect(getClaims).toHaveBeenCalledWith("token");
    });

    it("returns null when the verified claims are malformed", async () => {
      vi.mocked(getCookie).mockReturnValue("token");
      getClaims.mockResolvedValue({
        data: { claims: { ...validClaims, sub: "not-a-uuid" } },
        error: null,
      });

      await expect(readCurrentUser(env)).resolves.toBeNull();
    });
  });

  describe("requireUser", () => {
    it("redirects to /login when there is no token cookie", async () => {
      vi.mocked(getCookie).mockReturnValue(undefined);

      await expect(requireUser(env)).rejects.toMatchObject({ options: { to: "/login" } });
    });

    it("redirects to /login when Supabase rejects the token", async () => {
      vi.mocked(getCookie).mockReturnValue("expired-token");
      getClaims.mockResolvedValue({ data: null, error: { message: "invalid JWT" } });

      await expect(requireUser(env)).rejects.toMatchObject({ options: { to: "/login" } });
    });

    it("returns the user claims for a signed-in user", async () => {
      vi.mocked(getCookie).mockReturnValue("token");
      getClaims.mockResolvedValue({ data: { claims: validClaims }, error: null });

      await expect(requireUser(env)).resolves.toEqual(validClaims);
    });
  });
});
