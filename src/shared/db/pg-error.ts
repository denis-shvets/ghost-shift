// Drizzle wraps the Postgres error, the one with the code and message, in `cause`.
// Returns that Postgres error, or the thrown value itself when nothing wraps it.
export function pgError(error: unknown): { code?: string; message?: string } | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const source = "cause" in error && error.cause ? error.cause : error;
  if (typeof source !== "object" || source === null) return undefined;
  return source as { code?: string; message?: string };
}
