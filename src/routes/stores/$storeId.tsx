import { createFileRoute, getRouteApi, notFound } from "@tanstack/react-router";

import { storeIdInput } from "~/features/stores/model/store-settings-input";
import { fetchStoreSettings } from "~/features/stores/server/functions";
import { StoreSettingsPage } from "~/features/stores/ui/store-settings-page";
import { isPlatformDeveloper } from "~/shared/auth/user-claims";

const rootRoute = getRouteApi("__root__");

export const Route = createFileRoute("/stores/$storeId")({
  head: () => ({ meta: [{ title: "Store settings · Ghost Shift" }] }),
  loader: async ({ params }) => {
    // A malformed id can't match a store, so it gets the not-found page, not an error.
    const id = storeIdInput.safeParse(params.storeId);
    if (!id.success) throw notFound();
    const store = await fetchStoreSettings({ data: id.data });
    if (!store) throw notFound();
    return { store };
  },
  component: StoreSettingsRoute,
  notFoundComponent: () => <p>Store not found.</p>,
});

function StoreSettingsRoute() {
  const { store } = Route.useLoaderData();
  // The root route already loaded the signed-in user. Only used for showing the prefill button.
  const user = rootRoute.useLoaderData();
  return <StoreSettingsPage store={store} isPlatformDeveloper={isPlatformDeveloper(user)} />;
}
