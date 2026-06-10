import { Bar, BarChart, Cell, XAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export type HourExposureProps = {
  data: readonly number[];
  height?: number;
};

const config = {
  value: { label: "Exposure", color: "var(--bp-color-ink-40)" },
} satisfies ChartConfig;

// AM (7–9) and PM (16–19) peak windows carry the highest rider-delay risk and
// are drawn in red; off-peak hours stay muted. Mirrors the prior hand-rolled SVG.
function isPeak(hour: number): boolean {
  return (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
}

export function HourExposureChart({ data, height = 112 }: HourExposureProps) {
  // Thread each bar's color into the datum as `fill` so the shared tooltip
  // swatch resolves it (item.payload.fill) and matches the bar.
  const rows = data.slice(0, 24).map((value, hour) => {
    const peak = isPeak(hour);
    return {
      hour: String(hour),
      value: Number(value.toFixed(2)),
      peak,
      fill: peak ? "var(--bp-color-bad)" : "var(--bp-color-ink-40)",
    };
  });

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart accessibilityLayer data={rows} margin={{ top: 12, right: 8, bottom: 4, left: 8 }}>
        <XAxis
          dataKey="hour"
          interval={5}
          tickFormatter={(hour) => `${hour}:00`}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent labelFormatter={(value) => `${value}:00`} />}
        />
        <Bar dataKey="value" radius={[1, 1, 0, 0]} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell key={row.hour} fill={row.fill} fillOpacity={row.peak ? 0.72 : 0.42} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
