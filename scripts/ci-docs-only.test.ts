import { describe, expect, it } from "vitest";

import { isDocsOnly } from "./ci-docs-only.ts";

describe("isDocsOnly", () => {
  it("is true when every file is under docs/ or Markdown", () => {
    expect(isDocsOnly(["docs/adr/0011-ci.md", "README.md", "docs/guides/diagram.svg"])).toBe(true);
  });

  it("is false when any file is code or config", () => {
    expect(isDocsOnly(["docs/adr/0011-ci.md", "src/router.tsx"])).toBe(false);
    expect(isDocsOnly(["README.md", ".github/workflows/ci.yml"])).toBe(false);
    expect(isDocsOnly(["supabase/migrations/0001_orders.sql"])).toBe(false);
  });
});
