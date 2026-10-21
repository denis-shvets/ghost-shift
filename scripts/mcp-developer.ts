// Local MCP server (stdio) for creating test orders through the orders API (ADR 0007).
// Claude Code starts it from .mcp.json. It signs in as the seeded developer account, then calls
// /api/v1/* with a bearer token. Run `pnpm dev` first, then the server is ready to use.
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { createOrderInput } from "../src/features/orders/model/create-order-input.ts";
import { ORDER_ACTION_TOOLS } from "../src/features/orders/model/order-action-input.ts";
import { SAMPLE_PRODUCTS } from "../src/features/orders/model/sample-products.ts";

// By default the servers only talk to this machine: they sign in with a real (local) password.
export function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    return isHttp && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

// An empty line in .dev.vars counts as unset, so the default applies.
export const unsetIfEmpty = (value: unknown) => (value === "" ? undefined : value);

export const localUrl = (name: string) =>
  z
    .string({ error: `${name} is required. Copy .dev.vars.example to .dev.vars.` })
    .refine(isLocalUrl, {
      error: `${name} must be an http:// or https:// URL on 127.0.0.1 or localhost, e.g. http://localhost:3000. This server is for local development only.`,
    });

export const configInput = z.object({
  SUPABASE_URL: z.preprocess(unsetIfEmpty, localUrl("SUPABASE_URL")),
  SUPABASE_PUBLISHABLE_KEY: z.preprocess(
    unsetIfEmpty,
    z.string({ error: "SUPABASE_PUBLISHABLE_KEY is required (see .dev.vars.example)." }),
  ),
  APP_URL: z.preprocess(unsetIfEmpty, localUrl("APP_URL").default("http://localhost:3000")),
  SEED_DEVELOPER_EMAIL: z.preprocess(
    unsetIfEmpty,
    z
      .email({ error: "SEED_DEVELOPER_EMAIL must be an email address." })
      .default("developer@ghostshift.test"),
  ),
  SEED_PASSWORD: z.preprocess(
    unsetIfEmpty,
    z.string({ error: "SEED_PASSWORD is required. Set it in .dev.vars (see .dev.vars.example)." }),
  ),
});

// Hosted mode (`--hosted`, settings from .hosted.vars) may talk only to the live app and the
// owner's Supabase project, over https. The app host is fixed here; the project host comes from
// .hosted.vars but must look like <project-ref>.supabase.co.
export const LIVE_APP_HOST = "ghost-shift.denis-shvets.workers.dev";
const SUPABASE_PROJECT_HOST = /^[a-z0-9]{20}\.supabase\.co$/;

function httpsHost(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const plain = parsed.protocol === "https:" && !parsed.port && !parsed.username;
    return plain && !parsed.password ? parsed.hostname : undefined;
  } catch {
    return undefined;
  }
}

export const isLiveAppUrl = (url: string) => httpsHost(url) === LIVE_APP_HOST;
export const isSupabaseProjectUrl = (url: string) =>
  SUPABASE_PROJECT_HOST.test(httpsHost(url) ?? "");

export const hostedConfigInput = z.object({
  SUPABASE_URL: z.preprocess(
    unsetIfEmpty,
    z
      .string({ error: "SUPABASE_URL is required. Copy .hosted.vars.example to .hosted.vars." })
      .refine(isSupabaseProjectUrl, {
        error:
          "SUPABASE_URL must be your Supabase project URL, https://<project-ref>.supabase.co, with no port.",
      }),
  ),
  SUPABASE_PUBLISHABLE_KEY: z.preprocess(
    unsetIfEmpty,
    z.string({ error: "SUPABASE_PUBLISHABLE_KEY is required (see .hosted.vars.example)." }),
  ),
  APP_URL: z.preprocess(
    unsetIfEmpty,
    z
      .string()
      .default(`https://${LIVE_APP_HOST}`)
      .refine(isLiveAppUrl, { error: `APP_URL must be https://${LIVE_APP_HOST}.` }),
  ),
});

// Parses settings (environment or command-line options), with every problem in the error.
export function parseConfig<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(z.prettifyError(parsed.error));
  return parsed.data;
}

// The part of a parsed config that says where the API client connects.
export const apiTarget = (env: {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  APP_URL: string;
}) => ({
  supabaseUrl: env.SUPABASE_URL,
  publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
  appUrl: env.APP_URL,
});

// Hosted mode is chosen on the command line (the *:hosted pnpm scripts), never by a setting.
export const isHosted = () => process.argv.includes("--hosted");

