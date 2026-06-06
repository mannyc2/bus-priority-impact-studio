import { Area, ComposedChart, Line, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type Series = {
  label: string;
  color: string;
  hours: readonly number[];
};

export type HourOverlayProps = {
  a: Series;
  b: Series;
  height?: number;
};

export function HourOverlayChart({ a, b, height = 180 }: HourOverlayProps) {
  const n = Math.min(a.hours.length, b.hours.length);
  if (n === 0) return null;

  const rows = Array.from({ length: n }, (_, hour) => {
    const av = Number((a.hours[hour] ?? 0).toFixed(1));
    const bv = Number((b.hours[hour] ?? 0).toFixed(1));
    return {
      hour: String(hour),
      a: av,
      b: bv,
      band: [Math.min(av, bv), Math.max(av, bv)] as [number, number],
    };
  });

  const config = {
    a: { label: a.label, color: a.color },
    b: { label: b.label, color: b.color },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <XAxis
          dataKey="hour"
          interval={3}
          tickFormatter={(hour) => `${hour}:00`}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis width={30} domain={[0, "auto"]} tickLine={false} axisLine={false} tickMargin={6} />
        {/* Band between the two series — excluded from tooltip/legend. */}
        <Area
          dataKey="band"
          stroke="none"
          fill="var(--bp-color-accent-bg)"
          fillOpacity={0.7}
          tooltipType="none"
          legendType="none"
          isAnimationActive={false}
        />
        <Line
          dataKey="a"
          name={a.label}
          stroke="var(--color-a)"
          strokeWidth={1.8}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="b"
          name={b.label}
          stroke="var(--color-b)"
          strokeWidth={1.8}
          strokeDasharray="5 3"
          dot={false}
          isAnimationActive={false}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--bp-color-ink-20)" }}
          content={<ChartTooltipContent labelFormatter={(value) => `${value}:00`} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}
