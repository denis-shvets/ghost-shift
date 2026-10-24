import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const MINUTE = 60_000;
// A Claude run longer than this is stuck, so it is killed and counted as failed.
const CLAUDE_TIMEOUT = 10 * MINUTE;

// The claude program to start. On Windows it's claude.exe from the native install, or the one inside
// the npm package behind a claude.cmd shim. Starting the .exe itself matters: a .cmd only runs
// through a shell, and a detached shell's output never reaches the pipes.
export function findClaude(platform = process.platform, path = process.env.PATH ?? "") {
  if (platform !== "win32") return "claude";
  const candidates = path
    .split(";")
    .filter(Boolean)
    .flatMap((dir) => [
      join(dir, "claude.exe"),
      join(dir, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
    ]);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("claude.exe isn't on PATH. Install Claude Code first.");
  return found;
}

// Kills the child and everything it started. Windows has no process groups we can signal, so taskkill /T walks the tree.
export function killTree(child: ChildProcess) {
  if (child.pid === undefined) return;
  if (process.platform === "win32")
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else process.kill(-child.pid, "SIGKILL");
}

// Runs a command with `input` on stdin and resolves with its whole stdout. The prompt goes through
// stdin, because it is too long for a Windows command line.
export function runClaude(
  command: string,
  args: string[],
  input: string,
  timeout = CLAUDE_TIMEOUT,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      killTree(child);
      reject(new Error(`timed out after ${timeout / MINUTE} minutes`));
    }, timeout);
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    child.stderr.on("data", (chunk: Buffer) => (err += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const lastLine = (text: string) => text.trim().split(/\r?\n/).at(-1) ?? "";
      if (code === 0) resolve(out);
      else reject(new Error(`claude exited with ${code}: ${lastLine(err || out)}`));
    });
    child.stdin.end(input);
  });
}

// The structured answer from `claude -p --output-format json --json-schema`.
export function structuredOutput(stdout: string): unknown {
  const result = JSON.parse(stdout) as { is_error?: boolean; structured_output?: unknown };
  if (result.is_error || result.structured_output === undefined)
    throw new Error("Claude gave no structured answer.");
  return result.structured_output;
}
