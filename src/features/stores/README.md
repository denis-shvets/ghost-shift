# Stores

A merchant's stores, one per market (country), each with its own currency and a `live` or `test` status.

## What it does now

- `/stores` lists the stores the signed-in person can read.
- `/stores/$storeId` is the store settings page. It edits the store name, the support email and the payout account. Market, currency, status and organization are read-only. Payout accounts are shown only to people with `payout_accounts.read` in the organization, so a platform operator sees the store but not its accounts.
- A merchant picks a payout account from its organization's list, in the store's currency. A new account can be added from the same page; only its last four digits are saved. The full number is checked, then discarded, so only the last four digits are kept.

## Data

- Table `stores`, defined in [db/schema.ts](db/schema.ts). Settings columns: `name`, `support_email`, `payout_account_id`.
- Table `payout_accounts`, in the same file. Sample accounts with invented numbers, seeded in [supabase/seed.sql](../../../supabase/seed.sql).
- `market` must be 2 capital letters (ISO 3166-1, `SE`) and `currency` 3 capital letters (ISO 4217, `SEK`).
- `(id, currency)` is unique on `stores`, so `orders` can reference both together.
- `(id, organization_id, currency)` is unique on `payout_accounts`. A store's payout account is a composite foreign key on that, so the account must belong to the store's organization and use its currency. The database refuses anything else.
- Column grants limit what a signed-in person can change on `stores`: `name`, `support_email` and `payout_account_id` only. Market and currency stay locked, so existing orders keep their currency.
- Permission `stores.edit` (granted to `merchant_admin` and `platform_developer`) lets a person change a store and add payout accounts. Row-level security applies it.

## Code

- Validation: [model/store-settings-input.ts](model/store-settings-input.ts).
- Database access, through `withUser`: [server/stores-repository.ts](server/stores-repository.ts).
- Server functions: [server/functions.ts](server/functions.ts).
- UI: [ui/store-settings-page.tsx](ui/store-settings-page.tsx) and [ui/store-list-page.tsx](ui/store-list-page.tsx).
