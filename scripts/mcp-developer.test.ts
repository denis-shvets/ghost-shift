import { execFileSync } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import { createOrderInput } from "../src/features/orders/model/create-order-input.ts";

import {
  apiErrorText,
  configInput,
  hostedConfigInput,
  isLiveAppUrl,
  isLocalUrl,
  isSupabaseProjectUrl,
  productsInput,
  runTool,
} from "./mcp-developer.ts";

const validOrder = {
  storeId: "00000000-0000-4000-8000-000000000001",
  customer: { firstName: "Test", lastName: "Customer", email: "customer@example.com" },
  billingAddress: {
    firstName: "Test",
    lastName: "Customer",
    streetAddress: "Storgatan 1",
    postalCode: "111 22",
    city: "Stockholm",
    country: "DE",
  },
  shippingAddress: {
    firstName: "Test",
    lastName: "Customer",
    streetAddress: "Storgatan 1",
    postalCode: "111 22",
    city: "Stockholm",
    country: "DE",
  },
  paymentMethod: "card",
  shippingCarrier: "Test Carrier",
  lines: [{ type: "physical", name: "Widget", quantity: 2, unitPrice: 1000, taxRate: 1900 }],
};

describe("starting in plain Node", () => {
  // pnpm mcp:developer runs without Vite, so every file they import needs its .ts extension.
  it("loads the MCP server the way pnpm starts it", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "await import('./scripts/mcp-developer.ts'); console.log('ok')",
      ],
      { encoding: "utf8" },
    );
    expect(output.trim()).toBe("ok");
  });
});

