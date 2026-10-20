import { Fragment, type ReactNode } from "react";

import { Link, useLocation } from "@tanstack/react-router";

import { SignOutButton } from "~/features/auth/ui/sign-out-button";
import type { UserClaims } from "~/shared/auth/user-claims";

import { navigationFor } from "../model/navigation";

// Plain HTML on purpose: no design system yet (ADR 0014), so no CSS. Each nav group is one short
// line, and <hr /> separates header, navigation, page and footer. A side-by-side sidebar needs CSS.
export function AppLayout({ user, children }: { user: UserClaims | null; children: ReactNode }) {
  const groups = navigationFor(user);
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <>
      <header>
        <strong>Ghost Shift</strong>
        {user ? (
          <>
            {" "}
            · {user.email ? `Signed in as ${user.email}` : "Signed in"} <SignOutButton />
          </>
        ) : pathname !== "/login" ? (
          <>
            {" "}
            · <Link to="/login">Sign in</Link>
          </>
        ) : null}
      </header>
      {groups.length > 0 && (
        <>
          <hr />
          <nav aria-label="Main">
            {groups.map((group) => (
              <p key={group.label}>
                <strong>{group.label}:</strong>{" "}
                {group.items.map((item, index) => (
                  <Fragment key={item.to}>
                    {index > 0 && " · "}
                    <Link to={item.to} activeOptions={{ exact: item.to === "/" }}>
                      {item.label}
                      {item.mock ? " (sample data)" : ""}
                    </Link>
                  </Fragment>
                ))}
              </p>
            ))}
          </nav>
        </>
      )}
      <hr />
      <main id="content">{children}</main>
      <hr />
      <footer>
        <p>Ghost Shift is a demo. Merchants, stores and data are invented.</p>
      </footer>
    </>
  );
}
