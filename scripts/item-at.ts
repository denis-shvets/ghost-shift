// Array indexes are typed as possibly missing. This throws when the index is out of range, so the
// caller gets the item's type without a cast.
export const itemAt = <T>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at index ${index}`);
  return item;
};
