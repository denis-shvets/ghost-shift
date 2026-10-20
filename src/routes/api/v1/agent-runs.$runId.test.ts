import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import { Route } from "./agent-runs.$runId";

const { readCurrentUser, endAgentRun, close } = vi.hoisted(() => ({
  readCurrentUser: vi.fn(),
  endAgentRun: vi.fn(),
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

vi.mock("~/features/agent-runs/server/agent-runs-repository", () => ({ endAgentRun }));

const agent: UserClaims = { sub: "33333333-3333-4333-8333-333333333333", global_roles: [] };
const runId = "5a3b1e00-0000-4000-8000-000000000001";

// The route's PATCH handler, called the way TanStack Start calls it.
function patch(body: BodyInit | null, id = runId) {
  const request = new Request(`http://localhost/api/v1/agent-runs/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
  const handler = Route.options.server?.handlers as unknown as {
    PATCH: (ctx: { request: Request; params: { runId: string } }) => Promise<Response>;
  };
  return handler.PATCH({ request, params: { runId: id } });
}

beforeEach(() => {
  vi.clearAllMocks();
  close.mockResolvedValue(undefined);
  readCurrentUser.mockResolvedValue(agent);
});

describe("PATCH /api/v1/agent-runs/$runId", () => {
  it("returns 401 JSON when nobody is signed in", async () => {
    readCurrentUser.mockResolvedValue(null);

    const response = await patch("{}");

    expect(response.status).toBe(401);
    expect(endAgentRun).not.toHaveBeenCalled();
  });

  it("returns 400 for a run id that isn't a uuid", async () => {
    const response = await patch("{}", "run-1");

    expect(response.status).toBe(400);
    expect(endAgentRun).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that is not valid JSON", async () => {
    const response = await patch("{");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
  });

  it("ends the run with the summary and returns it", async () => {
    const run = { id: runId, summary: "Captured 2 orders" };
    endAgentRun.mockResolvedValue(run);

    const response = await patch(JSON.stringify({ summary: "Captured 2 orders" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(run);
    expect(endAgentRun).toHaveBeenCalledWith(expect.anything(), agent, runId, {
      summary: "Captured 2 orders",
    });
  });

  it("ends the run without a summary when the body is empty", async () => {
    endAgentRun.mockResolvedValue({ id: runId, summary: null });

    const response = await patch(null);

    expect(response.status).toBe(200);
    expect(endAgentRun).toHaveBeenCalledWith(expect.anything(), agent, runId, {});
  });

  it.each([
    ["not_found", 404],
    ["already_ended", 409],
  ] as const)("answers %s with %i", async (result, status) => {
    endAgentRun.mockResolvedValue(result);

    const response = await patch("{}");

    expect(response.status).toBe(status);
  });
});
