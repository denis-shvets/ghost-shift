import { z } from "zod";

// Checked on the server, because the form can be bypassed. Password rules are left to Supabase.
export const loginInput = z.object({
  email: z.email({ error: "Enter an email address." }),
  password: z.string().min(1, { error: "Enter your password." }),
});
