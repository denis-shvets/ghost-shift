import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SettlementSummary } from "~/features/settlements/server/settlements-repository";

import { SettlementSummaryBlock } from "./settlement-summary";

function summary(overrides: Partial<SettlementSummary>): SettlementSummary {
  return {
    currency: "GBP",
    available: 0,
    settledNet: 0,
    pendingCount: 0,
    pendingNet: 0,
    nextPeriodEnd: new Date("2026-11-01T00:00:00Z"),
    ...overrides,
  };
}

describe("SettlementSummaryBlock", () => {
  it("shows setup steps and no tiles until a store has a schedule", () => {
    const html = renderToStaticMarkup(
      <SettlementSummaryBlock overview={{ currencies: [], scheduleCount: 0, canManage: true }} />,
    );
    expect(html).toContain("Set up settlements");
    expect(html).toContain('href="/settlements"');
    expect(html).not.toContain("Balance to pay out");
  });

  it("shows nothing about setup to someone who can't manage settlements", () => {
    const html = renderToStaticMarkup(
      <SettlementSummaryBlock overview={{ currencies: [], scheduleCount: 0, canManage: false }} />,
    );
    expect(html).toBe("");
  });

  it("marks a negative balance as debt and the payouts waiting", () => {
    const html = renderToStaticMarkup(
      <SettlementSummaryBlock
        overview={{
          scheduleCount: 1,
          canManage: true,
          currencies: [summary({ available: -500, pendingCount: 2, pendingNet: 100000 })],
        }}
      />,
    );
    expect(html).toContain("In debt: refunds exceed captures");
    expect(html).toContain("Waiting for payout");
    expect(html).toContain("2 payouts");
  });

  it("keeps each currency in its own block", () => {
    const html = renderToStaticMarkup(
      <SettlementSummaryBlock
        overview={{
          scheduleCount: 2,
          canManage: true,
          currencies: [summary({ currency: "GBP" }), summary({ currency: "SEK" })],
        }}
      />,
    );
    expect(html).toContain(">GBP<");
    expect(html).toContain(">SEK<");
    expect(html).not.toContain("Set up settlements");
  });
});
