# Layout and navigation

The app shell lives here: the header, the grouped main navigation, and the sample-data notice for pages that still read mock data.

- `model/navigation.ts` holds the nav as data, in groups. `navigationFor(user)` decides what a visitor sees: nothing when signed out, and the Developer tools group only for platform developers.
- `server/functions.ts` has `fetchCurrentUser`, which the root route loads on every page. It never redirects, so `/login` still renders.
- `ui/app-layout.tsx` draws the header, the nav, and the `<main id="content">` area. `ui/mock-notice.tsx` is the sample-data notice.

## Add a nav item

1. Add `{ to, label, mock }` to the right group in `model/navigation.ts`. `to` must be a route that exists.
2. Put `mock: true` if the page still reads `src/mocks/data`. Otherwise use `mock: false`.
3. Run `pnpm test`. The navigation test checks that every path is unique.

## When to drop `mock`

Once a page reads the database instead of `src/mocks/data`, set its `mock` to `false` and remove `<MockNotice />` from the page. Then check the page title with `head()` in its route file.

Run `git grep -l "mocks/data" src/routes` to list the pages that still use sample data.

## Page titles

Each page route sets `head: () => ({ meta: [{ title: "<Page> · Ghost Shift" }] })`. The root route sets the fallback title.
