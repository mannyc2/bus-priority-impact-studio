import { OverlayChart, type OverlaySeries } from "@/components/OverlayChart";

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
 * shaded. Used for speed-history and ridership trends; aligned by index, missing
 * points become gaps (the engine bridges them).
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

  return (
    <OverlayChart
      rows={rows}
      series={[seriesFor("a", a), { ...seriesFor("b", b), dashed: true }]}
      xKey="period"
      grid
      tooltipLabel={(value) => `Period ${value}`}
      height={height}
    />
  );
}

function seriesFor(key: string, s: TrendSeries): OverlaySeries {
  return {
    key,
    label: s.label,
    color: s.color,
    ...(s.baseline !== undefined ? { baseline: s.baseline } : {}),
  };
}
