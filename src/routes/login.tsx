import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type SyntheticEvent, useState } from "react";

import { signIn } from "~/features/auth/server/functions";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in · Ghost Shift" }] }),
  component: Login,
});

// Structure only; the global base styles in src/styles/app.css style the form (ADR 0018).
function Login() {
  const signInOnServer = useServerFn(signIn);
  const navigate = useNavigate();
  const [message, setMessage] = useState("");

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await signInOnServer({
      data: { email: String(form.get("email")), password: String(form.get("password")) },
    });
    if (result.ok) {
      // A full reload, so the server draws the header once with the new cookie instead of in two steps.
      await navigate({ to: "/", reloadDocument: true });
    } else {
      setMessage(result.message);
    }
  }

  return (
    <>
      <h1>Sign in</h1>
      <form onSubmit={onSubmit}>
        <p>
          <label>
            Email <input name="email" type="email" autoComplete="username" required />
          </label>
        </p>
        <p>
          <label>
            Password{" "}
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
        </p>
        <p>
          <button type="submit">Sign in</button>
        </p>
        {message ? <p role="alert">{message}</p> : null}
      </form>
    </>
  );
}
