import { deleteCookie, getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";
import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerEnv } from "~/shared/env/server-env";

import { createAuthClient, revokeSession } from "./supabase-auth";
import { endSession, readCurrentUser, requireUser, saveSession } from "./session";

const { getClaims, getUser } = vi.hoisted(() => ({ getClaims: vi.fn(), getUser: vi.fn() }));

vi.mock("@tanstack/react-start/server", () => ({
  setCookie: vi.fn(),
  getCookie: vi.fn(),
  getRequestHeader: vi.fn(),
  deleteCookie: vi.fn(),
}));

vi.mock("./supabase-auth", () => ({
  createAuthClient: vi.fn(),
  revokeSession: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("endSession", () => {
  it("ends the Supabase session with the cookie token and clears the cookie", async () => {
    vi.mocked(getCookie).mockReturnValue("token-value");

    await endSession(env);

    expect(revokeSession).toHaveBeenCalledWith(env, "token-value");
    expect(deleteCookie).toHaveBeenCalledWith("ghost-shift-access-token", { path: "/" });
  });

  // A failed call to Supabase must not leave the person signed in on this browser.
  it("still clears the cookie when Supabase fails", async () => {
    vi.mocked(getCookie).mockReturnValue("token-value");
    vi.mocked(revokeSession).mockRejectedValue(new Error("down"));

    await expect(endSession(env)).resolves.toBeUndefined();

    expect(deleteCookie).toHaveBeenCalledWith("ghost-shift-access-token", { path: "/" });
  });
});

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
    getUser.mockReset();
    vi.mocked(getRequestHeader).mockReset();
    getUser.mockResolvedValue({ data: { user: {} }, error: null });
    vi.mocked(createAuthClient).mockReturnValue({
      auth: { getClaims, getUser },
    } as unknown as ReturnType<typeof createAuthClient>);
  });

  describe("readCurrentUser", () => {
    it("returns null without asking Supabase when there is no token cookie", async () => {
      vi.mocked(getCookie).mockReturnValue(undefined);

      await expect(readCurrentUser(env)).resolves.toBeNull();
      expect(getUser).not.toHaveBeenCalled();
      expect(getClaims).not.toHaveBeenCalled();
    });

    it("accepts a Bearer token from the Authorization header", async () => {
      vi.mocked(getRequestHeader).mockReturnValue("Bearer header-token");
      getClaims.mockResolvedValue({ data: { claims: validClaims }, error: null });

      await expect(readCurrentUser(env)).resolves.toEqual(validClaims);
      expect(getUser).toHaveBeenCalledWith("header-token");
      expect(getClaims).toHaveBeenCalledWith("header-token");
    });

    it("still accepts the cookie when there is no Authorization header", async () => {
      vi.mocked(getRequestHeader).mockReturnValue(undefined);
      vi.mocked(getCookie).mockReturnValue("token");
      getClaims.mockResolvedValue({ data: { claims: validClaims }, error: null });

      await expect(readCurrentUser(env)).resolves.toEqual(validClaims);
      expect(getUser).toHaveBeenCalledWith("token");
    });

    it("prefers the Bearer token when both the header and the cookie are present", async () => {
      vi.mocked(getRequestHeader).mockReturnValue("Bearer header-token");
      vi.mocked(getCookie).mockReturnValue("cookie-token");
      getClaims.mockResolvedValue({ data: { claims: validClaims }, error: null });

      await readCurrentUser(env);
      expect(getUser).toHaveBeenCalledWith("header-token");
      expect(getUser).not.toHaveBeenCalledWith("cookie-token");
    });

    // A malformed or empty header counts as no token, the same as a missing cookie.
    it.each(["Bearer", "Bearer ", "Basic abc123", "Bearer a b", ""])(
      "returns null for the malformed Authorization header %j when there is no cookie",
      async (header) => {
        vi.mocked(getRequestHeader).mockReturnValue(header);
        vi.mocked(getCookie).mockReturnValue(undefined);

        await expect(readCurrentUser(env)).resolves.toBeNull();
        expect(getUser).not.toHaveBeenCalled();
      },
    );

    // A session ended by sign-out (or revoked elsewhere) is rejected here, before its token expires.
    it("returns null when Supabase says the session no longer exists", async () => {
      vi.mocked(getCookie).mockReturnValue("revoked-token");
      getUser.mockResolvedValue({ data: { user: null }, error: { message: "session_not_found" } });
      getClaims.mockResolvedValue({ data: { claims: validClaims }, error: null });

      await expect(readCurrentUser(env)).resolves.toBeNull();
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
      expect(getUser).toHaveBeenCalledWith("token");
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
