import { describe, expect, it, vi } from "vitest";

import { fetchInsights } from "~/features/insights/server/functions";

import { Route } from "./index";

vi.mock("~/features/insights/server/functions", () => ({
  fetchInsights: vi.fn(),
}));

describe("home route loader", () => {
  it("passes the insights totals to the dashboard unchanged", async () => {
    const currencies = [{ currency: "GBP" }];
    vi.mocked(fetchInsights).mockResolvedValue(currencies as never);

    const loader = Route.options.loader as () => Promise<unknown>;
    expect(await loader()).toEqual({ currencies });
  });
});