describe("isLocalUrl", () => {
  it("accepts this machine", () => {
    expect(isLocalUrl("http://127.0.0.1:64321")).toBe(true);
    expect(isLocalUrl("http://localhost:3000")).toBe(true);
  });

  it("rejects any other host", () => {
    expect(isLocalUrl("https://example.com")).toBe(false);
    expect(isLocalUrl("https://abc.supabase.co")).toBe(false);
    expect(isLocalUrl("http://localhost.evil.example")).toBe(false);
  });

  it("uses the real host, not a look-alike in the userinfo or hostname", () => {
    expect(isLocalUrl("http://localhost:3000@evil.com")).toBe(false);
    expect(isLocalUrl("http://127.0.0.1@evil.com")).toBe(false);
    expect(isLocalUrl("http://localhost.evil.com")).toBe(false);
  });

  it("accepts localhost and 127.0.0.1 with a port or path", () => {
    expect(isLocalUrl("http://localhost:3000")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1:54321/x")).toBe(true);
  });

  it("rejects text that is not a URL", () => {
    expect(isLocalUrl("not a url")).toBe(false);
  });
});

describe("hosted allowlist", () => {
  const project = "https://abcdefghijklmnopqrst.supabase.co";

  it("accepts the live app and a Supabase project over https", () => {
    expect(isLiveAppUrl("https://ghost-shift.denis-shvets.workers.dev")).toBe(true);
    expect(isLiveAppUrl("https://ghost-shift.denis-shvets.workers.dev/api/v1/orders")).toBe(true);
    expect(isSupabaseProjectUrl(project)).toBe(true);
  });

  it("refuses http and explicit ports", () => {
    expect(isLiveAppUrl("http://ghost-shift.denis-shvets.workers.dev")).toBe(false);
    expect(isLiveAppUrl("https://ghost-shift.denis-shvets.workers.dev:8443")).toBe(false);
    expect(isSupabaseProjectUrl("http://abcdefghijklmnopqrst.supabase.co")).toBe(false);
  });

  it("refuses look-alike hosts", () => {
    expect(isLiveAppUrl("https://ghost-shift.denis-shvets.workers.dev.evil.com")).toBe(false);
    expect(isLiveAppUrl("https://evil-ghost-shift.denis-shvets.workers.dev")).toBe(false);
    expect(isLiveAppUrl("https://ghost-shift.denis-shvets.workers.dev@evil.com")).toBe(false);
    expect(isLiveAppUrl("https://evil.com@ghost-shift.denis-shvets.workers.dev")).toBe(false);
    expect(isSupabaseProjectUrl("https://abcdefghijklmnopqrst.supabase.co.evil.com")).toBe(false);
    expect(isSupabaseProjectUrl("https://evil.abcdefghijklmnopqrst.supabase.co")).toBe(false);
    expect(isSupabaseProjectUrl("https://short.supabase.co")).toBe(false);
    // Each dot must be a dot: these are other registrable domains.
    expect(isSupabaseProjectUrl("https://abcdefghijklmnopqrst-supabase.co")).toBe(false);
    expect(isSupabaseProjectUrl("https://abcdefghijklmnopqrst.supabasexco")).toBe(false);
  });

  it("refuses other hosts, this machine and non-URLs", () => {
    expect(isLiveAppUrl("https://example.com")).toBe(false);
    expect(isLiveAppUrl("https://localhost:3000")).toBe(false);
    expect(isSupabaseProjectUrl("https://example.com")).toBe(false);
    expect(isSupabaseProjectUrl("not a url")).toBe(false);
  });

  it("keeps the app and the project apart", () => {
    expect(isLiveAppUrl(project)).toBe(false);
    expect(isSupabaseProjectUrl("https://ghost-shift.denis-shvets.workers.dev")).toBe(false);
  });

  it("defaults APP_URL to the live app and refuses local URLs", () => {
    const env = { SUPABASE_URL: project, SUPABASE_PUBLISHABLE_KEY: "key" };
    expect(hostedConfigInput.parse(env).APP_URL).toBe(
      "https://ghost-shift.denis-shvets.workers.dev",
    );
    expect(hostedConfigInput.safeParse({ ...env, APP_URL: "http://localhost:3000" }).success).toBe(
      false,
    );
    expect(
      hostedConfigInput.safeParse({ ...env, SUPABASE_URL: "http://127.0.0.1:64321" }).success,
    ).toBe(false);
  });
});

describe("list_sample_products input", () => {
  it("accepts a count from 1 to 20 and no input", () => {
    expect(productsInput.safeParse({}).success).toBe(true);
    expect(productsInput.safeParse({ count: 1 }).success).toBe(true);
    expect(productsInput.safeParse({ count: 20 }).success).toBe(true);
  });

  it("rejects a count above 20", () => {
    expect(productsInput.safeParse({ count: 21 }).success).toBe(false);
  });
});

describe("create_order input", () => {
  it("accepts a valid order", () => {
    expect(createOrderInput.safeParse(validOrder).success).toBe(true);
  });

  it("rejects a positive discount and an empty order", () => {
    const discount = {
      ...validOrder,
      lines: [{ type: "discount", name: "Promo", quantity: 1, unitPrice: 500, taxRate: 0 }],
    };
    expect(createOrderInput.safeParse(discount).success).toBe(false);
    expect(createOrderInput.safeParse({ ...validOrder, lines: [] }).success).toBe(false);
  });
});

describe("apiErrorText", () => {
  it("includes the status and the API message", () => {
    expect(apiErrorText(403, { error: "Forbidden" })).toBe("HTTP 403: Forbidden");
  });

  it("adds the validation issues as path and message", () => {
    expect(
      apiErrorText(400, {
        error: "Invalid input",
        issues: [{ path: ["lines"], message: "Too small" }],
      }),
    ).toBe("HTTP 400: Invalid input (lines: Too small)");
  });
});

describe("configInput", () => {
  const env = {
    SUPABASE_URL: "http://127.0.0.1:64321",
    SUPABASE_PUBLISHABLE_KEY: "key",
    SEED_PASSWORD: "secret",
  };

  it("fills in the defaults, also for empty lines in .dev.vars", () => {
    expect(configInput.parse({ ...env, APP_URL: "", SEED_DEVELOPER_EMAIL: "" })).toMatchObject({
      APP_URL: "http://localhost:3000",
      SEED_DEVELOPER_EMAIL: "developer@ghostshift.test",
    });
  });

  it("rejects a missing password, a remote URL and an invalid email", () => {
    expect(configInput.safeParse({ ...env, SEED_PASSWORD: "" }).success).toBe(false);
    expect(configInput.safeParse({ ...env, APP_URL: "https://example.com" }).success).toBe(false);
    expect(configInput.safeParse({ ...env, SEED_DEVELOPER_EMAIL: "nope" }).success).toBe(false);
  });
});

describe("order action tools", () => {
  it("send the action with the agent's input to the order-actions endpoint", async () => {
    const request = vi.fn(async () => ({ status: "canceled" }));
    const args = { orderId: "743bf9c5-f7a6-47d6-b1cb-bf9811f8b922", reason: "Out of stock" };

    await runTool("cancel_order", args, { request });

    expect(request).toHaveBeenCalledWith("/api/v1/order-actions", {
      method: "POST",
      body: JSON.stringify({ ...args, action: "cancel" }),
    });
  });

  it("still refuses a tool that doesn't exist", async () => {
    const result = await runTool("void_order", {}, { request: vi.fn() });
    expect(result).toMatchObject({ isError: true });
  });
});
