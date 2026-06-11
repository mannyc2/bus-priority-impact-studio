import { CorridorOverlay } from "@/components/CorridorOverlay";
import { CompareRouteTag } from "@/components/route/compare/CompareRouteTag";
import { COMPARE_SERIES, seriesLabel } from "@/components/route/compare/series";
import type { CompareSides } from "@/components/route/compare/types";
import { formatCompact } from "@/components/route/route-derived";
import { SectionHeader } from "@/components/SectionHeader";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

export function SlowSegmentsCompareSection({ a, b }: CompareSides) {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <SectionHeader
          title="Corridor speed profile"
          sub="Observed speed along each corridor on a shared 0-100% position axis. Where the lines diverge is where one route is slower at the same point in its run."
        />
        <div className="rounded-[3px] bg-[var(--bp-color-card)] px-5 py-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <CorridorOverlay
            a={{
              label: seriesLabel(a.route),
              color: COMPARE_SERIES.a,
              segments: a.segments,
              scheduled: a.route.scheduledMph,
            }}
            b={{
              label: seriesLabel(b.route),
              color: COMPARE_SERIES.b,
              segments: b.segments,
              scheduled: b.route.scheduledMph,
            }}
          />
        </div>
      </div>

      <div>
        <SectionHeader
          title="Worst rider-impact segments"
          sub="Top segments by rider-hours lost per day, for each route."
        />
        <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
          <SlowList detail={a} color={COMPARE_SERIES.a} />
          <SlowList detail={b} color={COMPARE_SERIES.b} />
        </div>
      </div>
    </div>
  );
}

function SlowList({ detail, color }: { detail: StudioRouteDetailResponse; color: string }) {
  const top = [...detail.segments].sort((x, y) => y.riderHours - x.riderHours).slice(0, 5);
  const max = Math.max(...top.map((s) => s.riderHours), 1);
  return (
    <div>
      <div className="mb-2">
        <CompareRouteTag route={detail.route} color={color} />
      </div>
      <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <div className="grid grid-cols-[minmax(0,1fr)_56px_64px] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--bp-color-ink-40)] shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
          <span>Segment</span>
          <span className="text-right">mph</span>
          <span className="text-right">rh/day</span>
        </div>
        {top.length === 0 ? (
          <div className="px-4 py-3 text-[12px] text-[var(--bp-color-ink-55)]">
            No segment rows in this release.
          </div>
        ) : (
          top.map((seg) => (
            <div
              key={seg.id}
              className="grid grid-cols-[minmax(0,1fr)_56px_64px] items-center gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none"
            >
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium">
                  {seg.from} &rarr; {seg.to}
                </div>
                <div className="mt-1 h-1 rounded-full bg-[var(--bp-color-ink-06)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(seg.riderHours / max) * 100}%`, background: color }}
                  />
                </div>
              </div>
              <div
                className="text-right font-mono text-[12.5px] font-semibold tabular-nums"
                style={{ color: seg.speedMph < 5 ? "var(--bp-color-bad)" : "var(--bp-color-ink)" }}
              >
                {seg.speedMph.toFixed(1)}
              </div>
              <div className="text-right font-mono text-[12px] tabular-nums text-[var(--bp-color-ink-55)]">
                {formatCompact(seg.riderHours)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
