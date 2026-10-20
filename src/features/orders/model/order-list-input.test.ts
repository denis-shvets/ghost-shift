import { describe, expect, it } from "vitest";

import { orderListInput, orderListQuery } from "./order-list-input";

const cursor = "a04509c1-b524-494a-8662-8d6ed7bcfc8d";

describe("orderListInput", () => {
  it("uses 50 as the default page size", () => {
    expect(orderListInput.parse({})).toEqual({ limit: 50 });
  });

  it("accepts an order id as the cursor, with a direction", () => {
    expect(orderListInput.parse({ cursor, direction: "prev" })).toEqual({
      limit: 50,
      cursor,
      direction: "prev",
    });
  });

  it("rejects a page size outside 1 to 100", () => {
    expect(orderListInput.safeParse({ limit: 0 }).success).toBe(false);
    expect(orderListInput.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("rejects a cursor that isn't an order id, or an unknown direction", () => {
    expect(orderListInput.safeParse({ cursor: "MG-1003" }).success).toBe(false);
    expect(orderListInput.safeParse({ cursor, direction: "sideways" }).success).toBe(false);
  });
});

describe("orderListQuery", () => {
  it("reads a page size sent as text in a query string", () => {
    expect(orderListQuery.parse({ limit: "20" })).toEqual({ limit: 20 });
  });

  it("refuses a page size of 0 in a query string", () => {
    expect(orderListQuery.safeParse({ limit: "0" }).success).toBe(false);
  });
});
