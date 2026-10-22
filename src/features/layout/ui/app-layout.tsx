import type { ReactNode } from "react";

import { Link, useLocation } from "@tanstack/react-router";

import { SignOutButton } from "~/features/auth/ui/sign-out-button";
import type { UserClaims } from "~/shared/auth/user-claims";

import { navigationFor } from "../model/navigation";

// Structure only (ADR 0018). Header, navigation, page and footer all span the full window width. From md up, the navigation is a sidebar beside the page; on phones it stacks above.
export function AppLayout({ user, children }: { user: UserClaims | null; children: ReactNode }) {
  const groups = navigationFor(user);
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200 bg-neutral-50">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <strong className="text-base">Ghost Shift</strong>
          {user ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-neutral-600">
                {user.email ? `Signed in as ${user.email}` : "Signed in"}
              </span>
              <SignOutButton />
            </div>
          ) : pathname !== "/login" ? (
            <Link to="/login" className="text-sm">
              Sign in
            </Link>
          ) : null}
        </div>
      </header>

      <div className="w-full flex-1 px-4 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
        {groups.length > 0 && (
          <nav aria-label="Main" className="border-b border-neutral-200 py-4 md:border-b-0">
            {groups.map((group) => (
              <div key={group.label} className="mb-4 last:mb-0">
                <p className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                  {group.label}
                </p>
                <ul className="m-0 grid list-none gap-1 p-0">
                  {group.items.map((item) => (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        activeOptions={{ exact: item.to === "/" }}
                        className="block rounded px-2 py-1 text-sm no-underline hover:bg-neutral-100"
                        activeProps={{
                          className: "bg-neutral-900 text-white hover:bg-neutral-800",
                        }}
                      >
                        {item.label}
                        {item.mock ? " (sample data)" : ""}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        )}
        <main id="content" className="min-w-0 py-4">
          {children}
        </main>
      </div>

      <footer className="border-t border-neutral-200 bg-neutral-50">
        <p className="px-4 py-3 text-sm text-neutral-500">
          Ghost Shift is a demo. Merchants, stores and data are invented.
        </p>
      </footer>
    </div>
  );
}
