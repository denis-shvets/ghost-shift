import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findClaude, runClaude, structuredOutput } from "./claude-runner.ts";

describe("structuredOutput", () => {
  it("returns the structured answer, and refuses an error or a plain answer", () => {
    expect(
      structuredOutput(JSON.stringify({ is_error: false, structured_output: { orders: [] } })),
    ).toEqual({ orders: [] });
    expect(() => structuredOutput(JSON.stringify({ is_error: true }))).toThrow(/no structured/);
    expect(() => structuredOutput(JSON.stringify({ result: "Sure!" }))).toThrow(/no structured/);
  });
});

describe("findClaude", () => {
  it("uses claude from PATH outside Windows", () => {
    expect(findClaude("linux", "")).toBe("claude");
  });

  it("finds claude.exe on Windows, also inside an npm shim's package", () => {
    const npm = mkdtempSync(join(tmpdir(), "npm-"));
    const bin = join(npm, "node_modules", "@anthropic-ai", "claude-code", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "claude.exe"), "");
    expect(findClaude("win32", `C:\nowhere;${npm}`)).toBe(join(bin, "claude.exe"));
    expect(() => findClaude("win32", "C:\nowhere")).toThrow(/on PATH/);
  });
});

describe("runClaude", () => {
  it("sends the input on stdin and resolves with the whole output", async () => {
    const echo = ["-e", "process.stdin.pipe(process.stdout)"];
    await expect(runClaude(process.execPath, echo, "line 1\nline 2")).resolves.toBe(
      "line 1\nline 2",
    );
  });

  it("stops a run that takes too long and rejects with timed out", async () => {
    const hang = ["-e", "setTimeout(() => {}, 60000)"];
    await expect(runClaude(process.execPath, hang, "", 300)).rejects.toThrow(/timed out/);
  });
});
