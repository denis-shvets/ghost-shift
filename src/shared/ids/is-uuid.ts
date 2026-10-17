const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Checks the shape before a query, so a mistyped id in a URL is a "not found", not a database error.
export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}
