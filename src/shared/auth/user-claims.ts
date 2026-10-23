import { z } from "zod";

// The claims we read from a verified Supabase login token. `global_roles` is added by the
// custom access token hook (see the access migration). It lists only global roles such as
// developer. Organization and store access is checked in the database, not in the token.
const userClaimsSchema = z.object({
  sub: z.uuid(),
  email: z.email().optional(),
  global_roles: z.array(z.string()).default([]),
});

export type UserClaims = z.infer<typeof userClaimsSchema>;

// Returns null instead of throwing, so a token with unexpected claims counts as signed out.
export function toUserClaims(source: unknown): UserClaims | null {
  const result = userClaimsSchema.safeParse(source);
  return result.success ? result.data : null;
}

// For showing developer-only UI. The server still checks what the person may do.
export function isPlatformDeveloper(user: UserClaims | null): boolean {
  return user?.global_roles.includes("platform_developer") ?? false;
}
