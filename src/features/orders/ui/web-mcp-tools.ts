import { z } from "zod";

import { type CreateOrderInput, createOrderInput } from "../model/create-order-input";
import {
  ORDER_ACTION_TOOLS,
  type OrderActionInput,
  orderActionInput,
} from "../model/order-action-input";

// WebMCP is experimental (Chrome origin trial). Shape checked against
// https://developer.chrome.google.cn/docs/ai/webmcp/imperative-api (May 2026):
// document.modelContext.registerTool(tool, { signal }), unregistered by aborting the signal.
type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (input: unknown) => Promise<ToolResult>;
};
type ModelContext = {
  registerTool: (tool: ToolDefinition, options: { signal: AbortSignal }) => unknown;
};

export type WebMcpDeps = {
  listStores: () => Promise<unknown>;
  createOrder: (data: CreateOrderInput) => Promise<{ id: string; reference: string }>;
};

function result(value: unknown, isError = false): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], isError };
}

// Server functions throw a Response for 401/403; anything else is an Error.
function errorMessage(error: unknown) {
  if (error instanceof Response) return `HTTP ${error.status}`;
  return error instanceof Error ? error.message : "Unknown error";
}

async function run(action: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return result(await action());
  } catch (error) {
    return result({ error: errorMessage(error) }, true);
  }
}

// Finds the browser's model context and hands `define` a register function. Returns an
// unregister function. Without the browser API it does nothing.
function registerTools(define: (register: (tool: ToolDefinition) => void) => void): () => void {
  const scope = globalThis as {
    document?: { modelContext?: ModelContext };
    navigator?: { modelContext?: ModelContext };
  };
  const modelContext = scope.document?.modelContext ?? scope.navigator?.modelContext;
  if (!modelContext) return () => {};

  const controller = new AbortController();
  const options = { signal: controller.signal };
  define((tool) => {
    // registerTool returns a promise in the current API; log a failure instead of leaving it unhandled.
    // An abort from our own cleanup (React re-runs effects in development) is expected, so skip it.
    Promise.resolve(modelContext.registerTool(tool, options)).catch((error: unknown) => {
      if (!controller.signal.aborted)
        console.error(`WebMCP tool ${tool.name} failed to register`, error);
    });
  });

  return () => controller.abort();
}

// The create-order page's tools.
export function registerWebMcpTools(deps: WebMcpDeps): () => void {
  return registerTools((register) => {
    register({
      name: "list_stores",
      description: "List the stores the signed-in platform developer can create orders in.",
      inputSchema: { type: "object", properties: {} },
      execute: () => run(deps.listStores),
    });

    register({
      name: "create_order",
      description:
        "Create a test order in a store. The server checks the role and the store. Always send both billingAddress and shippingAddress; when they are the same, send the same object twice.",
      inputSchema: z.toJSONSchema(createOrderInput),
      execute: async (input) => {
        const parsed = createOrderInput.safeParse(input);
        if (!parsed.success) return result(parsed.error.issues, true);
        return run(() => deps.createOrder(parsed.data));
      },
    });
  });
}

// The order page's tools: capture_order, refund_order and cancel_order. The database checks the permission.
export function registerOrderActionTools(
  applyOrderAction: (data: OrderActionInput) => Promise<unknown>,
): () => void {
  return registerTools((register) => {
    for (const tool of ORDER_ACTION_TOOLS) {
      register({
        name: tool.name,
        description: tool.description,
        inputSchema: z.toJSONSchema(tool.input),
        execute: async (input) => {
          // Checked against the whole union with the tool's action added, so the result needs no cast.
          const parsed = orderActionInput.safeParse({ ...(input as object), action: tool.action });
          if (!parsed.success) return result(parsed.error.issues, true);
          return run(() => applyOrderAction(parsed.data));
        },
      });
    }
  });
}
