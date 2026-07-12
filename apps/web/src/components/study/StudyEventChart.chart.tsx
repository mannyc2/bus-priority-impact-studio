import { Area, CartesianGrid, ComposedChart, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegendContent,
  type ChartLegendItem,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { studyMonthLabel } from "./study-display.js";

export type StudyEventChartPoint = {
  month: string;
  treatedMeanMph: number;
  controlMeanMph: number;
};

export type StudyEventChartProps = {
  series: readonly StudyEventChartPoint[];
  /** "YYYY-MM" the dashed implementation rule anchors to (nearest series month). */
  implementationMonth: string;
  implementationLabel: string;
  /** Optional warn-colored confounder marker (e.g. congestion pricing). */
  marker?: { month: string; label: string } | null;
  height?: number;
};

const TREATED_COLOR = "var(--bp-color-accent)";
const CONTROL_COLOR = "var(--bp-color-series-b)";

/** Nearest series month at or after the target, so reference rules land on a
 * real category even when the exact month is missing from the series. */
function nearestSeriesMonth(series: readonly StudyEventChartPoint[], month: string): string | null {
  return series.find((point) => point.month >= month)?.month ?? null;
}

export function StudyEventChart({
  series,
  implementationMonth,
  implementationLabel,
  marker = null,
  height = 200,
}: StudyEventChartProps) {
  const rows = series.map((point) => ({
    month: point.month,
    treated: point.treatedMeanMph,
    control: point.controlMeanMph,
  }));
  const values = series.flatMap((point) => [point.treatedMeanMph, point.controlMeanMph]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.22 || 0.2;
  const first = rows[0]?.month;
  const last = rows.at(-1)?.month;
  const implementationX = nearestSeriesMonth(series, implementationMonth);
  const markerX = marker === null ? null : nearestSeriesMonth(series, marker.month);

  const config = {
    treated: { label: "treated segments", color: TREATED_COLOR },
    control: { label: "matched controls", color: CONTROL_COLOR },
  } satisfies ChartConfig;
  const legendItems: ChartLegendItem[] = [
    { label: "treated segments", shape: "line", color: TREATED_COLOR },
    { label: "matched controls", shape: "line", color: CONTROL_COLOR },
  ];

  return (
    <div className="flex flex-col gap-1">
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <ComposedChart data={rows} margin={{ top: 14, right: 12, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="study-treated-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={TREATED_COLOR} stopOpacity={0.22} />
              <stop offset="95%" stopColor={TREATED_COLOR} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="study-control-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CONTROL_COLOR} stopOpacity={0.13} />
              <stop offset="95%" stopColor={CONTROL_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            ticks={first !== undefined && last !== undefined ? [first, last] : []}
            tickFormatter={studyMonthLabel}
            fontSize={10}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[lo - pad, hi + pad]}
            width={34}
            tickCount={3}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            fontSize={10}
            tickFormatter={(value: number) => value.toFixed(1)}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--bp-color-ink-20)" }}
            content={
              <ChartTooltipContent
                labelFormatter={(label) =>
                  typeof label === "string" ? studyMonthLabel(label) : label
                }
              />
            }
          />
          {implementationX === null ? null : (
            <ReferenceLine
              x={implementationX}
              stroke="var(--bp-color-ink-40)"
              strokeDasharray="3 3"
              label={{
                value: implementationLabel,
                position: "insideBottomLeft",
                fill: "var(--bp-color-ink-55)",
                fontSize: 9.5,
              }}
            />
          )}
          {markerX === null || marker === null ? null : (
            <ReferenceLine
              x={markerX}
              stroke="var(--bp-color-warn)"
              strokeDasharray="2 4"
              label={{
                value: marker.label,
                position: "insideTopLeft",
                fill: "var(--bp-color-warn)",
                fontSize: 9.5,
              }}
            />
          )}
          <Area
            dataKey="control"
            type="monotone"
            stroke={CONTROL_COLOR}
            strokeWidth={1.5}
            fill="url(#study-control-fill)"
            dot={false}
            isAnimationActive={false}
          />
          <Area
            dataKey="treated"
            type="monotone"
            stroke={TREATED_COLOR}
            strokeWidth={2}
            fill="url(#study-treated-fill)"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
      <ChartLegendContent className="flex-wrap justify-center" items={legendItems} />
    </div>
  );
}
