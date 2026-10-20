# 0004. Host on Cloudflare Workers

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The app must be reachable by agents at any time, for free, with no card. Free Node hosts (Render) sleep after 15 idle minutes and take about a minute to wake. Railway and Fly.io only offer trials.

## Decision

Deploy the whole TanStack Start app (UI, server functions, API) to **Cloudflare Workers**. Static assets are served by Workers too.

Rejected: Render (sleeps), Netlify (credit-based free plan), Vercel Hobby (fine, kept as a fallback), GitHub Pages (static only, no backend).

## Links

- Workers: <https://developers.cloudflare.com/workers/>
- Pricing: <https://developers.cloudflare.com/workers/platform/pricing/>
- Limits: <https://developers.cloudflare.com/workers/platform/limits/>
- Wrangler CLI: <https://developers.cloudflare.com/workers/wrangler/>
- TCP sockets (for Postgres): <https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/>
- Hyperdrive (Postgres connection pooling): <https://developers.cloudflare.com/hyperdrive/>

## How to use

- Create a free Cloudflare account, then `pnpm exec wrangler login`.
- `pnpm run deploy` builds and deploys to `ghost-shift.<account>.workers.dev`. Use `pnpm run deploy`, not `pnpm deploy`, which is a different built-in pnpm command.
- `pnpm dev` and `pnpm preview` already run the server code in the local Workers runtime, so what works locally works on Cloudflare.
- Config lives in `wrangler.jsonc`. Raise `compatibility_date` on purpose, never automatically.
- Secrets (Supabase keys, Resend key) go in with `pnpm exec wrangler secret put NAME`, never in the repo.

## Known limits (free plan, checked 2026-10-17)

- **100,000 requests a day.** Agents polling often can use this up.
- **10 ms CPU time per request.** Waiting on the database or `fetch` doesn't count, but heavy server-side rendering or big JSON work can hit it. Keep server code light.
- 128 MB memory, 50 subrequests per request.
- **Rate limiting.** The Rate Limiting binding is used for `/health/database` (per IP, 10 requests every 10 seconds) and for `/api/v1` (per user, 60 requests a minute). Its counts are approximate and it is not an accounting system. Cloudflare's limits for it are listed in its docs; confirm the free-plan terms there before relying on it.
- No custom domain, so the URL is `*.workers.dev` (see [0002](0002-free-and-open-source.md)).

## Consequences

Always on and global, no sleeping. We must stay inside the Workers runtime (no Node-only libraries) and watch CPU time.
