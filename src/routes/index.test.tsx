import { describe, expect, it, vi } from "vitest";

import { fetchInsights } from "~/features/insights/server/functions";
import { fetchSettlementSummary } from "~/features/settlements/server/functions";

import { Route } from "./index";

vi.mock("~/features/insights/server/functions", () => ({
  fetchInsights: vi.fn(),
}));
vi.mock("~/features/settlements/server/functions", () => ({
  fetchSettlementSummary: vi.fn(),
}));

describe("home route loader", () => {
  it("passes the insights totals and settlement summary to the dashboard unchanged", async () => {
    const currencies = [{ currency: "GBP" }];
    const settlements = { currencies: [], scheduleCount: 0 };
    vi.mocked(fetchInsights).mockResolvedValue(currencies as never);
    vi.mocked(fetchSettlementSummary).mockResolvedValue(settlements as never);

    const loader = Route.options.loader as () => Promise<unknown>;
    expect(await loader()).toEqual({ currencies, settlements });
  });
});
