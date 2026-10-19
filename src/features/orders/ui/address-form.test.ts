import { describe, expect, it } from "vitest";

import { addressFromForm } from "./address-form";

describe("addressFromForm", () => {
  it("reads a full billing address", () => {
    const form = new FormData();
    form.set("billingFirstName", "Test");
    form.set("billingLastName", "Customer");
    form.set("billingCompany", "Ghost Shift AB");
    form.set("billingStreetAddress", "Storgatan 1");
    form.set("billingStreetAddress2", "Lägenhet 2");
    form.set("billingPostalCode", "111 22");
    form.set("billingCity", "Stockholm");
    form.set("billingRegion", "Stockholms län");
    form.set("billingCountry", "SE");
    form.set("billingPhone", "+46 70 000 00 00");

    expect(addressFromForm(form, "billing")).toEqual({
      firstName: "Test",
      lastName: "Customer",
      company: "Ghost Shift AB",
      streetAddress: "Storgatan 1",
      streetAddress2: "Lägenhet 2",
      postalCode: "111 22",
      city: "Stockholm",
      region: "Stockholms län",
      country: "SE",
      phone: "+46 70 000 00 00",
    });
  });

  it("turns empty optional fields into undefined", () => {
    const form = new FormData();
    form.set("shippingFirstName", "Test");
    form.set("shippingLastName", "Customer");
    form.set("shippingCompany", "");
    form.set("shippingStreetAddress", "Storgatan 1");
    form.set("shippingStreetAddress2", "");
    form.set("shippingPostalCode", "111 22");
    form.set("shippingCity", "Stockholm");
    form.set("shippingRegion", "");
    form.set("shippingCountry", "SE");
    form.set("shippingPhone", "");

    const address = addressFromForm(form, "shipping");

    expect(address).toEqual({
      firstName: "Test",
      lastName: "Customer",
      company: undefined,
      streetAddress: "Storgatan 1",
      streetAddress2: undefined,
      postalCode: "111 22",
      city: "Stockholm",
      region: undefined,
      country: "SE",
      phone: undefined,
    });
    expect(Object.values(address)).not.toContain("");
  });

  it("reads only the fields with the requested prefix", () => {
    const form = new FormData();
    form.set("billingFirstName", "Billing");
    form.set("billingLastName", "Person");
    form.set("billingStreetAddress", "Billing street 1");
    form.set("billingPostalCode", "111 11");
    form.set("billingCity", "Stockholm");
    form.set("billingCountry", "SE");
    form.set("shippingFirstName", "Shipping");
    form.set("shippingLastName", "Person");
    form.set("shippingStreetAddress", "Shipping street 9");
    form.set("shippingPostalCode", "222 22");
    form.set("shippingCity", "Oslo");
    form.set("shippingCountry", "NO");
    form.set("shippingCompany", "Depot AS");

    const shipping = addressFromForm(form, "shipping");

    expect(shipping.firstName).toBe("Shipping");
    expect(shipping.streetAddress).toBe("Shipping street 9");
    expect(shipping.country).toBe("NO");
    expect(shipping.company).toBe("Depot AS");
    expect(shipping.city).toBe("Oslo");
  });
});
