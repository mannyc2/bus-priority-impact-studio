import { OverlayChart, type OverlaySeries } from "@/components/OverlayChart";
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
 * Routes have different segment counts, so each is resampled (linear) onto a
 * shared 0-100% "position along corridor" grid - that's what lets two different
 * corridors share one x-axis. Segments are taken in their given order (start ->
 * end). A solid, B dashed, gap shaded.
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

  return (
    <OverlayChart
      rows={rows}
      series={[seriesFor("a", a), { ...seriesFor("b", b), dashed: true }]}
      xKey="pos"
      grid
      xInterval={3}
      xTickFormatter={(pos) => `${pos}%`}
      tooltipLabel={(value) => `${value}% along corridor`}
      yDomain={[lo, hi]}
      yAllowDecimals={false}
      height={height}
    />
  );
}

function seriesFor(key: string, s: CorridorSeries): OverlaySeries {
  return {
    key,
    label: s.label,
    color: s.color,
    ...(s.scheduled !== undefined ? { baseline: s.scheduled } : {}),
  };
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
