// A refusal comes back with its message, so the page can show it. Anything else only goes to the log,
// because its message can hold SQL and input.
export function refusalOrLog(refusal: new (...args: never[]) => Error) {
  return (error: unknown): never => {
    if (error instanceof refusal) throw new Error(error.message);
    console.error(error);
    throw new Error("Something went wrong");
  };
}
