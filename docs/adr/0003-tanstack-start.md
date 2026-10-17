# 0003. TanStack Start for frontend and backend

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

We need a React frontend and an HTTP API that both humans (through the UI) and AI agents (directly) can use. It must deploy for free and be type-safe end to end.

## Decision

Use **TanStack Start** as one fullstack TypeScript app:

- **Server functions** for calls from our own UI.
- **Server routes** (`/api/...`) as a plain REST API for agents, with request validation and published docs.
- **TanStack Router** for type-safe routes and URL search params (filters, sorting, paging in backoffice tables).
- **TanStack Query** for data fetching and caching.

Rejected:
- Next.js: fine, but more tied to Vercel, and we wanted a Vite-based stack.
- Separate NestJS API: stronger API structure, but two apps to deploy and a backend host that sleeps on free plans.

## Links

- TanStack Start: <https://tanstack.com/start/latest>
- TanStack Router: <https://tanstack.com/router/latest>
- TanStack Query: <https://tanstack.com/query/latest>
- Hosting guide: <https://tanstack.com/start/latest/docs/framework/react/guide/hosting>
- Cloudflare guide for TanStack Start: <https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/>

## How to use

- Pages go in `src/routes/` (file-based routing). Route files stay thin and call code in `src/features/` (see [0012](0012-feature-structure.md)).
- UI-only calls use server functions. Anything an agent may call goes through a server route under `/api/`.
- Validate every input with a schema (Zod) and generate OpenAPI docs from the same schemas.

## Known limits

- Younger than Next.js: fewer examples and templates, and AI agents know it less well.
- Server functions are an internal RPC, not a public contract. Agents must only use `/api/` routes.

## Consequences

One codebase and one deploy. We write our own API validation and docs instead of getting them from a framework like NestJS.
