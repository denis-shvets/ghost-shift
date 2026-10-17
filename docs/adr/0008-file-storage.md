# 0008. Supabase Storage for files

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The backoffice needs attachments (similar to email attachments) on records, uploaded by humans or agents.

## Decision

Use **Supabase Storage**. Buckets are private, and access is controlled by RLS policies on `storage.objects`, the same way as database rows.

Rejected for now: Cloudflare R2 (10 GB free and no egress fees, but needs a card on the account). It's the upgrade path if we outgrow Storage.

## Links

- Supabase Storage: <https://supabase.com/docs/guides/storage>
- Storage access control: <https://supabase.com/docs/guides/storage/security/access-control>
- Signed URLs: <https://supabase.com/docs/reference/javascript/storage-from-createsignedurl>
- Cloudflare R2 (later): <https://developers.cloudflare.com/r2/>

## How to use

- Upload through `supabase-js` as the signed-in user, so policies apply.
- Store the file path on the owning record. Hand out short-lived signed URLs for downloads.

## Known limits (free plan, checked 2026-10-17; sources disagree, confirm on the pricing page)

- About 1 GB total storage (one source says 500 MB).
- 50 MB maximum file size.
- Downloads count toward the 5 GB monthly egress shared with the database.

## Consequences

No extra service or account. Size limits must be enforced in the UI and API.
