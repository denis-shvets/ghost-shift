# 0013. Oxlint and Oxfmt for linting and formatting

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Agents produce a lot of code, so checks must be fast and strict. The owner prefers the Oxc tools.

## Decision

- **Oxlint** for linting, with type-aware rules turned on.
- **Oxfmt** for formatting.
- **`tsc --noEmit`** for full type checking, since a linter doesn't replace the compiler.
- **Lefthook** runs lint and format on staged files before each commit.
- **pnpm** as the package manager.

Rejected: Biome (one stable tool for both, the main alternative if Oxfmt causes trouble), ESLint and Prettier (much slower).

## Links

- Oxc: <https://oxc.rs/>
- Oxlint: <https://oxc.rs/docs/guide/usage/linter.html>
- Oxfmt beta announcement: <https://oxc.rs/blog/2026-02-24-oxfmt-beta>
- Lefthook: <https://lefthook.dev/>
- pnpm: <https://pnpm.io/>
- Biome (fallback): <https://biomejs.dev/>

## How to use

- `pnpm lint` runs Oxlint with the rules in `.oxlintrc.json`, including `oxc/no-barrel-file` (see [0012](0012-feature-structure.md)). `pnpm format` runs Oxfmt, `pnpm format:check` checks it in CI.
- `pnpm typecheck` runs `tsc --noEmit`.

## Known limits (checked 2026-10-17)

- **Oxfmt is still in beta (0.x).** It matches Prettier output for JS and TS, but its options and output can change between versions. Pin exact versions.
- Oxlint's type-aware linting is newer than the rest of Oxlint and covers most, not all, typescript-eslint type-aware rules.
- Enforcing the feature import rules in [0012](0012-feature-structure.md) may need Oxlint's `no-restricted-imports` or a small custom check.

## Consequences

Very fast checks, at the cost of using a young formatter. Switch to Biome if Oxfmt breaks.
