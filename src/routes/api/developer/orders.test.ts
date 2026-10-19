import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import { Route } from "./orders";

const { readCurrentUser, createOrder, close } = vi.hoisted(() => ({
  readCurrentUser: vi.fn(),
  createOrder: vi.fn(),
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

vi.mock("~/features/orders/server/orders-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/features/orders/server/orders-repository")>()),
  createOrder,
}));

const merchant: UserClaims = { sub: "11111111-1111-4111-8111-111111111111", global_roles: [] };
const developer: UserClaims = {
  sub: "22222222-2222-4222-8222-222222222222",
  global_roles: ["platform_developer"],
};

const validBody = {
  storeId: "e03c55bc-c4a7-4795-a5ba-3b3b3cf800d6",
  shopper: { name: "Test", email: "test@example.com", country: "SE" },
  paymentMethod: "card",
  shippingCarrier: "PostNord",
  lines: [{ type: "physical", name: "Mug", quantity: 1, unitPrice: 100, taxRate: 0 }],
};

// The route's POST handler, called the way TanStack Start calls it.
function post(body: BodyInit) {
  const request = new Request("http://localhost/api/developer/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const handler = Route.options.server?.handlers as unknown as {
    POST: (ctx: { request: Request }) => Promise<Response>;
  };
  return handler.POST({ request });
}

beforeEach(() => {
  vi.clearAllMocks();
  close.mockResolvedValue(undefined);
});

describe("POST /api/developer/orders", () => {
  it("returns 401 JSON when nobody is signed in", async () => {
    readCurrentUser.mockResolvedValue(null);

    const response = await post(JSON.stringify(validBody));

    expect(response.status).toBe(401);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("returns 403 JSON for a merchant who is not a platform developer", async () => {
    readCurrentUser.mockResolvedValue(merchant);

    const response = await post(JSON.stringify(validBody));

    expect(response.status).toBe(403);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("returns 400 with the Zod issues for input that fails the schema", async () => {
    readCurrentUser.mockResolvedValue(developer);

    const response = await post(JSON.stringify({ storeId: "not-a-uuid" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid input");
    expect(body.issues.length).toBeGreaterThan(0);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that is not valid JSON", async () => {
    readCurrentUser.mockResolvedValue(developer);

    const response = await post("{not json");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("returns 201 with the id and reference of the new order", async () => {
    readCurrentUser.mockResolvedValue(developer);
    createOrder.mockResolvedValue({
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      reference: "DEV-1A2B3C4D",
    });

    const response = await post(JSON.stringify(validBody));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      reference: "DEV-1A2B3C4D",
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
