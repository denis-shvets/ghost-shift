import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./server-env";

describe("parseServerEnv", () => {
  it("accepts a Postgres URL", () => {
    const env = parseServerEnv({
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:64322/postgres",
    });

    expect(env.DATABASE_URL).toBe("postgresql://postgres:postgres@127.0.0.1:64322/postgres");
  });

  it("explains a missing DATABASE_URL", () => {
    expect(() => parseServerEnv({})).toThrow("DATABASE_URL is required");
  });

  it("rejects a URL that isn't Postgres", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "https://example.com" })).toThrow(
      "must be a postgres:// or postgresql:// URL",
    );
  });
});
