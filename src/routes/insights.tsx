import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/insights")({
  component: Insights,
});

const metrics = [
  { label: "Conversion rate", value: "3.4%" },
  { label: "Average order value", value: "SEK 862" },
  { label: "Refund rate", value: "2.1%" },
  { label: "Dispute rate", value: "0.3%" },
];

function Insights() {
  return (
    <>
      <h1>Insights</h1>
      <p>Mocked numbers for the last 30 days.</p>
      <dl>
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
