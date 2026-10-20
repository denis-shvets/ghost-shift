// Tells CI whether a pull request changes only docs, so it can skip every check except formatting.
// Run by .github/workflows/ci.yml; writes `docs_only=true|false` to the step output.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { z } from "zod";

export function isDocsOnly(files: string[]): boolean {
  return files.every((file) => file.startsWith("docs/") || file.endsWith(".md"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = z
    .object({ GITHUB_BASE_REF: z.string().min(1), GITHUB_OUTPUT: z.string().min(1) })
    .parse(process.env);
  const files = execFileSync(
    "git",
    ["diff", "--name-only", `origin/${env.GITHUB_BASE_REF}...HEAD`],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  appendFileSync(env.GITHUB_OUTPUT, `docs_only=${isDocsOnly(files)}\n`);
}
