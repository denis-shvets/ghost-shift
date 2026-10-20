import { z } from "zod";

// GET forms and query strings send "" or spaces for an empty field, which means "not sent".
export function optionalParam<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : (value ?? undefined),
    schema.optional(),
  );
}
