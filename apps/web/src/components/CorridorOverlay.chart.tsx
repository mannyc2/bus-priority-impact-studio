import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { StudioSegment } from "@/studio/api-contract";

type CorridorSeries = {
  label: string;
  color: string;
  segments: readonly StudioSegment[];
  /** Optional dashed scheduled-speed baseline in the series color. */
  scheduled?: number;
};

export type CorridorOverlayProps = {
  a: CorridorSeries;
  b: CorridorSeries;
  height?: number;
};

const GRID = 24;

/**
 * The two routes' observed speed along their corridor, overlaid on one axis.
 * The routes have different segment counts, so each is resampled (linear) onto a
 * shared 0-100% "position along corridor" grid - that's what lets two different
 * corridors share one x-axis. Segments are taken in their given order (start ->
 * end); only m15-sbs has a curated order elsewhere, close enough for the
 * normalized overlay. A solid, B dashed, gap shaded.
 */
export function CorridorOverlayChart({ a, b, height = 200 }: CorridorOverlayProps) {
  const pa = resampleSpeeds(a.segments);
  const pb = resampleSpeeds(b.segments);
  if (pa.length === 0 && pb.length === 0) return null;

  const rows = Array.from({ length: GRID + 1 }, (_, g) => {
    const av = pa[g];
    const bv = pb[g];
    return {
      pos: Math.round((g / GRID) * 100),
      a: av !== undefined ? Number(av.toFixed(1)) : null,
      b: bv !== undefined ? Number(bv.toFixed(1)) : null,
      band:
        av !== undefined && bv !== undefined
          ? ([Math.min(av, bv), Math.max(av, bv)] as [number, number])
          : undefined,
    };
  });

  const speeds = [
    ...pa,
    ...pb,
    ...(a.scheduled !== undefined ? [a.scheduled] : []),
    ...(b.scheduled !== undefined ? [b.scheduled] : []),
  ];
  const lo = Math.max(0, Math.floor(Math.min(...speeds) - 1));
  const hi = Math.ceil(Math.max(...speeds) + 1);

  const config = {
    a: { label: a.label, color: a.color },
    b: { label: b.label, color: b.color },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <ComposedChart data={rows} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="pos"
          interval={3}
          tickFormatter={(pos) => `${pos}%`}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          width={34}
          domain={[lo, hi]}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          allowDecimals={false}
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
        {a.scheduled !== undefined ? (
          <ReferenceLine
            y={a.scheduled}
            stroke="var(--color-a)"
            strokeDasharray="3 3"
            strokeWidth={1}
            strokeOpacity={0.45}
          />
        ) : null}
        {b.scheduled !== undefined ? (
          <ReferenceLine
            y={b.scheduled}
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
          content={<ChartTooltipContent labelFormatter={(value) => `${value}% along corridor`} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}

/** Resample a route's per-segment observed speeds onto GRID+1 evenly spaced points. */
function resampleSpeeds(segments: readonly StudioSegment[]): number[] {
  const obs = segments.map((s) => s.speedMph);
  if (obs.length === 0) return [];
  if (obs.length === 1) return Array.from({ length: GRID + 1 }, () => obs[0] as number);
  return Array.from({ length: GRID + 1 }, (_, g) => {
    const pos = (g / GRID) * (obs.length - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, obs.length - 1);
    const t = pos - i0;
    return (obs[i0] as number) * (1 - t) + (obs[i1] as number) * t;
  });
}
