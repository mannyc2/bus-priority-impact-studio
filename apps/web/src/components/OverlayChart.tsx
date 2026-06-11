import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export type OverlaySeries = {
  /** Row dataKey + config key; the line is stroked with var(--color-{key}). */
  key: string;
  label: string;
  color: string;
  /** Render the line dashed (the B-side convention). */
  dashed?: boolean;
  /** Optional dashed reference line in the series color (e.g. scheduled speed). */
  baseline?: number;
};

export type OverlayRow = Record<string, number | string | [number, number] | null | undefined>;

export type OverlayChartProps = {
  /** Pre-shaped rows: each has the x value under `xKey`, one number per series
   * key, and an optional `band` [min, max] for the shaded gap. */
  rows: OverlayRow[];
  series: readonly OverlaySeries[];
  xKey: string;
  height?: number;
  grid?: boolean;
  /** Shade the min/max gap between series (rows must carry `band`). Default on. */
  band?: boolean;
  xInterval?: number;
  xTickFormatter?: (value: string | number) => string;
  tooltipLabel?: (value: string | number) => string;
  yDomain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
  yAllowDecimals?: boolean;
};

/**
 * One N-series line overlay used by every compare chart (hour-of-day, history
 * trend, corridor position). The caller shapes the rows and declares the series;
 * this owns the shared Recharts plumbing - axes, the gap band, A-solid/B-dashed
 * lines, per-series baselines, tooltip, legend - so the per-chart files are just
 * thin row adapters. Series color flows in via config -> var(--color-{key}).
 */
export function OverlayChart({
  rows,
  series,
  xKey,
  height = 180,
  grid = false,
  band = true,
  xInterval,
  xTickFormatter,
  tooltipLabel,
  yDomain = ["auto", "auto"],
  yAllowDecimals = true,
}: OverlayChartProps) {
  if (rows.length === 0 || series.length === 0) return null;

  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  );

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <ComposedChart data={rows} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
        {grid ? <CartesianGrid vertical={false} /> : null}
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          {...(xInterval !== undefined ? { interval: xInterval } : {})}
          {...(xTickFormatter ? { tickFormatter: xTickFormatter } : {})}
        />
        <YAxis
          width={34}
          domain={yDomain}
          allowDecimals={yAllowDecimals}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
        />
        {band ? (
          <Area
            dataKey="band"
            stroke="none"
            fill="var(--bp-color-accent-bg)"
            fillOpacity={0.7}
            tooltipType="none"
            legendType="none"
            isAnimationActive={false}
            connectNulls
          />
        ) : null}
        {series.map((s) =>
          s.baseline !== undefined ? (
            <ReferenceLine
              key={`baseline-${s.key}`}
              y={s.baseline}
              stroke={`var(--color-${s.key})`}
              strokeDasharray="3 3"
              strokeWidth={1}
              strokeOpacity={0.45}
            />
          ) : null,
        )}
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={`var(--color-${s.key})`}
            strokeWidth={1.8}
            strokeDasharray={s.dashed ? "5 3" : "0"}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        ))}
        <ChartTooltip
          cursor={{ stroke: "var(--bp-color-ink-20)" }}
          content={
            <ChartTooltipContent
              {...(tooltipLabel
                ? { labelFormatter: (label: unknown) => tooltipLabel(label as string | number) }
                : {})}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}
