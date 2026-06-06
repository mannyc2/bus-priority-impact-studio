import { MetricValue } from "@/components/KPI";
import type { StudioRoute } from "@/studio/api-contract";
import { ROUTE_METRICS } from "@/studio/metric-model";

/**
 * A->B delta KPI strip for the compare page. Explicit variant of the shared
 * ROUTE_METRICS model (see also RouteMetricStrip for the single-route variant).
 */
export function RouteDeltaStrip({ a, b }: { a: StudioRoute; b: StudioRoute }) {
  return (
    <section className="grid grid-cols-5 gap-[1px] overflow-hidden rounded-[3px] bg-[var(--bp-color-rule)] shadow-[0_0_0_1px_var(--bp-color-rule)] max-xl:grid-cols-3 max-md:grid-cols-2">
      {ROUTE_METRICS.map((metric) => {
        const aValue = metric.value(a);
        const bValue = metric.value(b);
        if (metric.numeric === null || metric.formatDelta === undefined) {
          return (
            <DeltaCell
              key={metric.key}
              label={metric.compareLabel}
              aValue={aValue}
              bValue={bValue}
            />
          );
        }
        const delta = metric.formatDelta(metric.numeric(b) - metric.numeric(a));
        return (
          <DeltaCell
            key={metric.key}
            label={metric.compareLabel}
            aValue={aValue}
            bValue={bValue}
            delta={delta}
            {...(metric.unit !== undefined ? { unit: metric.unit } : {})}
            {...(metric.higherIsBetter !== undefined
              ? { higherIsBetter: metric.higherIsBetter }
              : {})}
          />
        );
      })}
    </section>
  );
}

function DeltaCell({
  label,
  aValue,
  bValue,
  delta,
  unit,
  higherIsBetter,
}: {
  label: string;
  aValue: string;
  bValue: string;
  delta?: string;
  unit?: string;
  higherIsBetter?: boolean;
}) {
  let tone = "var(--bp-color-ink-55)";
  let arrow = "";
  let sign = "";
  if (delta !== undefined && higherIsBetter !== undefined) {
    const numeric = Number(delta.replace(/[^-0-9.]/g, ""));
    if (!Number.isNaN(numeric) && numeric !== 0) {
      const better = (numeric > 0 && higherIsBetter) || (numeric < 0 && !higherIsBetter);
      tone = better ? "var(--bp-color-good)" : "var(--bp-color-bad)";
      arrow = better ? " ▲" : " ▼";
      sign = numeric > 0 ? "+" : "";
    }
  }
  return (
    <div className="bg-[var(--bp-color-card)] p-3.5 text-center">
      <div className="text-[11px] font-semibold text-[var(--bp-color-ink-70)]">{label}</div>
      <div className="mt-2 flex items-baseline justify-center gap-1.5">
        <MetricValue value={aValue} valueSize={18} />
        <span className="text-[12px] text-[var(--bp-color-ink-55)]">→</span>
        <MetricValue value={bValue} unit={unit} valueSize={18} unitSize={10} />
      </div>
      {delta !== undefined ? (
        <div
          className="mt-1.5 font-mono text-[11.5px] font-semibold tabular-nums"
          style={{ color: tone }}
        >
          {sign}
          {delta}
          {unit ? ` ${unit}` : ""}
          {arrow}
        </div>
      ) : null}
    </div>
  );
}
