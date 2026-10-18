import { describe, expect, it } from "vitest";

import { loginInput } from "./login-input";

describe("loginInput", () => {
  it("accepts an email and a password", () => {
    expect(loginInput.parse({ email: "operator@ghostshift.test", password: "x" })).toEqual({
      email: "operator@ghostshift.test",
      password: "x",
    });
  });

  it("rejects something that isn't an email", () => {
    const result = loginInput.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginInput.safeParse({ email: "operator@ghostshift.test", password: "" });
    expect(result.success).toBe(false);
  });
});
