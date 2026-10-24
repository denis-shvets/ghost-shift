import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "~/features/dashboard/ui/dashboard-page";
import { fetchInsights } from "~/features/insights/server/functions";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard · Ghost Shift" }] }),
  loader: async () => ({ currencies: await fetchInsights() }),
  component: () => <DashboardPage {...Route.useLoaderData()} />,
});
