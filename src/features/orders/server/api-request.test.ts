import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import { handleApiRequest } from "./api-request";
import { OrderCreateForbiddenError, StoreNotFoundError } from "./orders-repository";

const { readCurrentUser, close, limit } = vi.hoisted(() => ({
  readCurrentUser: vi.fn(),
  close: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: { API_LIMITER: { limit } } }));

vi.mock("~/shared/env/server-env", () => ({
  parseServerEnv: () => ({ DATABASE_URL: "postgresql://unused" }),
}));

vi.mock("~/features/auth/server/session", () => ({ readCurrentUser }));

vi.mock("~/shared/db/client", () => ({
  createDb: () => ({ close }),
}));

const developer: UserClaims = {
  sub: "22222222-2222-4222-8222-222222222222",
  global_roles: ["platform_developer"],
};

beforeEach(() => {
  vi.clearAllMocks();
  close.mockResolvedValue(undefined);
  limit.mockResolvedValue({ success: true });
});

describe("handleApiRequest", () => {
  it("returns 429 with Retry-After when the user is over the limit, without opening the database", async () => {
    readCurrentUser.mockResolvedValue(developer);
    limit.mockResolvedValue({ success: false });
    const run = vi.fn();

    const response = await handleApiRequest(run);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({ error: "Too many requests" });
    expect(run).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("counts requests per signed-in user", async () => {
    readCurrentUser.mockResolvedValue(developer);

    await handleApiRequest(async () => Response.json({ ok: true }));

    expect(limit).toHaveBeenCalledWith({ key: developer.sub });
  });

  it("returns 401 JSON when nobody is signed in, without running the handler", async () => {
    readCurrentUser.mockResolvedValue(null);
    const run = vi.fn();

    const response = await handleApiRequest(run);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the handler as the developer and closes the database afterwards", async () => {
    readCurrentUser.mockResolvedValue(developer);

    const response = await handleApiRequest(async (_db, user) => Response.json({ user }));

    expect(await response.json()).toEqual({ user: developer });
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns 404 JSON when the store is not visible, and still closes the database", async () => {
    readCurrentUser.mockResolvedValue(developer);

    const response = await handleApiRequest(async () => {
      throw new StoreNotFoundError("Store not found");
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Store not found" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns 403 JSON when the user may not create orders in the store", async () => {
    readCurrentUser.mockResolvedValue(developer);

    const response = await handleApiRequest(async () => {
      throw new OrderCreateForbiddenError("Forbidden");
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns 500 and logs a missing grant instead of hiding it as 403", async () => {
    readCurrentUser.mockResolvedValue(developer);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handleApiRequest(async () => {
      throw Object.assign(new Error("Failed query"), {
        cause: { code: "42501", message: "permission denied for table orders" },
      });
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal error" });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns 500 JSON for any other failure, and still closes the database", async () => {
    readCurrentUser.mockResolvedValue(developer);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handleApiRequest(async () => {
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

    const response = await handleApiRequest(vi.fn());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal error" });
    expect(close).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
