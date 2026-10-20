import { describe, expect, it } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import { navigationFor } from "./navigation";

const reader: UserClaims = { sub: "00000000-0000-4000-8000-000000000001", global_roles: [] };
const developer: UserClaims = { ...reader, global_roles: ["platform_developer"] };

function labelsOf(user: UserClaims | null) {
  return navigationFor(user).map((group) => group.label);
}

describe("navigationFor", () => {
  it("shows no navigation when signed out", () => {
    expect(navigationFor(null)).toEqual([]);
  });

  it("hides developer tools from people without the developer role", () => {
    expect(labelsOf(reader)).not.toContain("Developer tools");
  });

  it("shows developer tools to platform developers", () => {
    expect(labelsOf(developer)).toContain("Developer tools");
  });

  it("gives every link a unique path", () => {
    const paths = navigationFor(developer).flatMap((group) => group.items.map((item) => item.to));
    expect(new Set(paths).size).toBe(paths.length);
  });
});
