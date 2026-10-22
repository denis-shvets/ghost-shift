import { describe, expect, it } from "vitest";

import { agentRunEndInput, agentRunStartInput } from "./agent-run-input";

describe("agentRunStartInput", () => {
  it("trims the purpose", () => {
    expect(agentRunStartInput.parse({ purpose: " Review open orders " })).toEqual({
      purpose: "Review open orders",
    });
  });

  it.each([{}, { purpose: "   " }, { purpose: "x".repeat(201) }])("refuses %j", (input) => {
    expect(agentRunStartInput.safeParse(input).success).toBe(false);
  });
});

describe("agentRunEndInput", () => {
  it("takes an optional summary", () => {
    expect(agentRunEndInput.parse({})).toEqual({});
    expect(agentRunEndInput.parse({ summary: " Done " })).toEqual({ summary: "Done" });
    expect(agentRunEndInput.safeParse({ summary: "x".repeat(2001) }).success).toBe(false);
  });
});
