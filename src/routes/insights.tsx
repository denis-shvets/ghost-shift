import { createFileRoute } from "@tanstack/react-router";

import { fetchInsights } from "~/features/insights/server/functions";
import { InsightsPage } from "~/features/insights/ui/insights-page";
import { fetchSettlementSummary } from "~/features/settlements/server/functions";
import { SettlementSummaryBlock } from "~/features/settlements/ui/settlement-summary";

export const Route = createFileRoute("/insights")({
  head: () => ({ meta: [{ title: "Insights · Ghost Shift" }] }),
  loader: async () => {
    const [currencies, settlements] = await Promise.all([
      fetchInsights(),
      fetchSettlementSummary(),
    ]);
    return { currencies, settlements };
  },
  component: () => {
    const { currencies, settlements } = Route.useLoaderData();
    return (
      <>
        <InsightsPage currencies={currencies} />
        <SettlementSummaryBlock overview={settlements} />
      </>
    );
  },
});
