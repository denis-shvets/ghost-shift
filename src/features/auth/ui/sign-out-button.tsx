import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { signOut } from "../server/functions";

export function SignOutButton() {
  const signOutOnServer = useServerFn(signOut);
  const navigate = useNavigate();

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await signOutOnServer();
        // A full reload, so the header is drawn once, signed out, instead of in two steps.
        await navigate({ to: "/login", reloadDocument: true });
      }}
    >
      <button type="submit">Sign out</button>
    </form>
  );
}
