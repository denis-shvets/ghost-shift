import { createFileRoute } from "@tanstack/react-router";

import { fetchInsights } from "~/features/insights/server/functions";
import { InsightsPage } from "~/features/insights/ui/insights-page";

export const Route = createFileRoute("/insights")({
  head: () => ({ meta: [{ title: "Insights · Ghost Shift" }] }),
  loader: async () => ({ currencies: await fetchInsights() }),
  component: () => <InsightsPage {...Route.useLoaderData()} />,
});
