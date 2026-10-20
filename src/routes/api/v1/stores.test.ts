import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import { Route } from "./stores";

const { readCurrentUser, listStoresForOrder, close } = vi.hoisted(() => ({
  readCurrentUser: vi.fn(),
  listStoresForOrder: vi.fn(),
  close: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: { API_LIMITER: { limit: async () => ({ success: true }) } },
}));

vi.mock("~/shared/env/server-env", () => ({
  parseServerEnv: () => ({ DATABASE_URL: "postgresql://unused" }),
}));

vi.mock("~/features/auth/server/session", () => ({ readCurrentUser }));

vi.mock("~/shared/db/client", () => ({
  createDb: () => ({ close }),
}));

vi.mock("~/features/orders/server/orders-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/features/orders/server/orders-repository")>()),
  listStoresForOrder,
}));

const developer: UserClaims = {
  sub: "22222222-2222-4222-8222-222222222222",
  global_roles: ["platform_developer"],
};

// The route's GET handler, called the way TanStack Start calls it.
function get() {
  const request = new Request("http://localhost/api/v1/stores");
  const handler = Route.options.server?.handlers as unknown as {
    GET: (ctx: { request: Request }) => Promise<Response>;
  };
  return handler.GET({ request });
}

beforeEach(() => {
  vi.clearAllMocks();
  close.mockResolvedValue(undefined);
});

describe("GET /api/v1/stores", () => {
  it("returns 401 JSON when nobody is signed in", async () => {
    readCurrentUser.mockResolvedValue(null);

    const response = await get();

    expect(response.status).toBe(401);
    expect(listStoresForOrder).not.toHaveBeenCalled();
  });

  it("returns 200 with the list of stores", async () => {
    readCurrentUser.mockResolvedValue(developer);
    const stores = [{ id: "e03c55bc-c4a7-4795-a5ba-3b3b3cf800d6", name: "Moonlight Goods Sweden" }];
    listStoresForOrder.mockResolvedValue(stores);

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(stores);
    expect(close).toHaveBeenCalledOnce();
  });
});
