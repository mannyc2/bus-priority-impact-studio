import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export type CorridorPoint = { t: string; speed: number };

export type CorridorTrendProps = {
  data: readonly CorridorPoint[];
  /** Category value (x) where SBS service began. */
  launchAt: string;
  /** Pre-SBS baseline speed, drawn as a dashed reference line. */
  baseline: number;
  height?: number;
  width?: number;
};

const config = {
  speed: { label: "Bus speed (mph)", color: "var(--bp-color-ink)" },
} satisfies ChartConfig;

export function CorridorTrendChart({
  data,
  launchAt,
  baseline,
  height = 248,
  width = 560,
}: CorridorTrendProps) {
  const last = data.at(-1)?.t ?? launchAt;

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height, minWidth: width }}
    >
      <ComposedChart data={[...data]} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} />
        {/* Shade the post-launch "SBS active" window so the intervention reads at a glance. */}
        <ReferenceArea
          x1={launchAt}
          x2={last}
          fill="var(--bp-color-accent-bg)"
          fillOpacity={0.6}
          ifOverflow="extendDomain"
        />
        <XAxis
          dataKey="t"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
          minTickGap={20}
        />
        <YAxis
          width={34}
          domain={[Math.floor(baseline - 1), "auto"]}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
        />
        {/* Pre-SBS baseline. */}
        <ReferenceLine
          y={baseline}
          stroke="var(--bp-color-ink-40)"
          strokeDasharray="4 3"
          strokeWidth={1.25}
          label={{
            value: `baseline ${baseline.toFixed(1)}`,
            position: "insideTopLeft",
            fill: "var(--bp-color-ink-55)",
            fontSize: 10,
            fontWeight: 600,
          }}
        />
        {/* Service-launch marker. */}
        <ReferenceLine
          x={launchAt}
          stroke="var(--bp-color-accent)"
          strokeWidth={1.5}
          label={{
            value: "SBS launch",
            position: "top",
            fill: "var(--bp-color-accent)",
            fontSize: 10,
            fontWeight: 600,
          }}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--bp-color-ink-20)" }}
          content={<ChartTooltipContent />}
        />
        <Line
          dataKey="speed"
          name="Bus speed (mph)"
          stroke="var(--color-speed)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
