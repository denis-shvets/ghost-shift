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
        await navigate({ to: "/login" });
      }}
    >
      <button type="submit">Sign out</button>
    </form>
  );
}
