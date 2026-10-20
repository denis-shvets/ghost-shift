import { execFileSync } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import { agentConfigInput, runAgentTool } from "./mcp-agent.ts";

const orderId = "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b";
const runId = "5a3b1e00-0000-4000-8000-000000000001";

describe("agent tools", () => {
  it("list_orders sends the filters as a query string", async () => {
    const request = vi.fn(async () => ({ orders: [], nextCursor: null }));

    await runAgentTool("list_orders", { status: "authorized", shipped: true }, { request });

    expect(request).toHaveBeenCalledWith("/api/v1/orders?status=authorized&shipped=true");
  });

  it("capture_order sends the action with the run id", async () => {
    const request = vi.fn(async () => ({ status: "captured" }));
    const args = { orderId, amount: 45000, reason: "Shipped with DHL", agentRunId: runId };

    await runAgentTool("capture_order", args, { request });

    expect(request).toHaveBeenCalledWith("/api/v1/order-actions", {
      method: "POST",
      body: JSON.stringify({ ...args, action: "capture" }),
    });
  });

  it("refuses an action without a run, before any request", async () => {
    const request = vi.fn();
    const result = await runAgentTool(
      "capture_order",
      { orderId, amount: 45000, reason: "Shipped with DHL" },
      { request },
    );

    expect(result).toMatchObject({ isError: true });
    expect(request).not.toHaveBeenCalled();
  });

  it("start_agent_run and end_agent_run call the run endpoints", async () => {
    const request = vi.fn(async () => ({ id: runId }));

    await runAgentTool("start_agent_run", { purpose: "Capture shipped orders" }, { request });
    await runAgentTool("end_agent_run", { runId, summary: "Captured 3 orders." }, { request });

    expect(request).toHaveBeenNthCalledWith(1, "/api/v1/agent-runs", {
      method: "POST",
      body: JSON.stringify({ purpose: "Capture shipped orders" }),
    });
    expect(request).toHaveBeenNthCalledWith(2, `/api/v1/agent-runs/${runId}`, {
      method: "PATCH",
      body: JSON.stringify({ summary: "Captured 3 orders." }),
    });
  });

  it("refuses ids that aren't uuids, so nothing else reaches the URL path", async () => {
    const request = vi.fn();

    const order = await runAgentTool("get_order", { orderId: "../stores" }, { request });
    const run = await runAgentTool("end_agent_run", { runId: "x", summary: "Done" }, { request });

    expect(order).toMatchObject({ isError: true });
    expect(run).toMatchObject({ isError: true });
    expect(request).not.toHaveBeenCalled();
  });

  it("has no tool to create, cancel or refund orders", async () => {
    const request = vi.fn();
    const args = { orderId, amount: 100, reason: "Test", agentRunId: runId };

    for (const name of ["create_order", "cancel_order", "refund_order"]) {
      expect(await runAgentTool(name, args, { request })).toMatchObject({ isError: true });
    }
    expect(request).not.toHaveBeenCalled();
  });
});

describe("starting in plain Node", () => {
  // pnpm mcp:agent runs without Vite, so every file it imports needs its .ts extension.
  it("loads the MCP server the way pnpm starts it", () => {
    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", "await import('./scripts/mcp-agent.ts'); console.log('ok')"],
      { encoding: "utf8" },
    );
    expect(output.trim()).toBe("ok");
  });
});

describe("agentConfigInput", () => {
  const env = {
    SUPABASE_URL: "http://127.0.0.1:64321",
    SUPABASE_PUBLISHABLE_KEY: "key",
    SEED_PASSWORD: "secret",
  };

  it("needs the agent's email", () => {
    expect(agentConfigInput.safeParse(env).success).toBe(false);
    expect(agentConfigInput.safeParse({ ...env, SEED_AGENT_EMAIL: "" }).success).toBe(false);
    expect(agentConfigInput.parse({ ...env, SEED_AGENT_EMAIL: "agent@example.com" })).toMatchObject(
      { SEED_AGENT_EMAIL: "agent@example.com", APP_URL: "http://localhost:3000" },
    );
  });

  it("still talks only to this machine", () => {
    const agent = { ...env, SEED_AGENT_EMAIL: "agent@example.com" };
    expect(agentConfigInput.safeParse({ ...agent, APP_URL: "https://example.com" }).success).toBe(
      false,
    );
  });
});
