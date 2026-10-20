import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchRefunds } from "./functions";

const { requireUser, listActivityOrFirstPage, listReadableStores } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listActivityOrFirstPage: vi.fn(),
  listReadableStores: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("~/shared/env/server-env", () => ({
  parseServerEnv: () => ({ DATABASE_URL: "postgresql://unused" }),
}));

vi.mock("~/features/auth/server/session", () => ({ requireUser }));

vi.mock("~/shared/db/request-db", () => ({
  withDb: (fn: (db: unknown) => unknown) => fn({}),
}));

vi.mock("./activity-repository", () => ({ listActivityOrFirstPage, listReadableStores }));

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

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ sub: "11111111-1111-4111-8111-111111111111", global_roles: [] });
  listActivityOrFirstPage.mockResolvedValue({ events: [], nextCursor: null, prevCursor: null });
  listReadableStores.mockResolvedValue([]);
});

describe("fetchRefunds", () => {
  it("always asks for refunded events, whatever action the caller sends", async () => {
    // Cast on purpose: the schema has no action field, so the runtime check must drop it.
    await fetchRefunds({ data: { action: "captured" } as never });

    expect(listActivityOrFirstPage).toHaveBeenCalledWith(
      {},
      expect.anything(),
      expect.objectContaining({ action: "refunded" }),
    );
  });

  it("returns the page together with the stores for the filter", async () => {
    listReadableStores.mockResolvedValue([{ id: "store-1", name: "Moonlight Goods Sweden" }]);

    const result = await fetchRefunds({ data: {} });

    expect(result).toMatchObject({ stores: [{ id: "store-1", name: "Moonlight Goods Sweden" }] });
  });

  it("does not read anything when the user is not signed in", async () => {
    requireUser.mockRejectedValue(new Response(null, { status: 401 }));

    await expect(fetchRefunds({ data: {} })).rejects.toBeInstanceOf(Response);
    expect(listActivityOrFirstPage).not.toHaveBeenCalled();
  });
});
