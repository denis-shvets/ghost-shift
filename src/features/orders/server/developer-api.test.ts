import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import { handleDeveloperRequest } from "./developer-api";
import { StoreNotFoundError } from "./orders-repository";

const { readCurrentUser, close } = vi.hoisted(() => ({
  readCurrentUser: vi.fn(),
  close: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("~/shared/env/server-env", () => ({
  parseServerEnv: () => ({ DATABASE_URL: "postgresql://unused" }),
}));

vi.mock("~/features/auth/server/session", () => ({ readCurrentUser }));

vi.mock("~/shared/db/client", () => ({
  createDb: () => ({ close }),
}));

const merchant: UserClaims = { sub: "11111111-1111-4111-8111-111111111111", global_roles: [] };
const developer: UserClaims = {
  sub: "22222222-2222-4222-8222-222222222222",
  global_roles: ["platform_developer"],
};

beforeEach(() => {
  vi.clearAllMocks();
  close.mockResolvedValue(undefined);
});

describe("handleDeveloperRequest", () => {
  it("returns 401 JSON when nobody is signed in, without running the handler", async () => {
    readCurrentUser.mockResolvedValue(null);
    const run = vi.fn();

    const response = await handleDeveloperRequest(run);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(run).not.toHaveBeenCalled();
  });

  it("returns 403 JSON for a signed-in user who is not a platform developer", async () => {
    readCurrentUser.mockResolvedValue(merchant);
    const run = vi.fn();

    const response = await handleDeveloperRequest(run);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the handler as the developer and closes the database afterwards", async () => {
    readCurrentUser.mockResolvedValue(developer);

    const response = await handleDeveloperRequest(async (_db, user) => Response.json({ user }));

    expect(await response.json()).toEqual({ user: developer });
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns 404 JSON when the store is not visible, and still closes the database", async () => {
    readCurrentUser.mockResolvedValue(developer);

    const response = await handleDeveloperRequest(async () => {
      throw new StoreNotFoundError("Store not found");
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Store not found" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns 500 JSON for any other failure, and still closes the database", async () => {
    readCurrentUser.mockResolvedValue(developer);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handleDeveloperRequest(async () => {
      throw new Error("duplicate key value violates unique constraint");
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal error" });
    expect(close).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("returns 500 JSON when the sign-in check itself fails, without opening the database", async () => {
    readCurrentUser.mockRejectedValue(new Error("fetch failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handleDeveloperRequest(vi.fn());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal error" });
    expect(close).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
