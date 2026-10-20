import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import { Route } from "./order-actions";

const { readCurrentUser, applyOrderAction, close } = vi.hoisted(() => ({
  readCurrentUser: vi.fn(),
  applyOrderAction: vi.fn(),
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
  applyOrderAction,
}));

const { OrderActionError } = await import("~/features/orders/server/orders-repository");

const developer: UserClaims = {
  sub: "22222222-2222-4222-8222-222222222222",
  global_roles: ["platform_developer"],
};

const orderId = "743bf9c5-f7a6-47d6-b1cb-bf9811f8b922";
const capture = { action: "capture", orderId, amount: 500, reason: "Shipped" };

// The route's POST handler, called the way TanStack Start calls it.
function post(body: BodyInit) {
  const request = new Request("http://localhost/api/developer/order-actions", {
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
  readCurrentUser.mockResolvedValue(developer);
});

describe("POST /api/developer/order-actions", () => {
  it("returns 400 with the Zod issues when the reason is missing", async () => {
    const response = await post(JSON.stringify({ action: "cancel", orderId }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Invalid input",
      issues: [expect.objectContaining({ path: ["reason"] })],
    });
    expect(applyOrderAction).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that is not valid JSON", async () => {
    const response = await post("{");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
  });

  it("runs the action as the caller and returns the new amounts", async () => {
    const result = { id: orderId, status: "part_captured", capturedAmount: 500 };
    applyOrderAction.mockResolvedValue(result);

    const response = await post(JSON.stringify(capture));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(applyOrderAction).toHaveBeenCalledWith(expect.anything(), developer, capture);
    expect(close).toHaveBeenCalled();
  });

  it.each([403, 404, 409] as const)(
    "answers a refusal from the database with %i and its message",
    async (status) => {
      applyOrderAction.mockRejectedValue(new OrderActionError("Refused", status));

      const response = await post(JSON.stringify(capture));

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "Refused" });
    },
  );
});
