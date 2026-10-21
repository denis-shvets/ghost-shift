# The idea

> **Draft.** The parts marked _proposal_ are suggestions to accept, change or drop.

## In one sentence

Ghost Shift is an open-source backoffice that AI agents run day to day on their own, while humans watch and can step in at any time, using the same app and the same rules.

## Why it exists

Most backoffice demos show screens for people. Ghost Shift shows what changes when software does most of the work:

- Agents are first-class users, with their own logins, roles and limits.
- Every action, by a human or an agent, is visible, attributable and reversible where possible.
- Humans stay in charge: they can do anything an agent can, and can undo or take over an agent's work.

It is also a portfolio project: a complete, tested, free-to-run fullstack app that anyone can clone.

## Who uses it

| Actor         | What they do                                                     |
| ------------- | ---------------------------------------------------------------- |
| **Agents**    | Pick up work, decide and act on their own through the API.       |
| **Operators** | Humans who watch agents work and take over when they want.       |
| **Admins**    | Manage users and agents, roles and limits.                       |
| **QA tester** | Tests the app by hand, reports bugs that become automated tests. |

## Core concepts

- **Agent:** a real user account with a role, for example `support` or `ops`. Agents sign in and call the `/api/` routes like any client.
- **Agent run:** one execution of an agent, for example a scheduled Claude task. Every action in the activity log links to the run that made it.
- **Task:** a unit of work an agent or human picks up, works on and closes.
- **Activity log:** an append-only record of every change: who did it, when, what changed, and why (agents must give a reason).
- **Live view:** screens update in real time, so you can watch agents work.

## What the backoffice manages

Ghost Shift is a **merchant portal for Phantom Checkout, a fictional checkout and payments provider**. Merchants sell online through a hosted checkout; the portal is where they and their agents run everything after the purchase. The provider, merchants, data and code are all invented.

**A simulated checkout** produces the work: a small built-in generator (and an API) creates customers and orders across markets, currencies and payment methods, so the portal always has realistic data without a real payment provider. **Night Shift** adds simulated customers on top: the owner plans the coming days on their machine, where code picks when each customer persona shops and Claude picks what they buy, and a cron in the Worker places each order at its planned time ([guide](guides/night-shift.md)).

Domains, roughly in build order (_proposal_):

| Domain                | What it covers                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Accounts & stores** | A merchant with stores per market (country, currency), and checkout settings per store.                                                                                        |
| **Team & agents**     | Human team members and agent users, invited with roles and permissions.                                                                                                        |
| **Orders**            | Order list and detail with line items, shopper, shipping and payment method. Lifecycle: authorized, captured (fully or partly), refunded (fully or partly), canceled, expired. |
| **Refunds**           | Full and partial refunds, with a reason recorded for each.                                                                                                                     |
| **Disputes**          | Chargebacks and shopper disputes with deadlines, evidence uploads and outcomes.                                                                                                |
| **Settlements**       | Payouts per market: which captured orders, refunds, fees and disputes went into each payout.                                                                                   |
| **Payment links**     | Create a link for a one-off order and send it by email.                                                                                                                        |
| **Insights**          | Sales volume, conversion, payment mix, refund and dispute rates.                                                                                                               |
| **Audit log**         | Every action by every human and agent, with the reason.                                                                                                                        |
| **Developers**        | API keys, webhooks and request logs for the merchant's own integration.                                                                                                        |
| **Emails sent**       | Every notification the portal sent, for checking and resending.                                                                                                                |

Agent work this enables, for example: capture orders when they ship, cancel orders that expire, answer disputes before their deadline with uploaded evidence, flag unusual refund patterns, reconcile settlements.

## Principles

1. **Same rules for everyone.** Permissions live in the database (row-level security), so a bug in app code can't let an agent do more than its role allows.
2. **Explain every action.** Agents attach a reason to every write.
3. **Humans can always take over.** Any task an agent holds can be reassigned to a human.
4. **Free to run.** Free plans only, no card, no paid domain yet ([ADR 0002](adr/0002-free-and-open-source.md)).
5. **Tested.** Every feature ships with automated tests, and manual QA bugs become new tests.

## First agents

The first agents are **Claude runs on the owner's machine**, started on a timer ([ADR 0017](adr/0017-local-agents-hosted-app.md)), that sign in as agent users and call the `/api/` routes. The first one will most likely work on **orders**, for example capturing shipped orders and canceling expired ones. Which tasks exactly is still open.

Agents decide on their own. There are **no human approvals** in the first version; the activity log and live view are how humans follow what happened.

## Not in scope yet

- Visual design and a component library (separate session, [ADR 0014](adr/0014-no-design-yet.md)).
- The agents themselves. Ghost Shift is the workplace; the agents are clients that connect to its API.
- A custom domain and real customer email ([ADR 0009](adr/0009-email.md)).
- Human approvals for agent actions. May come later if agents need guardrails.
- Shifts and handover notes. An idea for later, not decided.

## Open questions

1. ~~Is the fictional online shop the right business?~~ Decided 2026-10-17: a merchant portal for a fictional checkout provider.
2. ~~What is the fictional provider called?~~ Decided 2026-10-17: **Phantom Checkout**. Demo merchant names still to pick.
3. ~~Which domains go into the first version?~~ Decided 2026-10-17: the first version is a simple scaffold with routes and mocked pages only, to show the structure. Features come later.
4. ~~Keep shifts and handover notes?~~ Not decided, moved to "Not in scope yet".
5. ~~Which actions need human approval?~~ Decided 2026-10-17: none for now, agents act on their own.
6. Which scheduled tasks does the first orders agent run? _Proposal (2026-10-21), for the owner to accept:_ one task to start with, for Satin Sparrow: capture authorized orders that have shipped. It runs as a scheduled Claude task on the owner's machine. Part-captured orders, cancels and refunds stay with people. The rules are in plain words in [docs/agents/orders-agent.md](agents/orders-agent.md), so the owner can add conditions without code. See [the orders agent guide](guides/orders-agent.md).
