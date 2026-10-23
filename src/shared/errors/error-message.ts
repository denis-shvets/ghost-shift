// The text to show for a failed request. Only an Error's message is meant for the person.
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}
