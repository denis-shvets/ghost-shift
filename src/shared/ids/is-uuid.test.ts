import { describe, expect, it } from "vitest";

import { isUuid } from "./is-uuid";

describe("isUuid", () => {
  it("accepts a uuid in either case", () => {
    expect(isUuid("29fb84e7-03da-44f2-9389-dbbe9e12d3f3")).toBe(true);
    expect(isUuid("29FB84E7-03DA-44F2-9389-DBBE9E12D3F3")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isUuid("ord_1003")).toBe(false);
    expect(isUuid("29fb84e7-03da-44f2-9389-dbbe9e12d3f")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
