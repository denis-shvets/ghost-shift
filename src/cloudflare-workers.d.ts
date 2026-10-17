// The full Workers runtime types are large, so we only declare what the app uses.
// Env itself is generated from wrangler.jsonc and .dev.vars by `pnpm cf:types`.
declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
