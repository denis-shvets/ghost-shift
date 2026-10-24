import { createFileRoute } from "@tanstack/react-router";

import { fetchSettlementsPage } from "~/features/settlements/server/functions";
import { SettlementsPage } from "~/features/settlements/ui/settlements-page";

export const Route = createFileRoute("/settlements")({
  head: () => ({ meta: [{ title: "Settlements · Ghost Shift" }] }),
  // The server function sends signed-out visitors to /login.
  loader: () => fetchSettlementsPage(),
  component: () => <SettlementsPage page={Route.useLoaderData()} />,
});
