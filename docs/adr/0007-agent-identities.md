# 0007. Humans and agents as real users

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

AI agents run most of the backoffice, and humans can do everything agents can. Agents must be accountable: every action should show who did it, and an agent should never be able to do more than its role allows.

## Decision

- Every agent is a real Supabase Auth user with its own role, exactly like a human.
- Agent emails use Gmail plus-addressing on the owner's inbox: `owner.email+agent.<name>@gmail.com`. Gmail delivers all of them to the owner's inbox, and Supabase treats each one as a separate user.
- Agent accounts are created through the Supabase admin API with the email already confirmed, so no signup emails are sent.
- Agents call the `/api/` routes with their own access token. Every write records the acting user, human or agent, in an audit log.

## Links

- Supabase Auth: <https://supabase.com/docs/guides/auth>
- Admin API (create users): <https://supabase.com/docs/reference/javascript/auth-admin-createuser>
- Custom claims and roles: <https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac>
- Gmail plus-addressing: <https://support.google.com/mail/answer/22370>

## How to use

- A seed script creates the agent users and their roles for local runs and QA.
- Filter the owner's Gmail by `to:owner.email+agent.<name>@gmail.com` to see one agent's mail.

## Known limits

- Built-in Supabase auth emails are capped at a few per hour on the free plan, so agents never sign up through the normal flow.
- Agents can't send email from these addresses (see [0009](0009-email.md)).

## Consequences

One permission model for humans and agents, enforced by the database. Every action is traceable to a named actor.
