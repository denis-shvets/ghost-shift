import { formatMoney } from "~/features/orders/model/money";
import type { SettlementSummary } from "~/features/settlements/server/settlements-repository";

export type SettlementOverview = {
  currencies: SettlementSummary[];
  scheduleCount: number;
  canManage: boolean;
};

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

// Shown on the dashboard and insights. Each currency is its own block, so amounts are never added together.
// Without a schedule, only people who can set one up get the steps; others see nothing.
export function SettlementSummaryBlock({ overview }: { overview: SettlementOverview }) {
  if (overview.scheduleCount === 0) return overview.canManage ? <SetupCallout /> : null;

  return (
    <section aria-labelledby="settlement-summary" className="flex flex-col gap-6">
      <h2 id="settlement-summary">Settlements</h2>
      {overview.currencies.length === 0 ? <p>No settlements yet.</p> : null}
      {overview.currencies.map((row) => (
        <CurrencySettlements key={row.currency} row={row} />
      ))}
    </section>
  );
}

function CurrencySettlements({ row }: { row: SettlementSummary }) {
  const debt = row.available < 0;
  const tiles = [
    {
      label: "Balance to pay out",
      value: formatMoney(row.available, row.currency),
      tone: debt ? "text-red-700" : "",
      note: debt ? "In debt: refunds exceed captures" : undefined,
    },
    {
      label: "Next settlement",
      value: row.nextPeriodEnd ? dateFormat.format(row.nextPeriodEnd) : "–",
      tone: "",
    },
    {
      label: "Paid out",
      value: formatMoney(row.settledNet, row.currency),
      tone: "",
    },
    {
      label: "Waiting for payout",
      value: formatMoney(row.pendingNet, row.currency),
      tone: "",
      note: `${row.pendingCount} payout${row.pendingCount === 1 ? "" : "s"}`,
    },
  ];

  return (
    <div>
      <h3 className="mt-0 pb-2 text-lg font-medium">{row.currency}</h3>
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded border border-neutral-200 p-4">
            <dt className="text-sm text-neutral-600">{tile.label}</dt>
            <dd className={`mt-1 text-xl font-semibold tabular-nums ${tile.tone}`}>{tile.value}</dd>
            {tile.note ? <p className={`mt-1 text-sm ${tile.tone}`}>{tile.note}</p> : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

// Shown until a store has a schedule. Plain links, so it works without the router in tests.
function SetupCallout() {
  return (
    <section
      aria-labelledby="settlement-setup"
      className="rounded border border-neutral-300 bg-neutral-50 p-4"
    >
      <h2 id="settlement-setup" className="mt-0 text-lg font-medium">
        Set up settlements
      </h2>
      <p className="mt-1 text-neutral-700">
        Captured money is paid out on a schedule. Two steps to start:
      </p>
      <ol className="mt-3 list-decimal pl-5">
        <li>
          Add a payout account in <a href="/stores">stores</a>.
        </li>
        <li>
          Choose a weekly or monthly schedule on the <a href="/settlements">settlements page</a>.
        </li>
      </ol>
    </section>
  );
}
