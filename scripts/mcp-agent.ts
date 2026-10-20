// Local MCP server (stdio) for the orders agent (ADR 0007). It signs in as the seeded agent account
// (SEED_AGENT_EMAIL) and calls /api/v1/* with its bearer token, so the agent's roles decide what it
// may do. Claude never sees the password. A scheduled Claude task uses it with the instructions in
// docs/agents/orders-agent.md. Run `pnpm dev` first.
import { z } from "zod";

import {
  agentRunEndInput,
  agentRunIdInput,
  agentRunStartInput,
} from "../src/features/agent-runs/model/agent-run-input.ts";
import { ORDER_ACTION_TOOLS } from "../src/features/orders/model/order-action-input.ts";
import { ORDER_STATUSES } from "../src/features/orders/model/order-statuses.ts";
import { PAYMENT_METHODS } from "../src/features/orders/model/payment-methods.ts";

import {
  type ApiClient,
  configInput,
  createApiClient,
  issueText,
  runIfMain,
  serveTools,
  toolError,
  toolText,
  unsetIfEmpty,
} from "./mcp-developer.ts";

export const agentConfigInput = configInput.omit({ SEED_DEVELOPER_EMAIL: true }).extend({
  SEED_AGENT_EMAIL: z.preprocess(
    unsetIfEmpty,
    z.email({
      error: "SEED_AGENT_EMAIL is required. Set it in .dev.vars (see .dev.vars.example).",
    }),
  ),
});

// The orders API checks these again; here they keep ids out of URL paths unless they are uuids.
const endRunInput = z.object({
  runId: agentRunIdInput,
  summary: agentRunEndInput.shape.summary.unwrap(),
});
const getOrderInput = z.object({ orderId: z.uuid() });
// The GET /api/v1/orders query, as tool input. Newest first; pass nextCursor to read the next page.
// A copy of orderListInput's filters, because that file imports optionalParam through the ~/ alias,
// which plain Node can't resolve. The API checks the query against orderListInput again.
export const listOrdersInput = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  shipped: z.boolean().optional(),
  storeId: z.uuid().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z.uuid().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// Only capture: the agent account may also cancel and refund (agent_second_line), but this agent's
// job never needs to, so an unattended run can't do it even if its instructions go wrong.
// The run is required: every change the agent makes belongs to a run.
const actionTools = ORDER_ACTION_TOOLS.filter((tool) => tool.action === "capture").map((tool) => ({
  ...tool,
  description: `${tool.description} Send the agentRunId from start_agent_run.`,
  input: tool.input.extend({ agentRunId: agentRunIdInput }),
}));

const schema = (input: z.ZodType) => z.toJSONSchema(input) as { type: "object" };

const tools = [
  {
    name: "start_agent_run",
    description:
      "Start a run before changing anything. purpose says what you are about to do. Returns the run id.",
    inputSchema: schema(agentRunStartInput),
  },
  {
    name: "end_agent_run",
    description:
      "End your run with a summary of what you did, what you skipped and why. Always end a run you started, also after errors.",
    inputSchema: schema(endRunInput),
  },
  {
    name: "list_orders",
    description:
      "List the orders you can see, newest first, up to limit (default 50). shipped: true for orders handed to the carrier. Pass nextCursor from the answer as cursor to read the next page; it is null on the last page.",
    inputSchema: schema(listOrdersInput),
  },
  {
    name: "get_order",
    description: "Get one order with its lines, addresses and timeline.",
    inputSchema: schema(getOrderInput),
  },
  ...actionTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: schema(tool.input),
  })),
];

function invalid(error: z.ZodError) {
  return toolError(`Invalid input: ${issueText(error.issues)}`);
}

export async function runAgentTool(name: string, args: Record<string, unknown>, api: ApiClient) {
  switch (name) {
    case "start_agent_run": {
      const input = agentRunStartInput.safeParse(args);
      if (!input.success) return invalid(input.error);
      return toolText(
        await api.request("/api/v1/agent-runs", {
          method: "POST",
          body: JSON.stringify(input.data),
        }),
      );
    }
    case "end_agent_run": {
      const input = endRunInput.safeParse(args);
      if (!input.success) return invalid(input.error);
      return toolText(
        await api.request(`/api/v1/agent-runs/${input.data.runId}`, {
          method: "PATCH",
          body: JSON.stringify({ summary: input.data.summary }),
        }),
      );
    }
    case "list_orders": {
      const input = listOrdersInput.safeParse(args);
      if (!input.success) return invalid(input.error);
      const query = new URLSearchParams(
        Object.entries(input.data).map(([key, value]) => [key, String(value)]),
      );
      return toolText(await api.request(`/api/v1/orders?${query}`));
    }
    case "get_order": {
      const input = getOrderInput.safeParse(args);
      if (!input.success) return invalid(input.error);
      return toolText(await api.request(`/api/v1/orders/${input.data.orderId}`));
    }
    default: {
      const tool = actionTools.find((candidate) => candidate.name === name);
      if (!tool) return toolError(`Unknown tool: ${name}`);
      const input = tool.input.safeParse(args);
      if (!input.success) return invalid(input.error);
      return toolText(
        await api.request("/api/v1/order-actions", {
          method: "POST",
          body: JSON.stringify({ ...input.data, action: tool.action }),
        }),
      );
    }
  }
}

runIfMain(import.meta.url, async () => {
  const env = agentConfigInput.safeParse(process.env);
  if (!env.success) throw new Error(z.prettifyError(env.error));
  const api = createApiClient({
    supabaseUrl: env.data.SUPABASE_URL,
    publishableKey: env.data.SUPABASE_PUBLISHABLE_KEY,
    appUrl: env.data.APP_URL,
    email: env.data.SEED_AGENT_EMAIL,
    password: env.data.SEED_PASSWORD,
  });
  await serveTools("ghost-shift-agent", tools, (name, args) => runAgentTool(name, args, api));
});
