import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type TrendSeries = {
  label: string;
  color: string;
  data: readonly number[];
  /** Optional dashed baseline (e.g. scheduled speed) in the series color. */
  baseline?: number;
};

export type TrendOverlayProps = {
  a: TrendSeries;
  b: TrendSeries;
  height?: number;
};

/**
 * Two time-series overlaid on one period axis (A solid, B dashed) with the gap
 * between them shaded, mirroring HourOverlay. Used for speed-history and
 * ridership trends where both routes share the same x (history periods). Series
 * are aligned by index; missing points become gaps (connectNulls bridges them).
 */
export function TrendOverlayChart({ a, b, height = 180 }: TrendOverlayProps) {
  const n = Math.max(a.data.length, b.data.length);
  if (n === 0) return null;

  const rows = Array.from({ length: n }, (_, i) => {
    const av = a.data[i];
    const bv = b.data[i];
    return {
      period: i + 1,
      a: av ?? null,
      b: bv ?? null,
      band:
        av !== undefined && bv !== undefined
          ? ([Math.min(av, bv), Math.max(av, bv)] as [number, number])
          : undefined,
    };
  });

  const config = {
    a: { label: a.label, color: a.color },
    b: { label: b.label, color: b.color },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <ComposedChart data={rows} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          width={34}
          domain={["auto", "auto"]}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
        />
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
        {a.baseline !== undefined ? (
          <ReferenceLine
            y={a.baseline}
            stroke="var(--color-a)"
            strokeDasharray="3 3"
            strokeWidth={1}
            strokeOpacity={0.45}
          />
        ) : null}
        {b.baseline !== undefined ? (
          <ReferenceLine
            y={b.baseline}
            stroke="var(--color-b)"
            strokeDasharray="3 3"
            strokeWidth={1}
            strokeOpacity={0.45}
          />
        ) : null}
        <Line
          dataKey="a"
          name={a.label}
          stroke="var(--color-a)"
          strokeWidth={1.8}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          dataKey="b"
          name={b.label}
          stroke="var(--color-b)"
          strokeWidth={1.8}
          strokeDasharray="5 3"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--bp-color-ink-20)" }}
          content={<ChartTooltipContent labelFormatter={(value) => `Period ${value}`} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}
