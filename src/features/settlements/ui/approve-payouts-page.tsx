import { type SyntheticEvent, useState } from "react";
import { useRouter } from "@tanstack/react-router";

import { formatMoney } from "~/features/orders/model/money";
import type { fetchPendingPayoutsFn } from "~/features/settlements/server/functions";
import { approvePayoutsFn } from "~/features/settlements/server/functions";
import { errorMessage } from "~/shared/errors/error-message";

type Payout = Awaited<ReturnType<typeof fetchPendingPayoutsFn>>[number];

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

// Developer tool: payouts that have been closed and are waiting to be paid. Tick the ones to approve.
export function ApprovePayoutsPage({ payouts }: { payouts: Payout[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function toggle(id: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));
  }

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await approvePayoutsFn({ data: selected });
      setSelected([]);
      await router.invalidate();
      setMessage(`Approved ${selected.length} payout${selected.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1>Approve payouts</h1>
        <p className="text-neutral-600">
          Payouts are created automatically when a period ends. Tick the ones to approve. If one of
          them can&apos;t be approved, none of them are.
        </p>
      </header>

      {payouts.length === 0 ? (
        <p className="text-neutral-600">No payouts are waiting for approval.</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Approve</span>
                  </th>
                  <th scope="col">Store</th>
                  <th scope="col">Period</th>
                  <th scope="col" className="text-right">
                    Net
                  </th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td>
                      <input
                        type="checkbox"
                        name="payoutIds"
                        value={payout.id}
                        aria-label={`Approve ${
                          payout.storeName
                        } period ending ${dateFormat.format(payout.periodEnd)}`}
                        checked={selected.includes(payout.id)}
                        onChange={(event) => toggle(payout.id, event.target.checked)}
                        className="size-4 p-0"
                      />
                    </td>
                    <th scope="row">
                      {payout.storeName}{" "}
                      <span className="text-neutral-600">({payout.currency})</span>
                    </th>
                    <td className="whitespace-nowrap">
                      {dateFormat.format(payout.periodStart)} –{" "}
                      {dateFormat.format(payout.periodEnd)}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatMoney(payout.netAmount, payout.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy || selected.length === 0}>
              Approve {selected.length > 0 ? `${selected.length} selected` : "selected"}
            </button>
            <button
              type="button"
              onClick={() => setSelected(payouts.map((payout) => payout.id))}
              disabled={busy}
            >
              Select all
            </button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      )}
    </div>
  );
}
