import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./server-env";

const valid = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:64322/postgres",
  SUPABASE_URL: "http://127.0.0.1:64321",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local",
};

describe("parseServerEnv", () => {
  it("accepts a Postgres URL and the Supabase settings", () => {
    expect(parseServerEnv(valid)).toEqual(valid);
  });

  it("explains a missing DATABASE_URL", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: undefined })).toThrow(
      "DATABASE_URL is required",
    );
  });

  it("rejects a URL that isn't Postgres", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: "https://example.com" })).toThrow(
      "must be a postgres:// or postgresql:// URL",
    );
  });

  it("explains a missing publishable key", () => {
    expect(() => parseServerEnv({ ...valid, SUPABASE_PUBLISHABLE_KEY: undefined })).toThrow(
      "SUPABASE_PUBLISHABLE_KEY is required",
    );
  });
});
