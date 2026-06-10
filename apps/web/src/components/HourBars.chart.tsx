import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  bandColor,
  type ChartBand,
  type ChartConfig,
  ChartContainer,
  ChartLegendContent,
  type ChartLegendItem,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export type HourBarsProps = {
  data: readonly number[];
  sched?: number;
  height?: number;
  min?: number;
  max?: number;
  /** Show the speed-band + scheduled key below the bars. */
  legend?: boolean;
};

const config = {
  value: { label: "Speed (mph)", color: "var(--bp-color-ink)" },
} satisfies ChartConfig;

// Tarbell severity thresholds — preserved from the prior hand-rolled SVG. Note
// the top tier is gray here (not the corridor's green); the legend below reads
// these same colors, so the two stay in sync by construction.
const SPEED_BANDS: ChartBand[] = [
  { label: "6.5+ mph", color: "var(--bp-color-ink-40)", test: (v) => v >= 6.5 },
  { label: "5–6.5 mph", color: "var(--bp-color-warn)", test: (v) => v >= 5 },
  { label: "< 5 mph", color: "var(--bp-color-bad)", test: () => true },
];

export function HourBarsChart({ data, sched, height = 200, min, max, legend }: HourBarsProps) {
  // Thread each bar's band color into the datum as `fill` so the shared tooltip
  // swatch resolves it (item.payload.fill) and matches the bar.
  const rows = data.slice(0, 24).map((value, hour) => {
    const v = Number(value.toFixed(1));
    return { hour: String(hour), value: v, fill: bandColor(SPEED_BANDS, v) };
  });
  const lo = min ?? Math.floor(Math.min(...data, sched ?? Number.POSITIVE_INFINITY) - 0.5);
  const hi = max ?? Math.ceil(Math.max(...data, sched ?? Number.NEGATIVE_INFINITY) + 0.5);

  const legendItems: ChartLegendItem[] = [
    ...SPEED_BANDS,
    ...(sched !== undefined
      ? [{ label: "scheduled", shape: "dashed" as const, color: "var(--bp-color-accent)" }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-1">
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <BarChart accessibilityLayer data={rows} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="hour"
            interval={5}
            tickFormatter={(hour) => `${hour}:00`}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            domain={[lo, hi]}
            width={34}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            allowDecimals={false}
          />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent labelFormatter={(value) => `${value}:00`} />}
          />
          {sched !== undefined ? (
            <ReferenceLine
              y={sched}
              stroke="var(--bp-color-accent)"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{
                value: `scheduled ${sched.toFixed(1)}`,
                position: "insideTopRight",
                fill: "var(--bp-color-accent)",
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          ) : null}
          <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.hour} fill={row.fill} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      {legend ? <ChartLegendContent className="flex-wrap" items={legendItems} /> : null}
    </div>
  );
}
