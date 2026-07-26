import { Area, ComposedChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import type { BuildoutSeries } from "@/studio/network-change-record";

export type NetworkBuildoutChartProps = {
  series: readonly BuildoutSeries[];
  axisMax: number;
  height: number;
  /** Dashed rule marking where publication stops, omitted when it does not. */
  partialFinalYear: number | null;
};

/**
 * The build-out plot. Deliberately bare: no axes, no legend and one mid rule,
 * because the right-end labels beside it are the legend and the years beneath
 * it are the axis. Both live in `NetworkBuildout.tsx`, which positions them
 * against this chart's linear domain, so the margins here must stay at zero.
 *
 * The series are unfilled `Area` marks rather than `Line` marks, which draw the
 * same stroke. `Area` and `ComposedChart` are already in the bundle for the
 * route speed trend; `Line` would pull a second Recharts cartesian item and its
 * shared dependencies for no visual difference, and measured 5.6 KB gzip
 * against a total-JS budget with under 3 KB spare. Do not "simplify" this to
 * `LineChart` without re-running `bun run check:web-release`.
 */
export function NetworkBuildoutChart({
  series,
  axisMax,
  height,
  partialFinalYear,
}: NetworkBuildoutChartProps) {
  const years = series[0]?.values.map((point) => point.year) ?? [];
  const rows = years.map((year, index) => {
    const row: Record<string, number> = { year };
    for (const entry of series) {
      row[entry.familyKey] = entry.values[index]?.routes ?? 0;
    }
    return row;
  });

  const config = Object.fromEntries(
    series.map((entry) => [entry.familyKey, { label: entry.label, color: entry.color }]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height }}
      aria-hidden="true"
    >
      <ComposedChart data={rows} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <XAxis dataKey="year" hide type="category" />
        <YAxis hide domain={[0, axisMax]} />
        <ReferenceLine y={axisMax / 2} stroke="var(--bp-color-ink-10)" strokeWidth={1} />
        <ReferenceLine y={0} stroke="var(--bp-color-rule)" strokeWidth={1} />
        {partialFinalYear === null ? null : (
          <ReferenceLine
            x={partialFinalYear}
            stroke="var(--bp-color-ink-20)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        {series.map((entry) => (
          <Area
            key={entry.familyKey}
            dataKey={entry.familyKey}
            type="linear"
            stroke={entry.color}
            // The two smallest families sit on the axis floor; a lighter stroke
            // keeps them readable as flat lines instead of a thick smear.
            strokeWidth={entry.endValue >= axisMax / 20 ? 2 : 1.5}
            fill="none"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ChartContainer>
  );
}
