import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegendContent,
  type ChartLegendItem,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export type SpeedTrendProps = {
  data: readonly number[];
  scheduled: number;
  height?: number;
  /** Series label shown in the tooltip + config. */
  seriesLabel?: string;
  /** Label next to the dashed baseline. */
  scheduledLabel?: string;
  tone?: string;
  /** Show the observed-line + scheduled-baseline key below the chart. */
  legend?: boolean;
};

export function SpeedTrendChart({
  data,
  scheduled,
  height = 150,
  seriesLabel = "Speed (mph)",
  scheduledLabel = "scheduled",
  tone = "var(--bp-color-bad)",
  legend = false,
}: SpeedTrendProps) {
  const rows = data.map((value, index) => ({ period: index + 1, value }));
  const lo = Math.floor(Math.min(...data, scheduled) - 0.5);
  const hi = Math.ceil(Math.max(...data, scheduled) + 0.5);
  const last = rows.at(-1);
  const config = { value: { label: seriesLabel, color: tone } } satisfies ChartConfig;

  const legendItems: ChartLegendItem[] = [
    { label: seriesLabel, shape: "line", color: tone },
    { label: scheduledLabel, shape: "dashed", color: "var(--bp-color-ink-40)" },
  ];

  const chart = (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <ComposedChart data={rows} margin={{ top: 14, right: 12, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="speed-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity={0.15} />
            <stop offset="100%" stopColor={tone} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} interval={1} />
        <YAxis
          domain={[lo, hi]}
          width={34}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--bp-color-ink-20)" }}
          content={<ChartTooltipContent hideLabel />}
        />
        <ReferenceLine
          y={scheduled}
          stroke="var(--bp-color-ink-40)"
          strokeDasharray="4 3"
          strokeWidth={1.25}
          label={{
            value: `${scheduledLabel} ${scheduled.toFixed(1)}`,
            position: "insideTopRight",
            fill: "var(--bp-color-ink-55)",
            fontSize: 10,
            fontWeight: 600,
          }}
        />
        <Area
          dataKey="value"
          stroke={tone}
          strokeWidth={2}
          fill="url(#speed-trend-fill)"
          dot={false}
          isAnimationActive={false}
        />
        {last ? (
          <ReferenceDot
            x={last.period}
            y={last.value}
            r={3.5}
            fill={tone}
            stroke="var(--bp-color-card)"
            strokeWidth={1.5}
          />
        ) : null}
      </ComposedChart>
    </ChartContainer>
  );

  if (!legend) return chart;

  return (
    <div className="flex flex-col gap-1">
      {chart}
      <ChartLegendContent className="flex-wrap" items={legendItems} />
    </div>
  );
}
