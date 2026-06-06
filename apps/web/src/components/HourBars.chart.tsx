import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export type HourBarsProps = {
  data: readonly number[];
  sched?: number;
  height?: number;
  min?: number;
  max?: number;
};

const config = {
  value: { label: "Speed (mph)", color: "var(--bp-color-ink)" },
} satisfies ChartConfig;

// Tarbell severity thresholds — preserved from the prior hand-rolled SVG.
function barColor(value: number): string {
  if (value < 5) return "var(--bp-color-bad)";
  if (value < 6.5) return "var(--bp-color-warn)";
  return "var(--bp-color-ink-40)";
}

export function HourBarsChart({ data, sched, height = 200, min, max }: HourBarsProps) {
  const rows = data
    .slice(0, 24)
    .map((value, hour) => ({ hour: String(hour), value: Number(value.toFixed(1)) }));
  const lo = min ?? Math.floor(Math.min(...data, sched ?? Number.POSITIVE_INFINITY) - 0.5);
  const hi = max ?? Math.ceil(Math.max(...data, sched ?? Number.NEGATIVE_INFINITY) + 0.5);

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height }}
    >
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
            <Cell key={row.hour} fill={barColor(row.value)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
