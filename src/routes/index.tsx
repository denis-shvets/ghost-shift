import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "~/features/dashboard/ui/dashboard-page";
import { fetchInsights } from "~/features/insights/server/functions";
import { fetchSettlementSummary } from "~/features/settlements/server/functions";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard · Ghost Shift" }] }),
  loader: async () => {
    const [currencies, settlements] = await Promise.all([
      fetchInsights(),
      fetchSettlementSummary(),
    ]);
    return { currencies, settlements };
  },
  component: () => <DashboardPage {...Route.useLoaderData()} />,
});
