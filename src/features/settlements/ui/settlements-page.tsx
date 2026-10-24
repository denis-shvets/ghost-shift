import { type SyntheticEvent, useState } from "react";
import { useRouter } from "@tanstack/react-router";

import { formatMoney } from "~/features/orders/model/money";
import type { fetchSettlementsPage } from "~/features/settlements/server/functions";
import { saveScheduleFn } from "~/features/settlements/server/functions";
import { errorMessage } from "~/shared/errors/error-message";
import { cn } from "~/shared/styles/cn";

type Page = Awaited<ReturnType<typeof fetchSettlementsPage>>;

const REPLACE_WARNING =
  "This store already has a schedule. Saving changes it from the open period on: money already captured in that period carries over.";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

// A period is either exactly 7 days (weekly) or one calendar month (monthly). Anything else means the
// schedule changed in the middle of the period, so it is marked.
function isNonStandard(start: Date, end: Date): boolean {
  if (end.getTime() - start.getTime() === 7 * 86_400_000) return false;
  const oneMonthLater = new Date(start);
  oneMonthLater.setUTCMonth(oneMonthLater.getUTCMonth() + 1);
  return end.getTime() !== oneMonthLater.getTime();
}

const PARTIAL_PERIOD = "Partial period";

// Periods close at UTC midnight. A negative net means refunds are larger than the captures in that
// period, so the store owes money that comes off its next payout.
export function SettlementsPage({ page }: { page: Page }) {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1>Settlements</h1>
        <p className="text-neutral-600">
          Each payout covers one period, ending at UTC midnight. Refunds reduce the payout of the
          period they fall in.
        </p>
      </header>

      <ScheduleForm page={page} />

      <section aria-labelledby="schedules-heading" className="flex flex-col gap-3">
        <h2 id="schedules-heading" className="mt-0">
          Schedules
        </h2>
        {page.schedules.length === 0 ? (
          <p className="text-neutral-600">No schedules yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th scope="col">Store</th>
                  <th scope="col">Frequency</th>
                  <th scope="col">Current period ends</th>
                  <th scope="col">Payout account</th>
                </tr>
              </thead>
              <tbody>
                {page.schedules.map((schedule) => (
                  <tr key={schedule.storeId}>
                    <th scope="row">{schedule.storeName}</th>
                    <td className="capitalize">{schedule.frequency}</td>
                    <td>
                      {dateFormat.format(schedule.periodEnd)}
                      {isNonStandard(schedule.periodStart, schedule.periodEnd) ? (
                        <span className="block text-sm text-red-700">{PARTIAL_PERIOD}</span>
                      ) : null}
                    </td>
                    <td>
                      {page.accounts.find((account) => account.id === schedule.payoutAccountId)
                        ?.label ?? "Not visible to you"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="payouts-heading" className="flex flex-col gap-3">
        <h2 id="payouts-heading" className="mt-0">
          Payouts
        </h2>
        {page.settlements.length === 0 ? (
          <p className="text-neutral-600">No payouts yet. One is created when a period ends.</p>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Store</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">
                    Captured
                  </th>
                  <th scope="col" className="text-right">
                    Refunded
                  </th>
                  <th scope="col" className="text-right">
                    Net
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.settlements.map((settlement) => {
                  const debt = settlement.netAmount < 0;
                  return (
                    <tr key={settlement.id}>
                      <td className="whitespace-nowrap">
                        {dateFormat.format(settlement.periodStart)} –{" "}
                        {dateFormat.format(settlement.periodEnd)}
                        {isNonStandard(settlement.periodStart, settlement.periodEnd) ? (
                          <span className="block text-sm text-red-700">{PARTIAL_PERIOD}</span>
                        ) : null}
                      </td>
                      <td>{settlement.storeName}</td>
                      <td className="capitalize">{settlement.status}</td>
                      <td className="text-right tabular-nums">
                        {formatMoney(settlement.grossAmount, settlement.currency)}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatMoney(settlement.refundedAmount, settlement.currency)}
                      </td>
                      <td
                        className={cn(
                          "text-right tabular-nums",
                          debt && "font-semibold text-red-700",
                        )}
                      >
                        {formatMoney(settlement.netAmount, settlement.currency)}
                        {debt ? <span className="block text-sm font-normal">In debt</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ScheduleForm({ page }: { page: Page }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // Only the stores this person may change; the database refuses the rest anyway.
  const manageable = page.stores.filter((candidate) => candidate.canManage);
  const [storeId, setStoreId] = useState(manageable[0]?.id ?? "");
  // Set after the first press of Save on a store that already has a schedule; the second press confirms.
  const [confirming, setConfirming] = useState(false);

  // The list follows the chosen store.
  const store = page.stores.find((candidate) => candidate.id === storeId);
  // Only the store's own organization's accounts in its currency: the database refuses any other.
  const hasSchedule = page.schedules.some((schedule) => schedule.storeId === storeId);
  const accounts = page.accounts.filter(
    (account) =>
      account.organizationId === store?.organizationId && account.currency === store?.currency,
  );

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    // Replacing a schedule ends its open period, so the first press only asks.
    if (hasSchedule && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      await saveScheduleFn({
        data: {
          storeId,
          frequency: form.get("frequency") as "weekly" | "monthly",
          payoutAccountId: String(form.get("payoutAccountId")),
        },
      });
      await router.invalidate();
      setMessage("Schedule saved.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (page.stores.length === 0) {
    return <p className="text-neutral-600">Add a store before you set up settlements.</p>;
  }
  if (manageable.length === 0) {
    return (
      <p className="text-neutral-600">
        Only a merchant admin can set up settlements for these stores.
      </p>
    );
  }

  return (
    <section aria-labelledby="schedule-heading" className="rounded border border-neutral-200 p-4">
      <h2 id="schedule-heading" className="mt-0 pb-3">
        Set up a schedule
      </h2>
      <form
        id="schedule-form"
        onSubmit={onSubmit}
        className="grid gap-4 md:grid-cols-4 md:items-end"
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">Store</span>
          <select
            name="storeId"
            value={storeId}
            onChange={(event) => {
              setStoreId(event.target.value);
              setConfirming(false);
            }}
          >
            {manageable.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} ({candidate.currency})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">Frequency</span>
          <select name="frequency" defaultValue="weekly">
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-600">Payout account</span>
          <select name="payoutAccountId" required disabled={accounts.length === 0}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </label>
        {confirming ? null : (
          <button type="submit" disabled={busy || accounts.length === 0}>
            Save schedule
          </button>
        )}
      </form>
      {confirming ? (
        <div className="flex flex-col gap-3 pt-3">
          <p className="text-sm text-red-700">{REPLACE_WARNING}</p>
          <div className="flex items-center gap-3">
            <button type="submit" form="schedule-form" disabled={busy}>
              Confirm replace
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {accounts.length === 0 ? (
        <p className="pt-3 text-sm text-neutral-600">
          This store has no payout account in {store?.currency}. Add one in stores first.
        </p>
      ) : null}
      {message ? (
        <p role="status" className="pt-3">
          {message}
        </p>
      ) : null}
    </section>
  );
}
