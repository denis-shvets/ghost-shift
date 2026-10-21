import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import { Route } from "./scheduled-checkouts";

const { readCurrentUser, queueCheckouts, planningContext, close } = vi.hoisted(() => ({
  readCurrentUser: vi.fn(),
  queueCheckouts: vi.fn(),
  planningContext: vi.fn(),
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

vi.mock("~/features/scheduled-checkouts/server/scheduled-checkouts-repository", () => ({
  queueCheckouts,
  planningContext,
}));

const customer: UserClaims = { sub: "88888888-8888-4888-8888-888888888888", global_roles: [] };

const handlers = Route.options.server?.handlers as unknown as {
  GET: (ctx: { request: Request }) => Promise<Response>;
  POST: (ctx: { request: Request }) => Promise<Response>;
};
const url = "http://localhost/api/v1/scheduled-checkouts";

function post(body: unknown) {
  return handlers.POST({
    request: new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
}

const address = {
  firstName: "Jonas",
  lastName: "Weber",
  streetAddress: "Isestraße 63",
  postalCode: "20149",
  city: "Hamburg",
  country: "DE",
};
const order = {
  storeId: "d2a94f1c-7e3b-4c8d-9a60-b1e2f3a4c5d6",
  customer: { firstName: "Jonas", lastName: "Weber", email: "jonas.weber@example.com" },
  billingAddress: address,
  shippingAddress: address,
  paymentMethod: "amex",
  shippingCarrier: "UPS",
  lines: [
    { type: "physical", sku: "B-1", name: "Bike", quantity: 1, unitPrice: 99000, taxRate: 1900 },
  ],
};
const planId = "5a3b1e00-0000-4000-8000-000000000001";
const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  close.mockResolvedValue(undefined);
  readCurrentUser.mockResolvedValue(customer);
});

describe("GET /api/v1/scheduled-checkouts", () => {
  it("answers the latest pending due time and the open stores", async () => {
    const context = { lastDueAt: "2026-10-28T09:00:00.000Z", storeIds: [order.storeId] };
    planningContext.mockResolvedValue(context);

    const response = await handlers.GET({ request: new Request(url) });

    expect(await response.json()).toEqual(context);
    expect(planningContext).toHaveBeenCalledWith(expect.anything(), customer);
  });
});

describe("POST /api/v1/scheduled-checkouts", () => {
  it("queues the plan and answers 201", async () => {
    queueCheckouts.mockResolvedValue({ planId, queued: 1 });
    const body = { planId, checkouts: [{ dueAt: inOneHour(), persona: "jonas-weber", order }] };

    const response = await post(body);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ planId, queued: 1 });
    expect(queueCheckouts).toHaveBeenCalledWith(expect.anything(), customer, body);
  });

  it("refuses a checkout in the past", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const response = await post({
      planId,
      checkouts: [{ dueAt: past, persona: "jonas-weber", order }],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Every dueAt must be in the future" });
    expect(queueCheckouts).not.toHaveBeenCalled();
  });

  it("refuses an order that says it already shipped", async () => {
    const shipped = { ...order, shipped: true };
    const response = await post({
      planId,
      checkouts: [{ dueAt: inOneHour(), persona: "jonas-weber", order: shipped }],
    });

    expect(response.status).toBe(400);
    expect(queueCheckouts).not.toHaveBeenCalled();
  });

  it("refuses an empty plan", async () => {
    const response = await post({ planId, checkouts: [] });
    expect(response.status).toBe(400);
  });
});
