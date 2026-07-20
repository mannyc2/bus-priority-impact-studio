import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendMarker } from "@/components/route/intervention-trend-model";
import type { TrendPoint } from "@/components/route/route-derived";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegendContent,
  type ChartLegendItem,
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
  height?: number;
  /** Series label shown in the tooltip + config. */
  seriesLabel?: string;
  /** Label next to the dashed baseline. */
  scheduledLabel?: string;
  tone?: string;
  /** Show the observed-line + scheduled-baseline key below the chart. */
  legend?: boolean;
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
  const observedRows = rows.filter((row) => row.value !== null && Number.isFinite(row.value));
  const hasObservedData = observedRows.length > 0;
  const domainValues = observedRows.map((row) => row.value as number);

  if (hasObservedData && input.scheduled !== undefined && Number.isFinite(input.scheduled)) {
    domainValues.push(input.scheduled);
  }

  const firstMonth = isCalendar ? rows[0]?.month : undefined;
  const lastMonth = isCalendar ? rows.at(-1)?.month : undefined;
  const ticks =
    firstMonth === undefined
      ? []
      : lastMonth === undefined || lastMonth === firstMonth
        ? [firstMonth]
        : [firstMonth, lastMonth];

  return {
    rows,
    xAxisDataKey: isCalendar ? "month" : "period",
    ticks,
    hasObservedData,
    yDomain: hasObservedData
      ? [Math.floor(Math.min(...domainValues) - 0.5), Math.ceil(Math.max(...domainValues) + 0.5)]
      : null,
    lastObservedPoint: observedRows.at(-1) ?? null,
    markers: isCalendar ? (input.markers ?? []) : [],
  };
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function monthLabel(value: string | number, monthNames: readonly string[]): string {
  if (typeof value !== "string") return String(value);
  const [year, rawMonth] = value.split("-");
  const month = Number(rawMonth);
  const monthName = monthNames[month - 1];
  return year && monthName ? `${monthName} ${year}` : value;
}

function markerSummary(markers: readonly TrendMarker[]): string {
  if (markers.length === 0) return "No intervention dates are marked.";

  const descriptions = markers.map((marker) => {
    const month = monthLabel(marker.month, LONG_MONTHS);
    return marker.count > 1
      ? `${month}, ${marker.count} occurrences: ${marker.label}`
      : `${month}: ${marker.label}`;
  });
  return `Intervention dates: ${descriptions.join("; ")}.`;
}

export function SpeedTrendChart({
  scheduled,
  height = 150,
  seriesLabel = "Speed (mph)",
  scheduledLabel = "scheduled",
  tone = "var(--bp-color-bad)",
  legend = false,
  markers,
  ...series
}: SpeedTrendProps) {
  const componentId = useId().replace(/:/g, "");
  const descriptionId = `speed-trend-description-${componentId}`;
  const gradientId = `speed-trend-fill-${componentId}`;
  const finiteScheduled =
    scheduled !== undefined && Number.isFinite(scheduled) ? scheduled : undefined;
  const model = buildSpeedTrendChartModel({
    ...series,
    ...(finiteScheduled === undefined ? {} : { scheduled: finiteScheduled }),
    ...(markers === undefined ? {} : { markers }),
  } as SpeedTrendChartModelInput);

  if (!model.hasObservedData || model.yDomain === null) {
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

  const last = model.lastObservedPoint;
  const lastX =
    last === null ? undefined : model.xAxisDataKey === "month" ? last.month : last.period;
  const config = { value: { label: seriesLabel, color: tone } } satisfies ChartConfig;

  const legendItems: ChartLegendItem[] = [
    { label: seriesLabel, shape: "line", color: tone },
    ...(finiteScheduled === undefined
      ? []
      : [{ label: scheduledLabel, shape: "dashed" as const, color: "var(--bp-color-ink-40)" }]),
  ];

  const chart = (
    <>
      <ChartContainer
        config={config}
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
            {...(model.xAxisDataKey === "month"
              ? {
                  ticks: [...model.ticks],
                  tickFormatter: (value: string | number) => monthLabel(value, SHORT_MONTHS),
                  interval: "preserveStartEnd" as const,
                }
              : { interval: 1 })}
          />
          <YAxis
            domain={[...model.yDomain]}
            width={34}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            allowDecimals={false}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--bp-color-ink-20)" }}
            content={
              <ChartTooltipContent
                hideLabel={model.xAxisDataKey === "period"}
                labelFormatter={(label) =>
                  typeof label === "string" ? monthLabel(label, SHORT_MONTHS) : label
                }
              />
            }
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
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          {last !== null && lastX !== undefined && last.value !== null ? (
            <ReferenceDot
              x={lastX}
              y={last.value}
              r={3.5}
              fill={tone}
              stroke="var(--bp-color-card)"
              strokeWidth={1.5}
            />
          ) : null}
        </ComposedChart>
      </ChartContainer>
      <span id={descriptionId} className="sr-only">
        {markerSummary(model.markers)}
      </span>
    </>
  );

  if (!legend) return chart;

  return (
    <div className="flex flex-col gap-1">
      {chart}
      <ChartLegendContent className="flex-wrap" items={legendItems} />
    </div>
  );
}
