import { setCookie } from "@tanstack/react-start/server";
import type { Session } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { saveSession } from "./session";

vi.mock("@tanstack/react-start/server", () => ({
  setCookie: vi.fn(),
  getCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

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
