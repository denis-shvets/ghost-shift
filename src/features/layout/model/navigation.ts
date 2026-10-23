import { type UserClaims, isPlatformDeveloper } from "~/shared/auth/user-claims";

// `mock` marks routes that still read src/mocks/data. Drop it when a page is connected to the database.
const navigationGroups = [
  {
    label: "Work",
    developerOnly: false,
    items: [
      { to: "/", label: "Dashboard", mock: true },
      { to: "/orders", label: "Orders", mock: false },
      { to: "/refunds", label: "Refunds", mock: false },
      { to: "/disputes", label: "Disputes", mock: true },
    ],
  },
  {
    label: "Money",
    developerOnly: false,
    items: [
      { to: "/settlements", label: "Settlements", mock: true },
      { to: "/payment-links", label: "Payment links", mock: true },
      { to: "/insights", label: "Insights", mock: false },
    ],
  },
  {
    label: "Watch",
    developerOnly: false,
    items: [
      { to: "/audit-log", label: "Audit log", mock: false },
      { to: "/emails", label: "Emails sent", mock: true },
    ],
  },
  {
    label: "Setup",
    developerOnly: false,
    items: [
      { to: "/stores", label: "Stores", mock: false },
      { to: "/team", label: "Team and agents", mock: true },
      { to: "/developers", label: "Developers", mock: true },
    ],
  },
  {
    label: "Developer tools",
    developerOnly: true,
    items: [
      { to: "/developer/create-order", label: "Create test order", mock: false },
      { to: "/developer/disputes", label: "Dispute an order", mock: false },
    ],
  },
] as const;

export type NavGroup = (typeof navigationGroups)[number];

// Signed-out visitors get no navigation. Developer tools show only to platform developers.
export function navigationFor(user: UserClaims | null): readonly NavGroup[] {
  if (!user) return [];
  const isDeveloper = isPlatformDeveloper(user);
  return navigationGroups.filter((group) => isDeveloper || !group.developerOnly);
}
