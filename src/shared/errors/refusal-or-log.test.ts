import { afterEach, describe, expect, it, vi } from "vitest";

import { refusalOrLog } from "./refusal-or-log";

class Refusal extends Error {}

afterEach(() => vi.restoreAllMocks());

describe("refusalOrLog", () => {
  it("passes a refusal's message through", () => {
    expect(() => refusalOrLog(Refusal)(new Refusal("Not allowed"))).toThrow(
      new Error("Not allowed"),
    );
  });

  it("hides any other error's message and logs the original", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = new Error("select * from stores where secret = 1");

    expect(() => refusalOrLog(Refusal)(original)).toThrow(new Error("Something went wrong"));
    expect(log).toHaveBeenCalledWith(original);
  });
});
