import { describe, expect, it } from "vitest";
import { z } from "zod";

import { optionalParam } from "./optional-param";

const text = optionalParam(z.string());

describe("optionalParam", () => {
  it("treats an empty, spaces-only or missing value as not sent", () => {
    expect(text.parse("")).toBeUndefined();
    expect(text.parse("  ")).toBeUndefined();
    expect(text.parse(null)).toBeUndefined();
    expect(text.parse(undefined)).toBeUndefined();
  });

  it("passes a real value through to the schema", () => {
    expect(text.parse("x")).toBe("x");
  });
});
