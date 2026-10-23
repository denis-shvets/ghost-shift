// Joins the messages of Zod issues into one line for the person.
export function issuesMessage(issues: { message: string }[]) {
  return issues.map((issue) => issue.message).join("; ");
}
