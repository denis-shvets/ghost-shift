// Local MCP server (stdio) for creating test orders through the developer API (ADR 0007).
// Claude Code starts it from .mcp.json. It signs in as the seeded developer account, then calls
// /api/developer/* with a bearer token. Run `pnpm dev` first, then the server is ready to use.
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { createOrderInput } from "../src/features/orders/model/create-order-input.ts";
import { SAMPLE_PRODUCTS } from "../src/features/orders/model/sample-products.ts";

// The server must only talk to this machine: it signs in with a real (local) password.
export function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    return isHttp && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export const productsInput = z.object({
  count: z.number().int().min(1).max(20).optional(),
});

// Readable form of Zod issues, e.g. "shopper.email: Invalid email address; lines: Too small".
export function issueText(issues: { path?: PropertyKey[]; message?: string }[]): string {
  return issues
    .map((issue) => `${(issue.path ?? []).map(String).join(".") || "order"}: ${issue.message}`)
    .join("; ");
}

// Turns an API failure into text the agent can read, e.g. "HTTP 400: Invalid input (lines: Too small)".
export function apiErrorText(status: number, body: unknown): string {
  const error = typeof body === "object" && body !== null && "error" in body ? body.error : null;
  const issues =
    typeof body === "object" && body !== null && "issues" in body && Array.isArray(body.issues)
      ? ` (${issueText(body.issues)})`
      : "";
  return `HTTP ${status}: ${typeof error === "string" ? error : "Request failed"}${issues}`;
}

const tools = [
  {
    name: "list_stores",
    description: "List the stores you can create orders in, with their currency.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "list_sample_products",
    description: "List the 20 sample products (no network). Pass count to get only the first N.",
    inputSchema: z.toJSONSchema(productsInput) as { type: "object" },
  },
  {
    name: "create_order",
    description: "Create a test order in a store. The currency comes from the store.",
    inputSchema: z.toJSONSchema(createOrderInput) as { type: "object" },
  },
];

function toolError(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function toolText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

// Signs in once, keeps the token in memory, and signs in again only when the token is refused.
function createApiClient(config: {
  supabaseUrl: string;
  publishableKey: string;
  appUrl: string;
  email: string;
  password: string;
}) {
  const supabase = createClient(config.supabaseUrl, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let token: string | undefined;

  async function signIn(): Promise<string> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: config.email,
      password: config.password,
    });
    if (error || !data.session)
      throw new Error(
        `Sign-in as ${config.email} failed. Check SEED_PASSWORD and SEED_DEVELOPER_EMAIL, and that db:seed-users ran.`,
      );
    token = data.session.access_token;
    return token;
  }

  async function request(path: string, init: RequestInit = {}) {
    const send = (bearer: string) =>
      fetch(new URL(path, config.appUrl), {
        ...init,
        headers: {
          ...init.headers,
          "content-type": "application/json",
          authorization: `Bearer ${bearer}`,
        },
      });

    let response = await send(token ?? (await signIn()));
    if (response.status === 401) response = await send(await signIn());

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(apiErrorText(response.status, body));
    return body;
  }

  return { request };
}

class ApiError extends Error {}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  api: ReturnType<typeof createApiClient>,
) {
  switch (name) {
    case "list_stores":
      return toolText(await api.request("/api/developer/stores"));
    case "list_sample_products": {
      const input = productsInput.safeParse(args);
      if (!input.success) return toolError(input.error.message);
      return toolText(SAMPLE_PRODUCTS.slice(0, input.data.count ?? SAMPLE_PRODUCTS.length));
    }
    case "create_order": {
      const input = createOrderInput.safeParse(args);
      if (!input.success) return toolError(`Invalid order: ${issueText(input.error.issues)}`);
      return toolText(
        await api.request("/api/developer/orders", {
          method: "POST",
          body: JSON.stringify(input.data),
        }),
      );
    }
    default:
      return toolError(`Unknown tool: ${name}`);
  }
}

function readConfig() {
  const config = {
    // || (not ??) so an empty line in .dev.vars falls back to the default.
    supabaseUrl: process.env.SUPABASE_URL || "",
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
    appUrl: process.env.APP_URL || "http://localhost:3000",
    email: process.env.SEED_DEVELOPER_EMAIL || "developer@ghostshift.test",
    password: process.env.SEED_PASSWORD || "",
  };
  if (!config.supabaseUrl)
    throw new Error("SUPABASE_URL is required. Copy .dev.vars.example to .dev.vars.");
  if (!config.publishableKey)
    throw new Error("SUPABASE_PUBLISHABLE_KEY is required (see .dev.vars.example).");
  if (!config.password)
    throw new Error("SEED_PASSWORD is required. Set it in .dev.vars (see .dev.vars.example).");
  // Refuses anything that isn't this machine, the same check scripts/seed-users.ts makes.
  for (const [name, url] of [
    ["SUPABASE_URL", config.supabaseUrl],
    ["APP_URL", config.appUrl],
  ] as const) {
    if (!isLocalUrl(url))
      throw new Error(
        `${name} is "${url}". It must start with http:// and point at 127.0.0.1 or localhost, e.g. http://localhost:3000. This server is for local development only.`,
      );
  }
  return config;
}

async function main() {
  const api = createApiClient(readConfig());

  const server = new Server(
    { name: "ghost-shift-developer", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await runTool(request.params.name, request.params.arguments ?? {}, api);
    } catch (error) {
      // Never crash the server on a failed call; the agent gets the message instead.
      return toolError(error instanceof Error ? error.message : String(error));
    }
  });

  await server.connect(new StdioServerTransport());
}

// Only start when run directly, so tests can import the helpers without a server.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // stdout belongs to the MCP protocol, so errors go to stderr.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