export const productsInput = z.object({
  count: z.number().int().min(1).max(20).optional(),
});

// Readable form of Zod issues, e.g. "customer.email: Invalid email address; lines: Too small".
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
    description: "List the stores you can see, with their currency.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "list_sample_products",
    description: "List the 20 sample products (no network). Pass count to get only the first N.",
    inputSchema: z.toJSONSchema(productsInput) as { type: "object" },
  },
  {
    name: "create_order",
    description:
      "Create a test order in a store. The currency comes from the store. Always send both billingAddress and shippingAddress; when they are the same, send the same object twice.",
    inputSchema: z.toJSONSchema(createOrderInput) as { type: "object" },
  },
  ...ORDER_ACTION_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.input) as { type: "object" },
  })),
];

export function toolError(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

export function invalid(error: z.ZodError) {
  return toolError(`Invalid input: ${issueText(error.issues)}`);
}

export function toolText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

// Signs in once, keeps the token in memory, and signs in again only when the token is refused.
export function createApiClient(config: {
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
        `Sign-in as ${config.email} failed. Check the email and password in .dev.vars (or .hosted.vars), and that the account exists.`,
      );
    token = data.session.access_token;
    return token;
  }

  async function request(path: string, init: RequestInit = {}) {
    const send = (bearer: string) => {
      // new Headers() keeps headers given as a Headers object or pairs; spreading would drop them.
      const headers = new Headers(init.headers);
      headers.set("content-type", "application/json");
      headers.set("authorization", `Bearer ${bearer}`);
      return fetch(new URL(path, config.appUrl), { ...init, headers });
    };

    let response = await send(token ?? (await signIn()));
    if (response.status === 401) response = await send(await signIn());

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(apiErrorText(response.status, body));
    // Every orders API answer is JSON, so anything else is the wrong server, not a success.
    if (body === null)
      throw new ApiError(
        `HTTP ${response.status}: the response was not JSON. Is APP_URL the Ghost Shift app?`,
      );
    return body;
  }

  return { request };
}

class ApiError extends Error {}

export type ApiClient = Pick<ReturnType<typeof createApiClient>, "request">;

export async function runTool(name: string, args: Record<string, unknown>, api: ApiClient) {
  switch (name) {
    case "list_stores":
      return toolText(await api.request("/api/v1/stores"));
    case "list_sample_products": {
      const input = productsInput.safeParse(args);
      if (!input.success) return invalid(input.error);
      return toolText(SAMPLE_PRODUCTS.slice(0, input.data.count ?? SAMPLE_PRODUCTS.length));
    }
    // The API validates the order; its 400 issues reach the agent through apiErrorText.
    case "create_order":
      return toolText(
        await api.request("/api/v1/orders", { method: "POST", body: JSON.stringify(args) }),
      );
    default: {
      // capture_order, refund_order, cancel_order. The API validates the input and adds nothing.
      const action = ORDER_ACTION_TOOLS.find((tool) => tool.name === name)?.action;
      if (!action) return toolError(`Unknown tool: ${name}`);
      return toolText(
        await api.request("/api/v1/order-actions", {
          method: "POST",
          body: JSON.stringify({ ...args, action }),
        }),
      );
    }
  }
}

function readConfig() {
  const env = parseConfig(configInput, process.env);
  return {
    ...apiTarget(env),
    email: env.SEED_DEVELOPER_EMAIL,
    password: env.SEED_PASSWORD,
  };
}

// Serves the tools over stdio. Shared with the agent server (scripts/mcp-agent.ts).
export async function serveTools(
  name: string,
  toolList: { name: string }[],
  run: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<ReturnType<typeof toolText | typeof toolError>>,
) {
  const server = new Server({ name, version: "0.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await run(request.params.name, request.params.arguments ?? {});
    } catch (error) {
      // Never crash the server on a failed call; the agent gets the message instead.
      return toolError(error instanceof Error ? error.message : String(error));
    }
  });

  await server.connect(new StdioServerTransport());
}

// Run main() only when the file is started directly, so tests can import the helpers without a server.
export function runIfMain(url: string, main: () => Promise<void>) {
  if (!process.argv[1] || url !== pathToFileURL(process.argv[1]).href) return;
  main().catch((error: unknown) => {
    // stdout belongs to the MCP protocol, so errors go to stderr.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

runIfMain(import.meta.url, async () => {
  const api = createApiClient(readConfig());
  await serveTools("ghost-shift-developer", tools, (name, args) => runTool(name, args, api));
});
