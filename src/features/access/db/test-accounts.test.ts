import { describe, expect, it } from "vitest";

import { assertLocalDatabase } from "./test-accounts";

describe("assertLocalDatabase", () => {
  it("accepts a Postgres URL on this machine", () => {
    expect(() =>
      assertLocalDatabase("postgresql://postgres:postgres@127.0.0.1:64322/postgres"),
    ).not.toThrow();
    expect(() =>
      assertLocalDatabase("postgres://postgres:postgres@localhost:64322/postgres"),
    ).not.toThrow();
  });

  it("refuses a hosted Supabase database", () => {
    expect(() =>
      assertLocalDatabase("postgresql://postgres:secret@db.abcdefgh.supabase.co:5432/postgres"),
    ).toThrow("Tests may only write to a local database");
  });

  it("refuses a hostname that only starts with a local address", () => {
    expect(() =>
      assertLocalDatabase("postgresql://postgres:postgres@127.0.0.1.example.com:5432/postgres"),
    ).toThrow("Tests may only write to a local database");
  });

  it("refuses a URL that isn't Postgres", () => {
    expect(() => assertLocalDatabase("https://localhost:64321")).toThrow(
      "Tests may only write to a local database",
    );
  });
});
