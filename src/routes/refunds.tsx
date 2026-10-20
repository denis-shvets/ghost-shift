import { createFileRoute } from "@tanstack/react-router";

import { activityListInput } from "~/features/activity/model/activity-list-input";
import { fetchRefunds } from "~/features/activity/server/functions";
import { RefundsPage } from "~/features/activity/ui/refunds-page";

export const Route = createFileRoute("/refunds")({
  validateSearch: activityListInput.pick({
    cursor: true,
    direction: true,
    storeId: true,
  }),
  loaderDeps: ({ search }) => ({
    cursor: search.cursor,
    direction: search.direction,
    storeId: search.storeId,
  }),
  loader: ({ deps }) => fetchRefunds({ data: deps }),
  component: Refunds,
});

function Refunds() {
  const { storeId } = Route.useSearch();
  return <RefundsPage {...Route.useLoaderData()} storeId={storeId} />;
}
