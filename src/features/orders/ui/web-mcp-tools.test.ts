import { afterEach, describe, expect, it, vi } from "vitest";

import { registerWebMcpTools } from "./web-mcp-tools";

type Registered = {
  name: string;
  execute: (input: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;
  options: { signal: AbortSignal };
};

const validOrder = {
  storeId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  shopper: { name: "Ada", email: "ada@example.com", country: "SE" },
  paymentMethod: "card",
  shippingCarrier: "PostNord",
  lines: [
    { type: "physical", sku: "SKU-1", name: "Mug", quantity: 2, unitPrice: 1500, taxRate: 2500 },
  ],
};

function fakeModelContext() {
  const tools: Registered[] = [];
  const modelContext = {
    registerTool: vi.fn((tool: Registered, options: { signal: AbortSignal }) => {
      tools.push({ ...tool, options });
    }),
  };
  return { modelContext, tools };
}

function deps() {
  return {
    listStores: vi.fn(async () => [{ id: "store-1", name: "Shop" }]),
    createOrder: vi.fn(async () => ({ id: "order-1", reference: "DEV-ABC12345" })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerWebMcpTools", () => {
  it("registers list_stores and create_order on document.modelContext", () => {
    const { modelContext, tools } = fakeModelContext();
    vi.stubGlobal("document", { modelContext });

    registerWebMcpTools(deps());

    expect(tools.map((tool) => tool.name)).toEqual(["list_stores", "create_order"]);
  });

  it("aborts the shared signal when unregistered", () => {
    const { modelContext, tools } = fakeModelContext();
    vi.stubGlobal("document", { modelContext });

    const unregister = registerWebMcpTools(deps());
    expect(tools.every((tool) => !tool.options.signal.aborted)).toBe(true);

    unregister();
    expect(tools.every((tool) => tool.options.signal.aborted)).toBe(true);
  });

  it("does nothing when the browser has no modelContext", () => {
    vi.stubGlobal("document", {});
    vi.stubGlobal("navigator", {});

    const unregister = registerWebMcpTools(deps());

    expect(() => unregister()).not.toThrow();
  });

  it("returns an error result instead of creating an order from invalid input", async () => {
    const { modelContext, tools } = fakeModelContext();
    vi.stubGlobal("document", { modelContext });
    const { createOrder } = deps();
    registerWebMcpTools({ listStores: vi.fn(), createOrder });

    const createTool = tools.find((tool) => tool.name === "create_order");
    const result = await createTool!.execute({ storeId: "not-a-uuid" });

    expect(result.isError).toBe(true);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("creates the order and returns its id and reference", async () => {
    const { modelContext, tools } = fakeModelContext();
    vi.stubGlobal("document", { modelContext });
    const { createOrder } = deps();
    registerWebMcpTools({ listStores: vi.fn(), createOrder });

    const createTool = tools.find((tool) => tool.name === "create_order");
    const result = await createTool!.execute(validOrder);

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({
      id: "order-1",
      reference: "DEV-ABC12345",
    });
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: validOrder.storeId }),
    );
  });
});
