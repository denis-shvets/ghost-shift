import { createFileRoute } from "@tanstack/react-router";

import { activityListInput } from "~/features/activity/model/activity-list-input";
import { fetchActivity } from "~/features/activity/server/functions";
import { ActivityPage } from "~/features/activity/ui/activity-page";

export const Route = createFileRoute("/audit-log")({
  head: () => ({ meta: [{ title: "Audit log · Ghost Shift" }] }),
  validateSearch: activityListInput.pick({
    cursor: true,
    direction: true,
    action: true,
    storeId: true,
  }),
  loaderDeps: ({ search }) => ({
    cursor: search.cursor,
    direction: search.direction,
    action: search.action,
    storeId: search.storeId,
  }),
  loader: ({ deps }) => fetchActivity({ data: deps }),
  component: () => <ActivityPage {...Route.useLoaderData()} />,
});
