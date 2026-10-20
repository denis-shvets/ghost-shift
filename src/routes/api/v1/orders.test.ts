import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import { Route } from "./orders";

const { readCurrentUser, listOrders, createOrder, close } = vi.hoisted(() => ({
  readCurrentUser: vi.fn(),
  listOrders: vi.fn(),
  createOrder: vi.fn(),
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
  listOrders,
  createOrder,
}));

const { OrderCreateForbiddenError } = await import("~/features/orders/server/orders-repository");

const agent: UserClaims = { sub: "33333333-3333-4333-8333-333333333333", global_roles: [] };

const validBody = {
  storeId: "e03c55bc-c4a7-4795-a5ba-3b3b3cf800d6",
  customer: { firstName: "Test", lastName: "Customer", email: "test@example.com" },
  billingAddress: {
    firstName: "Test",
    lastName: "Customer",
    streetAddress: "Storgatan 1",
    postalCode: "111 22",
    city: "Stockholm",
    country: "SE",
  },
  shippingAddress: {
    firstName: "Test",
    lastName: "Customer",
    streetAddress: "Storgatan 1",
    postalCode: "111 22",
    city: "Stockholm",
    country: "SE",
  },
  paymentMethod: "card",
  shippingCarrier: "PostNord",
  lines: [{ type: "physical", name: "Mug", quantity: 1, unitPrice: 100, taxRate: 0 }],
};

type Handlers = {
  GET: (ctx: { request: Request }) => Promise<Response>;
  POST: (ctx: { request: Request }) => Promise<Response>;
};
const handlers = () => Route.options.server?.handlers as unknown as Handlers;

// The route's handlers, called the way TanStack Start calls them.
function get(query = "") {
  return handlers().GET({ request: new Request(`http://localhost/api/v1/orders${query}`) });
}

function post(body: BodyInit) {
  const request = new Request("http://localhost/api/v1/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return handlers().POST({ request });
}

beforeEach(() => {
  vi.clearAllMocks();
  close.mockResolvedValue(undefined);
  readCurrentUser.mockResolvedValue(agent);
});

describe("GET /api/v1/orders", () => {
  it("returns 401 JSON when nobody is signed in", async () => {
    readCurrentUser.mockResolvedValue(null);

    const response = await get();

    expect(response.status).toBe(401);
    expect(listOrders).not.toHaveBeenCalled();
  });

  it("returns 400 with the issues when the page size is out of range", async () => {
    const response = await get("?limit=0");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Invalid input",
      issues: [expect.objectContaining({ path: ["limit"] })],
    });
    expect(listOrders).not.toHaveBeenCalled();
  });

  it("lists the page for a user with no global roles, reading the query as text", async () => {
    const page = { orders: [], nextCursor: null, prevCursor: null };
    listOrders.mockResolvedValue(page);

    const response = await get("?limit=20");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(page);
    expect(listOrders).toHaveBeenCalledWith(expect.anything(), agent, { limit: 20 });
    expect(close).toHaveBeenCalled();
  });

  it("passes the search and filters from the query string to the repository", async () => {
    listOrders.mockResolvedValue({ orders: [], nextCursor: null, prevCursor: null });

    const response = await get(
      "?q=a%40b.se&status=captured&paymentMethod=card&storeId=e03c55bc-c4a7-4795-a5ba-3b3b3cf800d6",
    );

    expect(response.status).toBe(200);
    expect(listOrders).toHaveBeenCalledWith(expect.anything(), agent, {
      limit: 50,
      q: "a@b.se",
      status: "captured",
      paymentMethod: "card",
      storeId: "e03c55bc-c4a7-4795-a5ba-3b3b3cf800d6",
    });
  });

  it("treats blank values in the query string as not sent", async () => {
    listOrders.mockResolvedValue({ orders: [], nextCursor: null, prevCursor: null });

    const response = await get("?q=%20&status=");

    expect(response.status).toBe(200);
    expect(listOrders).toHaveBeenCalledWith(expect.anything(), agent, { limit: 50 });
  });

  it("returns 400 for an unknown status in the query string", async () => {
    const response = await get("?status=shipped");

    expect(response.status).toBe(400);
    expect(listOrders).not.toHaveBeenCalled();
  });

  it("treats an empty limit as not sent and uses the default", async () => {
    listOrders.mockResolvedValue({ orders: [], nextCursor: null, prevCursor: null });

    const response = await get("?limit=");

    expect(response.status).toBe(200);
    expect(listOrders).toHaveBeenCalledWith(expect.anything(), agent, { limit: 50 });
  });
});

describe("POST /api/v1/orders", () => {
  it("returns 401 JSON when nobody is signed in", async () => {
    readCurrentUser.mockResolvedValue(null);

    const response = await post(JSON.stringify(validBody));

    expect(response.status).toBe(401);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("returns 400 with the Zod issues for input that fails the schema", async () => {
    const response = await post(JSON.stringify({ storeId: "not-a-uuid" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid input");
    expect(body.issues.length).toBeGreaterThan(0);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("returns 400 JSON when shippingAddress is missing", async () => {
    const { shippingAddress: _omitted, ...withoutShipping } = validBody;

    const response = await post(JSON.stringify(withoutShipping));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.issues).toContainEqual(expect.objectContaining({ path: ["shippingAddress"] }));
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that is not valid JSON", async () => {
    const response = await post("{not json");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("creates the order as the caller with no role check in the app, and returns 201", async () => {
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
    expect(createOrder).toHaveBeenCalledWith(expect.anything(), agent, validBody);
    expect(close).toHaveBeenCalledOnce();
  });

  it("answers 403 when the user may not create orders in the store", async () => {
    createOrder.mockRejectedValue(new OrderCreateForbiddenError("Forbidden"));

    const response = await post(JSON.stringify(validBody));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
  });
});
