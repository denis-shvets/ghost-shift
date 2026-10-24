import { createFileRoute, redirect } from "@tanstack/react-router";

import { fetchPendingPayoutsFn } from "~/features/settlements/server/functions";
import { ApprovePayoutsPage } from "~/features/settlements/ui/approve-payouts-page";

export const Route = createFileRoute("/developer/payouts")({
  head: () => ({ meta: [{ title: "Approve payouts · Ghost Shift" }] }),
  loader: async () => {
    try {
      return { payouts: await fetchPendingPayoutsFn() };
    } catch (error) {
      // Signed-in users without the developer role get a 403 from the server; send them back to the list.
      if (error instanceof Response && error.status === 403) throw redirect({ to: "/orders" });
      throw error;
    }
  },
  component: () => <ApprovePayoutsPage payouts={Route.useLoaderData().payouts} />,
});
