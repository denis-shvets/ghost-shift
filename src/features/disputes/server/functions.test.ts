import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import { fetchOpenDisputesFn, openDisputeFn } from "./functions";

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("~/shared/env/server-env", () => ({
  parseServerEnv: () => ({ DATABASE_URL: "postgresql://unused" }),
}));

vi.mock("~/features/auth/server/session", () => ({ requireUser }));

// Same stub as orders/server/functions.test.ts: keeps the real validator and handler, no request context.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (schema: { parse: (value: unknown) => unknown }) => ({
      handler: (fn: (ctx: { data: unknown }) => unknown) => async (input: { data: unknown }) =>
        fn({ data: schema.parse(input.data) }),
    }),
    handler: (fn: (ctx: { data?: unknown }) => unknown) => async (input?: { data?: unknown }) =>
      fn({ data: input?.data }),
  }),
}));

const merchant: UserClaims = { sub: "11111111-1111-4111-8111-111111111111", global_roles: [] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("openDisputeFn", () => {
  it("returns 403 for a signed-in user who is not a platform developer, before touching the database", async () => {
    requireUser.mockResolvedValue(merchant);

    const error = await openDisputeFn({
      data: { orderId: "743bf9c5-f7a6-47d6-b1cb-bf9811f8b922", reason: "Item never arrived" },
    }).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(403);
  });

  it("rejects a blank reason before the role check runs", async () => {
    await expect(
      openDisputeFn({
        data: { orderId: "743bf9c5-f7a6-47d6-b1cb-bf9811f8b922", reason: "   " },
      }),
    ).rejects.toThrow();
    expect(requireUser).not.toHaveBeenCalled();
  });
});

describe("fetchOpenDisputesFn", () => {
  it("returns 403 for a user who is not a platform developer", async () => {
    requireUser.mockResolvedValue(merchant);

    const error = await fetchOpenDisputesFn({}).catch((thrown: unknown) => thrown);
    expect((error as Response).status).toBe(403);
  });
});
