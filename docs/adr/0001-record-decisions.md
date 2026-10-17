# 0001. Record decisions as ADRs

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Ghost Shift is built by humans and AI agents across many sessions. An agent that starts cold must be able to learn why the stack looks the way it does without asking again.

## Decision

Every service, library or structural choice gets an Architecture Decision Record in `docs/adr/`, using [template.md](template.md). Each ADR links to the service, says how we use it, and lists known limits.

## Links

- [ADR overview by Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [adr.github.io](https://adr.github.io/)

## How to use

Before changing a technology, read its ADR. To change it, write a new ADR that supersedes the old one in the same pull request.

## Known limits

None. ADRs are plain Markdown.

## Consequences

Decisions stay reviewable in git history, and agents get a reliable source of context.
