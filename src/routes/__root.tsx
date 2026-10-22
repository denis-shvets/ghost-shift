import type { ReactNode } from "react";

import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

import { fetchCurrentUser } from "~/features/layout/server/functions";
import { AppLayout } from "~/features/layout/ui/app-layout";
import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ghost Shift" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  // Sign-in and sign-out reload the page, so the user rarely changes between navigations.
  staleTime: 60_000,
  loader: () => fetchCurrentUser(),
  component: RootComponent,
  notFoundComponent: () => <p>Page not found.</p>,
});

function RootComponent() {
  const user = Route.useLoaderData();
  return (
    <RootDocument>
      <AppLayout user={user}>
        <Outlet />
      </AppLayout>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
