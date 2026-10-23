import { createFileRoute } from "@tanstack/react-router";

import { listDisputesInput } from "~/features/disputes/model/list-disputes-input";
import { fetchDisputesFn } from "~/features/disputes/server/functions";
import { DisputesListPage } from "~/features/disputes/ui/disputes-list-page";

export const Route = createFileRoute("/disputes")({
  head: () => ({ meta: [{ title: "Disputes · Ghost Shift" }] }),
  validateSearch: listDisputesInput.omit({ limit: true }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchDisputesFn({ data: deps }),
  component: Disputes,
});

function Disputes() {
  const { status, storeId } = Route.useSearch();
  return <DisputesListPage {...Route.useLoaderData()} filters={{ status, storeId }} />;
}
