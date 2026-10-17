import type { ReactNode } from "react";

import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

import { merchant } from "~/mocks/data";

const navigation = [
  { to: "/", label: "Dashboard" },
  { to: "/orders", label: "Orders" },
  { to: "/refunds", label: "Refunds" },
  { to: "/disputes", label: "Disputes" },
  { to: "/settlements", label: "Settlements" },
  { to: "/payment-links", label: "Payment links" },
  { to: "/insights", label: "Insights" },
  { to: "/stores", label: "Stores" },
  { to: "/team", label: "Team and agents" },
  { to: "/audit-log", label: "Audit log" },
  { to: "/developers", label: "Developers" },
  { to: "/emails", label: "Emails sent" },
] as const;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ghost Shift" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => <p>Page not found.</p>,
});

function RootComponent() {
  return (
    <RootDocument>
      <header>
        <strong>Ghost Shift</strong> · {merchant.name} on {merchant.provider}
      </header>
      <nav aria-label="Main">
        <ul>
          {navigation.map((item) => (
            <li key={item.to}>
              <Link to={item.to} activeOptions={{ exact: item.to === "/" }}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main>
        <Outlet />
      </main>
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
