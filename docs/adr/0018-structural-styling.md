# 0018. Structural styling with Tailwind

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

ADR 0014 kept the first scaffold unstyled so the design session could choose the look freely. Features are now far enough along that unstyled pages make it hard to check layout, tables and forms by eye.

The design system is still undecided, so the styling must not lock in colors, brand or components.

## Decision

Style structure only, with Tailwind CSS v4 through its Vite plugin.

- Global base rules in `src/styles/app.css` style headings, links, tables, forms and buttons.
- Layout classes sit on the app shell (`src/features/layout/ui/app-layout.tsx`): a header across the top, a navigation sidebar beside the page from `md` up, and a stacked layout on phones, with a 16px gutter.
- `cn()` in `src/shared/styles/cn.ts` joins class names and resolves Tailwind conflicts.
- Colors are neutral grays, with one blue accent for links and focus. No brand palette and no design tokens yet.
- No component library. Pages stay plain semantic HTML.

Alternatives rejected: a component library (locks in a look before the design session) and hand-written CSS files per page (repeats the same rules in every page).

## Links

- Tailwind CSS: https://tailwindcss.com/docs
- Supersedes [0014](0014-no-design-yet.md) for styling only.

## How to use

Change global element looks in `src/styles/app.css`. Add classes to layout markup only where they do a visible job. Use `cn()` when combining a class string with conditional classes.

Tests find elements by role and label, not by class (as in 0014).

## Known limits

Global element rules apply to every page, so a change to `button` or `table` changes the whole app. Revisit when the design session starts.

## Consequences

Layout is easy to review now. The design session can replace the base rules and colors without touching features. Pages must not hard-code brand colors until then.
