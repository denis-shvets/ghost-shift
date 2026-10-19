import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import type { CreateOrderInput } from "../model/create-order-input";

import { createOrderFn, fetchStoresFn } from "./functions";

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("~/shared/env/server-env", () => ({
  parseServerEnv: () => ({ DATABASE_URL: "postgresql://unused" }),
}));

vi.mock("~/features/auth/server/session", () => ({ requireUser }));

// Same stub as auth/server/functions.test.ts: keeps the real validator and handler, no request context.
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

describe("createOrderFn", () => {
  it("returns 403 for a signed-in user who is not a platform developer, before touching the database", async () => {
    requireUser.mockResolvedValue(merchant);

    const validOrder: CreateOrderInput = {
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
    const error = await createOrderFn({ data: validOrder }).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(403);
  });

  it("rejects input that fails the schema, before the role check runs", async () => {
    // Cast on purpose: the point is that the runtime validator rejects what TypeScript would not catch.
    const invalid = { storeId: "not-a-uuid" } as unknown as CreateOrderInput;
    await expect(createOrderFn({ data: invalid })).rejects.toThrow();
    expect(requireUser).not.toHaveBeenCalled();
  });
});

describe("fetchStoresFn", () => {
  it("returns 403 for a user who is not a platform developer", async () => {
    requireUser.mockResolvedValue(merchant);

    const error = await fetchStoresFn({}).catch((thrown: unknown) => thrown);
    expect((error as Response).status).toBe(403);
  });
});
