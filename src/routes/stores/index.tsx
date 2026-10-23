import { createFileRoute } from "@tanstack/react-router";

import { fetchStores } from "~/features/stores/server/functions";
import { StoreListPage } from "~/features/stores/ui/store-list-page";

export const Route = createFileRoute("/stores/")({
  head: () => ({ meta: [{ title: "Stores · Ghost Shift" }] }),
  loader: () => fetchStores(),
  component: () => <StoreListPage stores={Route.useLoaderData()} />,
});
