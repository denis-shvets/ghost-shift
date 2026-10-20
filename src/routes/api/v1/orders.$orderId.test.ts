import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import { Route } from "./orders.$orderId";

const { readCurrentUser, getOrder, close } = vi.hoisted(() => ({
  readCurrentUser: vi.fn(),
  getOrder: vi.fn(),
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
  getOrder,
}));

const agent: UserClaims = { sub: "33333333-3333-4333-8333-333333333333", global_roles: [] };
const orderId = "743bf9c5-f7a6-47d6-b1cb-bf9811f8b922";

// The route's GET handler, called the way TanStack Start calls it.
function get(id: string) {
  const request = new Request(`http://localhost/api/v1/orders/${id}`);
  const handler = Route.options.server?.handlers as unknown as {
    GET: (ctx: { request: Request; params: { orderId: string } }) => Promise<Response>;
  };
  return handler.GET({ request, params: { orderId: id } });
}

beforeEach(() => {
  vi.clearAllMocks();
  close.mockResolvedValue(undefined);
  readCurrentUser.mockResolvedValue(agent);
});

describe("GET /api/v1/orders/:orderId", () => {
  it("returns 401 JSON when nobody is signed in", async () => {
    readCurrentUser.mockResolvedValue(null);

    const response = await get(orderId);

    expect(response.status).toBe(401);
    expect(getOrder).not.toHaveBeenCalled();
  });

  it("returns 404 for an order the user can't see", async () => {
    getOrder.mockResolvedValue(null);

    const response = await get(orderId);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Order not found" });
  });

  it("returns 400 for an id longer than 100 characters", async () => {
    const response = await get("a".repeat(101));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid input" });
    expect(getOrder).not.toHaveBeenCalled();
  });

  it("returns the order for a user with no global roles", async () => {
    const order = { id: orderId, reference: "NB-1001" };
    getOrder.mockResolvedValue(order);

    const response = await get(orderId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(order);
    expect(getOrder).toHaveBeenCalledWith(expect.anything(), agent, orderId);
    expect(close).toHaveBeenCalled();
  });
});
