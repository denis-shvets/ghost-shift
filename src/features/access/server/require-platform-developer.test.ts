import { describe, expect, it } from "vitest";

import type { UserClaims } from "~/shared/auth/user-claims";

import { requirePlatformDeveloper } from "./require-platform-developer";

const sub = "a04509c1-b524-494a-8662-8d6ed7bcfc8d";

function userWith(global_roles: string[]): UserClaims {
  return { sub, global_roles };
}

// Returns the thrown Response, or null when the check passes.
function thrownBy(user: UserClaims): Response | null {
  try {
    requirePlatformDeveloper(user);
    return null;
  } catch (error) {
    return error as Response;
  }
}

describe("requirePlatformDeveloper", () => {
  it("lets a platform developer through, even with other roles", () => {
    expect(thrownBy(userWith(["operator", "platform_developer"]))).toBeNull();
  });

  it("throws a 403 for a user without the role", () => {
    expect(thrownBy(userWith(["operator"]))?.status).toBe(403);
  });

  it("throws a 403 for a user with no global roles", () => {
    expect(thrownBy(userWith([]))?.status).toBe(403);
  });
});
