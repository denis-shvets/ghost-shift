import { describe, expect, it } from "vitest";

import { cn } from "~/shared/styles/cn";

describe("cn", () => {
  it("keeps the later Tailwind class when two conflict", () => {
    expect(cn("p-2 text-sm", "p-4", { hidden: false })).toBe("text-sm p-4");
  });
});
