import { useId } from "react";
import { Area, CartesianGrid, ComposedChart, ReferenceLine, XAxis, YAxis } from "recharts";
import type { TrendMarker } from "@/components/route/intervention-trend-model";
import type { TrendPoint } from "@/components/route/route-derived";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export type SpeedTrendSeriesInput =
  | {
      /** Optional for compatibility with the existing number-vector callers. */
      mode?: "legacy";
      data: readonly number[];
      points?: never;
    }
  | { mode: "calendar"; points: readonly TrendPoint[]; data?: never };

type SpeedTrendOptions = {
  scheduled?: number | undefined;
  /** A string height (e.g. "100%") lets the chart fill a ChartFrame in fill mode. */
  height?: number | string;
  /** Series label shown in the tooltip + config. */
  seriesLabel?: string;
  /** Label next to the dashed baseline. */
  scheduledLabel?: string;
  tone?: string;
  markers?: readonly TrendMarker[];
};

export type SpeedTrendProps = SpeedTrendSeriesInput & SpeedTrendOptions;

export type SpeedTrendChartRow = {
  period?: number;
  month?: string;
  value: number | null;
};

export type SpeedTrendChartModel = {
  rows: readonly SpeedTrendChartRow[];
  xAxisDataKey: "period" | "month";
  ticks: readonly (number | string)[];
  hasObservedData: boolean;
  yDomain: readonly [number, number] | null;
  lastObservedPoint: SpeedTrendChartRow | null;
  markers: readonly TrendMarker[];
};

type SpeedTrendChartModelInput = SpeedTrendSeriesInput &
  Pick<SpeedTrendOptions, "markers" | "scheduled">;

export function buildSpeedTrendChartModel(input: SpeedTrendChartModelInput): SpeedTrendChartModel {
  const isCalendar = input.mode === "calendar";
  const rows: SpeedTrendChartRow[] = isCalendar
    ? input.points.map((point) => ({ month: point.month, value: point.value }))
    : input.data.map((value, index) => ({ period: index + 1, value }));
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  let lastObservedPoint: SpeedTrendChartRow | null = null;
  for (const row of rows) {
    if (!Number.isFinite(row.value)) continue;
    low = Math.min(low, row.value as number);
    high = Math.max(high, row.value as number);
    lastObservedPoint = row;
  }
  const hasObservedData = lastObservedPoint !== null;
  if (hasObservedData && Number.isFinite(input.scheduled)) {
    low = Math.min(low, input.scheduled as number);
    high = Math.max(high, input.scheduled as number);
  }
  const firstMonth = isCalendar ? rows[0]?.month : undefined;
  const lastMonth = isCalendar ? rows.at(-1)?.month : undefined;
  const ticks =
    firstMonth === undefined
      ? []
      : firstMonth === lastMonth
        ? [firstMonth]
        : [firstMonth, lastMonth as string];

  return {
    rows,
    xAxisDataKey: isCalendar ? "month" : "period",
    ticks,
    hasObservedData,
    yDomain: hasObservedData ? [Math.floor(low - 0.5), Math.ceil(high + 0.5)] : null,
    lastObservedPoint,
    markers: isCalendar ? (input.markers ?? []) : [],
  };
}

const MONTH_NAMES = "JanFebMarAprMayJunJulAugSepOctNovDec";

function monthLabel(value: string | number): string {
  if (typeof value !== "string") return String(value);
  const month = Number(value.slice(5)) - 1;
  const name = MONTH_NAMES.slice(month * 3, month * 3 + 3);
  return month >= 0 && month < 12 ? `${name} ${value.slice(0, 4)}` : value;
}

export function SpeedTrendChart({
  scheduled,
  height = 150,
  seriesLabel = "Speed (mph)",
  scheduledLabel = "scheduled",
  tone = "var(--bp-color-bad)",
  markers,
  ...series
}: SpeedTrendProps) {
  const componentId = useId().replace(/:/g, "");
  const descriptionId = `st-${componentId}`;
  const gradientId = `stf-${componentId}`;
  const finiteScheduled =
    scheduled !== undefined && Number.isFinite(scheduled) ? scheduled : undefined;
  const model = buildSpeedTrendChartModel({
    ...series,
    scheduled,
    markers,
  } as SpeedTrendChartModelInput);

  if (model.yDomain === null) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-[3px] bg-[var(--bp-color-paper-deep)] px-4 text-center text-[12.5px] text-[var(--bp-color-ink-55)]"
        style={{ height }}
        role="status"
      >
        No route speed history is attached yet.
      </div>
    );
  }

  const last = model.lastObservedPoint as SpeedTrendChartRow;
  const lastIndex = model.rows.indexOf(last);
  const calendar = model.xAxisDataKey === "month";

  return (
    <>
      <ChartContainer
        config={{ value: { label: seriesLabel, color: tone } } satisfies ChartConfig}
        className="aspect-auto w-full"
        style={{ height }}
        role="img"
        aria-label={seriesLabel}
        aria-describedby={descriptionId}
      >
        <ComposedChart data={model.rows} margin={{ top: 14, right: 12, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tone} stopOpacity={0.15} />
              <stop offset="100%" stopColor={tone} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey={model.xAxisDataKey}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            ticks={(calendar ? model.ticks : undefined) as (string | number)[]}
            tickFormatter={
              (calendar ? monthLabel : undefined) as (value: string | number) => string
            }
            interval={calendar ? "preserveStartEnd" : 1}
          />
          <YAxis
            domain={model.yDomain as [number, number]}
            width={34}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            allowDecimals={false}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--bp-color-ink-20)" }}
            content={<ChartTooltipContent hideLabel={!calendar} />}
          />
          {finiteScheduled === undefined ? null : (
            <ReferenceLine
              y={finiteScheduled}
              stroke="var(--bp-color-ink-40)"
              strokeDasharray="4 3"
              strokeWidth={1.25}
              label={{
                value: `${scheduledLabel} ${finiteScheduled.toFixed(1)}`,
                position: "insideTopRight",
                fill: "var(--bp-color-ink-55)",
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          )}
          {model.markers.map((marker) => (
            <ReferenceLine
              key={marker.month}
              x={marker.month}
              stroke="var(--bp-color-ink-40)"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: marker.label,
                position: "insideTopLeft",
                fill: "var(--bp-color-ink-70)",
                fontSize: 9.5,
              }}
            />
          ))}
          <Area
            dataKey="value"
            stroke={tone}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={(dot) =>
              dot.index === lastIndex ? (
                <circle
                  cx={dot.cx}
                  cy={dot.cy}
                  r={3.5}
                  fill={tone}
                  stroke="var(--bp-color-card)"
                  strokeWidth={1.5}
                />
              ) : null
            }
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
      <span id={descriptionId} className="sr-only">
        {model.markers.length === 0
          ? "No intervention dates are marked."
          : `Marked interventions: ${model.markers.map((marker) => marker.label).join("; ")}.`}
      </span>
    </>
  );
}
