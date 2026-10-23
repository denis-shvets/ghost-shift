import { type UserClaims, isPlatformDeveloper } from "~/shared/auth/user-claims";

// Throws a 403 response for anyone who is signed in but lacks the platform_developer global role.
// Server functions and API routes both let a thrown Response reach the client unchanged.
export function requirePlatformDeveloper(user: UserClaims): void {
  if (!isPlatformDeveloper(user)) {
    throw new Response("Forbidden", { status: 403 });
  }
}
