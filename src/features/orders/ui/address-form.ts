import type { AddressInput } from "../model/create-order-input";

// Reads one address from the form. Empty optional fields become undefined, so the schema sees them as missing.
export function addressFromForm(form: FormData, prefix: "billing" | "shipping"): AddressInput {
  const read = (name: string) => String(form.get(`${prefix}${name}`) ?? "");
  const optional = (name: string) => read(name) || undefined;
  return {
    firstName: read("FirstName"),
    lastName: read("LastName"),
    company: optional("Company"),
    streetAddress: read("StreetAddress"),
    streetAddress2: optional("StreetAddress2"),
    postalCode: read("PostalCode"),
    city: read("City"),
    region: optional("Region"),
    country: read("Country"),
    phone: optional("Phone"),
  };
}
