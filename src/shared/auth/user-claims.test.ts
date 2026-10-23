import { describe, expect, it } from "vitest";

import { isPlatformDeveloper, toUserClaims } from "./user-claims";

const sub = "5f1f7b3e-2a4d-4c1e-9b0a-1d2e3f4a5b6c";

describe("toUserClaims", () => {
  it("keeps the subject, email and global roles", () => {
    expect(
      toUserClaims({
        sub,
        email: "developer@ghostshift.test",
        global_roles: ["platform_developer"],
      }),
    ).toEqual({
      sub,
      email: "developer@ghostshift.test",
      global_roles: ["platform_developer"],
    });
  });

  it("treats a missing roles claim as no global roles", () => {
    expect(toUserClaims({ sub })).toEqual({ sub, global_roles: [] });
  });

  it("returns null when the subject isn't a uuid", () => {
    expect(toUserClaims({ sub: "not-a-user" })).toBeNull();
  });

  it("returns null for anything that isn't an object", () => {
    expect(toUserClaims(null)).toBeNull();
  });
});

describe("isPlatformDeveloper", () => {
  it("is true only for a signed-in platform developer", () => {
    expect(isPlatformDeveloper({ sub, global_roles: ["platform_developer"] })).toBe(true);
    expect(isPlatformDeveloper({ sub, global_roles: ["platform_operator"] })).toBe(false);
    expect(isPlatformDeveloper(null)).toBe(false);
  });
});
