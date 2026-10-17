# 0014. No UI design in the first scaffold

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The design system and visual identity will be decided in a separate session. Choosing a component library now would lock that in early.

## Decision

The first scaffold has no component library, no CSS framework and no styling beyond browser defaults. Pages use plain semantic HTML so features and tests can be built and checked.

## Links

None yet. The design session will add its own ADR.

## How to use

Use semantic elements (`<table>`, `<form>`, `<label>`, `<button>`) and accessible names. Playwright tests should find elements by role and label, not by CSS classes, so they keep working after the design lands.

## Known limits

The app will look bare until the design session.

## Consequences

Design can be chosen freely later without rewriting features or tests.
