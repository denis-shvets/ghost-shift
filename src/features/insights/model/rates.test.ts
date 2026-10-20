import { describe, expect, it } from "vitest";

import { computeRates } from "./rates";

const empty = {
  orderCount: 0,
  settledOrderCount: 0,
  totalAmount: 0,
  capturedAmount: 0,
  refundedAmount: 0,
  capturedOrderCount: 0,
  expiredOrderCount: 0,
};

describe("computeRates", () => {
  it("returns no rates when there are no orders", () => {
    expect(computeRates(empty)).toEqual({
      averageOrderValue: null,
      captureRate: null,
      refundRate: null,
      expiryRate: null,
    });
  });

  it("gives a zero capture rate and a full expiry rate when every order expired", () => {
    expect(
      computeRates({
        ...empty,
        orderCount: 4,
        settledOrderCount: 4,
        totalAmount: 40000,
        expiredOrderCount: 4,
      }),
    ).toEqual({
      averageOrderValue: 10000,
      captureRate: 0,
      refundRate: null,
      expiryRate: 1,
    });
  });

  it("computes each rate from the counts and money", () => {
    expect(
      computeRates({
        orderCount: 4,
        settledOrderCount: 4,
        totalAmount: 100000,
        capturedAmount: 60000,
        refundedAmount: 15000,
        capturedOrderCount: 2,
        expiredOrderCount: 1,
      }),
    ).toEqual({
      averageOrderValue: 25000,
      captureRate: 0.5,
      refundRate: 0.25,
      expiryRate: 0.25,
    });
  });

  it("leaves open authorizations out of the capture and expiry rates", () => {
    expect(
      computeRates({
        ...empty,
        orderCount: 10,
        settledOrderCount: 4,
        totalAmount: 100000,
        capturedOrderCount: 3,
        expiredOrderCount: 1,
      }),
    ).toMatchObject({ captureRate: 0.75, expiryRate: 0.25 });
  });

  it("returns no capture or expiry rate while every order is still open", () => {
    expect(computeRates({ ...empty, orderCount: 3, totalAmount: 3000 })).toMatchObject({
      averageOrderValue: 1000,
      captureRate: null,
      expiryRate: null,
    });
  });
});
