# 0009. Resend for email, Mailpit for testing

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The backoffice sends notifications. We have no custom domain yet ([0002](0002-free-and-open-source.md)), and QA must be able to check emails without sending real ones.

## Decision

- **Resend** sends real email, through its TypeScript SDK, with templates written as React components (React Email).
- **Mailpit** catches every email in local runs, QA and CI, and shows it in a web inbox.
- Until we verify a domain, real email goes **only to the owner's exact Resend account address**. Automated tests and demos send to Resend's test inboxes, such as `delivered+agent.support@resend.dev`.

Rejected: Brevo (more free emails a day, weaker developer experience). Kept as a fallback.

## Links

- Resend: <https://resend.com/>
- Resend docs: <https://resend.com/docs>
- Pricing: <https://resend.com/pricing>
- Test email addresses: <https://resend.com/docs/knowledge-base/what-email-addresses-to-use-for-testing>
- React Email: <https://react.email/>
- Mailpit: <https://mailpit.axllent.org/>
- Brevo (fallback): <https://www.brevo.com/>

## How to use

- Locally, `pnpm supabase start` runs Mailpit (Supabase calls it Inbucket in its config). Open the inbox URL it prints.
- The app picks the transport from environment: Mailpit (SMTP) locally and in CI, Resend in production.
- Playwright tests read Mailpit's API to assert that an email was sent.

## Known limits (free plan, checked 2026-10-17)

- 3,000 emails a month, **100 a day** (resets at midnight UTC). Inbound mail counts too.
- 1 verified domain.
- **Without a domain:** sends only from `onboarding@resend.dev`, and only to the account owner's exact address. It's unconfirmed whether Gmail plus-addresses (`owner+tag@gmail.com`) are accepted; test with one API call before relying on it.
- Agents can't send from their Gmail plus-addresses.

## Consequences

Real notifications reach only the owner until a domain is bought. Then: verify it in Resend, change the sender, and lift the recipient restriction.
