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

  it("trims the search text and treats a blank one as not sent", () => {
    expect(orderListInput.parse({ q: "  MG-1003 " }).q).toBe("MG-1003");
    expect(orderListInput.parse({ q: "   " }).q).toBeUndefined();
    expect(orderListInput.parse({ status: "" }).status).toBeUndefined();
  });

  it("reads a reference that arrives as a number as text", () => {
    expect(orderListInput.parse({ q: 1003 }).q).toBe("1003");
  });

  it("rejects an unknown status, payment method or store id", () => {
    expect(orderListInput.safeParse({ status: "shipped" }).success).toBe(false);
    expect(orderListInput.safeParse({ paymentMethod: "cash" }).success).toBe(false);
    expect(orderListInput.safeParse({ storeId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("orderListInput shipped filter", () => {
  it("accepts true and false, as text or as a boolean from the router", () => {
    expect(orderListInput.parse({ shipped: "true" }).shipped).toBe("true");
    expect(orderListInput.parse({ shipped: "false" }).shipped).toBe("false");
    expect(orderListInput.parse({ shipped: true }).shipped).toBe("true");
  });

  it("treats an empty value as not sent and rejects anything else", () => {
    expect(orderListInput.parse({ shipped: "" }).shipped).toBeUndefined();
    expect(orderListInput.safeParse({ shipped: "yes" }).success).toBe(false);
  });
});

describe("orderListQuery", () => {
  it("reads a page size sent as text in a query string", () => {
    expect(orderListQuery.parse({ limit: "20" })).toEqual({ limit: 20 });
  });

  it("refuses a page size of 0 in a query string", () => {
    expect(orderListQuery.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("accepts the filters as text in a query string", () => {
    expect(
      orderListQuery.parse({
        q: "a@b.se",
        status: "captured",
        paymentMethod: "card",
        storeId: cursor,
      }),
    ).toEqual({
      limit: 50,
      q: "a@b.se",
      status: "captured",
      paymentMethod: "card",
      storeId: cursor,
    });
  });
});
