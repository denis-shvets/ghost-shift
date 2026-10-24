// Turns the rows of one keyset query into a page and its cursors. The query asked for limit + 1 rows,
// so the extra row tells whether another page exists in that direction.
export function keysetPage<T extends { id: string }>(
  rows: T[],
  { limit, cursor, newer }: { limit: number; cursor: string | undefined; newer: boolean },
) {
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  // Going back, the nearest rows came first, so flip them to newest first.
  if (newer) page.reverse();
  const first = page.at(0);
  const last = page.at(-1);
  return {
    page,
    // Going forward, "older" exists only if there is an extra row. Going back, it always
    // exists, because the cursor row is older than this page.
    nextCursor: (newer || hasMore) && last ? last.id : null,
    // Going back, "newer" exists only if there is an extra row. Going forward with a
    // cursor, it always exists, because the cursor row is newer than this page.
    prevCursor: (newer ? hasMore : cursor !== undefined) && first ? first.id : null,
  };
}

// A cursor the user can't see gives an empty page with no links, so fall back to the first page.
// The filters stay, so the first page is still the filtered one.
// shortcut: one extra query only when the cursor is invisible, upgrade if that path gets hot
export async function keysetPageOrFirst<I extends { cursor?: string }, P>(
  input: I,
  list: (input: I) => Promise<P>,
  isEmpty: (page: P) => boolean,
) {
  const page = await list(input);
  if (!isEmpty(page) || input.cursor === undefined) return page;
  return list({ ...input, cursor: undefined });
}
