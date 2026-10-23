import { type SyntheticEvent, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";

import {
  payoutAccountInput,
  storeSettingsInput,
} from "~/features/stores/model/store-settings-input";
import { testAccountFor } from "~/features/stores/model/test-account";
import {
  createPayoutAccountFn,
  fetchStoreSettings,
  saveStoreSettingsFn,
} from "~/features/stores/server/functions";
import { errorMessage } from "~/shared/errors/error-message";
import { issuesMessage } from "~/shared/validation/issues-message";

type StoreSettings = NonNullable<Awaited<ReturnType<typeof fetchStoreSettings>>>;

// Structural Tailwind classes only (ADR 0018). Market and currency are read-only,
// because orders keep the store's currency.
export function StoreSettingsPage({
  store,
  isPlatformDeveloper,
}: {
  store: StoreSettings;
  isPlatformDeveloper: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const accountFormRef = useRef<HTMLFormElement>(null);

  // Fills the add-account form with the sample values. The user can still change them before saving.
  function fillTestAccount() {
    const form = accountFormRef.current;
    if (!form) return;
    for (const [name, value] of Object.entries(testAccountFor(store))) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement) field.value = value;
    }
  }

  async function onSave(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = storeSettingsInput.safeParse({
      storeId: store.id,
      name: form.get("name"),
      supportEmail: form.get("supportEmail"),
      payoutAccountId: form.get("payoutAccountId"),
    });
    if (!input.success) {
      setMessage(issuesMessage(input.error.issues));
      return;
    }
    setMessage("");
    setBusy(true);
    try {
      await saveStoreSettingsFn({ data: input.data });
      await router.invalidate();
      setMessage("Saved");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onAddAccount(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = payoutAccountInput.safeParse({
      storeId: store.id,
      label: data.get("label"),
      accountHolderName: data.get("accountHolderName"),
      accountNumber: data.get("accountNumber"),
    });
    if (!input.success) {
      setAccountMessage(issuesMessage(input.error.issues));
      return;
    }
    setAccountMessage("");
    setAccountBusy(true);
    try {
      await createPayoutAccountFn({ data: input.data });
      form.reset();
      // Reloads the settings, so the new account appears in the list above.
      await router.invalidate();
      setAccountMessage("Account added. Pick it above and save.");
    } catch (error) {
      setAccountMessage(errorMessage(error));
    } finally {
      setAccountBusy(false);
    }
  }

  // Payout accounts are hidden from people without organization access, so a set account can look like "Not set".
  const hiddenPayoutAccount =
    store.payoutAccountId !== null &&
    !store.payoutAccounts.some((account) => account.id === store.payoutAccountId);

  return (
    <>
      <Link to="/stores" className="text-sm text-gray-600 hover:underline">
        Back to stores
      </Link>
      <h1>{store.name}</h1>
      <p>
        {store.market} · {store.currency} · {store.status}
      </p>
      {!store.canEdit && <p role="status">You can view this store but not change it.</p>}

      <fieldset disabled={!store.canEdit} className="contents">
        <form onSubmit={onSave} className="flex max-w-xl flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="store-name">Store name</label>
            <input id="store-name" name="name" defaultValue={store.name} required maxLength={100} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="store-support-email">Support email</label>
            <input
              id="store-support-email"
              name="supportEmail"
              type="email"
              defaultValue={store.supportEmail ?? ""}
              maxLength={254}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="store-payout-account">Payout account</label>
            <select
              id="store-payout-account"
              name="payoutAccountId"
              defaultValue={store.payoutAccountId ?? ""}
            >
              <option value="">Not set</option>
              {/* Keeps the hidden account selected, so saving the name doesn't clear it. */}
              {hiddenPayoutAccount && (
                <option value={store.payoutAccountId ?? ""}>Hidden account</option>
              )}
              {store.payoutAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}, {account.accountHolderName}, ************{account.lastFour}
                </option>
              ))}
            </select>
            {hiddenPayoutAccount && <p>A payout account is set, but you can't see its details.</p>}
          </div>
          {message && <p role="status">{message}</p>}
          <div>
            <button type="submit" disabled={busy}>
              Save settings
            </button>
          </div>
        </form>
      </fieldset>

      <fieldset disabled={!store.canAddAccount} className="contents">
        <section className="mt-8 max-w-xl">
          <h2>Add a payout account</h2>
          <p>Accounts are in {store.currency}. Only the last four digits are saved.</p>
          <form ref={accountFormRef} onSubmit={onAddAccount} className="flex flex-col gap-4">
            {isPlatformDeveloper && (
              <div>
                <button type="button" onClick={fillTestAccount}>
                  Prefill test account
                </button>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="account-label">Label</label>
              <input id="account-label" name="label" required maxLength={60} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="account-holder">Account holder name</label>
              <input id="account-holder" name="accountHolderName" required maxLength={100} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="account-number">Account number</label>
              <input
                id="account-number"
                name="accountNumber"
                inputMode="numeric"
                pattern="[0-9]{8,20}"
                autoComplete="off"
                required
              />
            </div>
            {accountMessage && <p role="status">{accountMessage}</p>}
            <div>
              <button type="submit" disabled={accountBusy}>
                Add account
              </button>
            </div>
          </form>
        </section>
      </fieldset>
    </>
  );
}
