# 0002. Free tier and open source only

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Ghost Shift is a public showcase. Anyone should be able to clone it, run it and deploy their own copy without paying.

## Decision

- The code is open source from A to Z, in a public GitHub repository.
- Every hosted service must have a free plan that needs no card.
- **No custom domain yet.** This is the only thing that would cost money (about $10 a year). Without it, email can only reach the project owner's own address (see [0009](0009-email.md)) and the app lives on a `*.workers.dev` URL.

## Links

- Repository: <https://github.com/denis-shvets/ghost-shift>

## How to use

When proposing a new service, check its free plan first and record the limits in its ADR.

## Known limits

Free plans sleep, pause or cap usage. Each ADR lists them.

## Consequences

Zero running cost, at the price of working within quotas. Revisit when the demo needs a real domain or outgrows a quota.
