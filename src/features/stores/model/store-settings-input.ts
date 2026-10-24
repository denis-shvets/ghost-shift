import { z } from "zod";

export const storeIdInput = z.uuid();

// The form sends "" for an empty optional field; the repository saves that as null.
// The database also checks that the payout account belongs to the store's organization and currency.
export const storeSettingsInput = z.object({
  storeId: storeIdInput,
  name: z.string().trim().min(1).max(100),
  supportEmail: z.union([z.literal(""), z.email().max(254)]),
  payoutAccountId: z.union([z.literal(""), z.uuid()]),
});

export type StoreSettingsInput = z.infer<typeof storeSettingsInput>;

// The full number is only checked here. Only its last four digits are saved (see createPayoutAccount).
// The currency is the store's, so it is not asked for.
export const payoutAccountInput = z.object({
  storeId: storeIdInput,
  label: z.string().trim().min(1).max(60),
  accountHolderName: z.string().trim().min(1).max(100),
  accountNumber: z.string().regex(/^[0-9]{8,20}$/, "Enter the account number as digits only"),
});

export type PayoutAccountInput = z.infer<typeof payoutAccountInput>;
