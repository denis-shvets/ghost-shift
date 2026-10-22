import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import { Route } from "./agent-runs";

const { readCurrentUser, startAgentRun, close } = vi.hoisted(() => ({
  readCurrentUser: vi.fn(),
  startAgentRun: vi.fn(),
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

vi.mock("~/features/agent-runs/server/agent-runs-repository", () => ({ startAgentRun }));

const agent: UserClaims = { sub: "33333333-3333-4333-8333-333333333333", global_roles: [] };

// The route's POST handler, called the way TanStack Start calls it.
function post(body: BodyInit) {
  const request = new Request("http://localhost/api/v1/agent-runs", {
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
  readCurrentUser.mockResolvedValue(agent);
});

describe("POST /api/v1/agent-runs", () => {
  it("returns 401 JSON when nobody is signed in", async () => {
    readCurrentUser.mockResolvedValue(null);

    const response = await post(JSON.stringify({ purpose: "Review open orders" }));

    expect(response.status).toBe(401);
    expect(startAgentRun).not.toHaveBeenCalled();
  });

  it("returns 400 with the Zod issues when the purpose is missing", async () => {
    const response = await post(JSON.stringify({}));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Invalid input",
      issues: [expect.objectContaining({ path: ["purpose"] })],
    });
    expect(startAgentRun).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that is not valid JSON", async () => {
    const response = await post("{");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
  });

  it("starts the run and answers 201 with its id", async () => {
    const run = { id: "5a3b1e00-0000-4000-8000-000000000001", startedAt: "2026-10-20T02:00:00Z" };
    startAgentRun.mockResolvedValue(run);

    const response = await post(JSON.stringify({ purpose: " Review open orders " }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(run);
    expect(startAgentRun).toHaveBeenCalledWith(expect.anything(), agent, {
      purpose: "Review open orders",
    });
    expect(close).toHaveBeenCalled();
  });
});
