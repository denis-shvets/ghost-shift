import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: (issue) =>
      issue.input === undefined
        ? "DATABASE_URL is required. Locally, copy .dev.vars.example to .dev.vars."
        : "DATABASE_URL must be a postgres:// or postgresql:// URL.",
  }),
  SUPABASE_URL: z.url({
    error: (issue) =>
      issue.input === undefined
        ? "SUPABASE_URL is required. Locally, copy .dev.vars.example to .dev.vars."
        : "SUPABASE_URL must be a URL.",
  }),
  SUPABASE_PUBLISHABLE_KEY: z.string({ error: "SUPABASE_PUBLISHABLE_KEY is required." }).min(1, {
    error: "SUPABASE_PUBLISHABLE_KEY is required.",
  }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

// Fails at the first request with a clear message, instead of a confusing connection error later.
export function parseServerEnv(source: object): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid server settings: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
