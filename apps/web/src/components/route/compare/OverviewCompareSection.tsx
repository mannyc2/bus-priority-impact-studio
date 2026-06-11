import { ChartFrame } from "@/components/ChartFrame";
import { CorridorOverlay } from "@/components/CorridorOverlay";
import { HourOverlay } from "@/components/HourOverlay";
import { RouteBadge } from "@/components/RouteBadge";
import { CompareRouteTag } from "@/components/route/compare/CompareRouteTag";
import { compareSpeedSeries } from "@/components/route/compare/derived";
import { COMPARE_SERIES, seriesLabel } from "@/components/route/compare/series";
import type { CompareSides } from "@/components/route/compare/types";
import { RouteVitalsCard } from "@/components/route/RouteVitalsCard";
import { averageHourlySpeed } from "@/components/route/route-derived";
import { SectionHeader } from "@/components/SectionHeader";
import { TrendOverlay } from "@/components/TrendOverlay";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

export function OverviewCompareSection({ a, b, historyA, historyB }: CompareSides) {
  const ra = a.route;
  const rb = b.route;
  return (
    <div className="flex flex-col gap-7">
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <DiagnosisCard route={ra} />
        <DiagnosisCard route={rb} />
      </div>

      <div>
        <SectionHeader
          title="The corridor"
          sub="Observed weekday bus speed along each route, resampled onto a shared 0-100% position so the two corridors line up. Dashed lines are scheduled speed; the shaded band is the gap between routes."
        />
        <div className="rounded-[3px] bg-[var(--bp-color-card)] px-5 py-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <CorridorOverlay
            a={{
              label: seriesLabel(ra),
              color: COMPARE_SERIES.a,
              segments: a.segments,
              scheduled: ra.scheduledMph,
            }}
            b={{
              label: seriesLabel(rb),
              color: COMPARE_SERIES.b,
              segments: b.segments,
              scheduled: rb.scheduledMph,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        <ChartFrame
          title="Speed history"
          source="Monthly average speed for both routes, where available."
          height={180}
        >
          <TrendOverlay
            a={{
              label: seriesLabel(ra),
              color: COMPARE_SERIES.a,
              data: compareSpeedSeries(a, historyA),
              baseline: ra.scheduledMph,
            }}
            b={{
              label: seriesLabel(rb),
              color: COMPARE_SERIES.b,
              data: compareSpeedSeries(b, historyB),
              baseline: rb.scheduledMph,
            }}
            height={180}
          />
        </ChartFrame>
        <ChartFrame
          title="Speed by hour of day"
          source="Average speed by time of day, each route."
          height={180}
        >
          <HourOverlay
            a={{
              label: seriesLabel(ra),
              color: COMPARE_SERIES.a,
              hours: averageHourlySpeed(ra, a.segments),
            }}
            b={{
              label: seriesLabel(rb),
              color: COMPARE_SERIES.b,
              hours: averageHourlySpeed(rb, b.segments),
            }}
            height={180}
          />
        </ChartFrame>
      </div>

      <div>
        <SectionHeader title="Route vitals" sub="Service and geography, side by side." />
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <LabeledVitals detail={a} color={COMPARE_SERIES.a} />
          <LabeledVitals detail={b} color={COMPARE_SERIES.b} />
        </div>
      </div>
    </div>
  );
}

function DiagnosisCard({ route }: { route: StudioRouteDetailResponse["route"] }) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-2 flex items-center gap-2">
        <RouteBadge route={route.label} sbs={route.sbs} size="sm" />
        <span className="truncate text-[12.5px] font-semibold">{route.corridor}</span>
      </div>
      <p className="m-0 text-[12.5px] leading-[1.6] text-[var(--bp-color-ink-70)]">
        {route.diagnosis}
      </p>
    </div>
  );
}

function LabeledVitals({ detail, color }: { detail: StudioRouteDetailResponse; color: string }) {
  return (
    <div>
      <div className="mb-2">
        <CompareRouteTag route={detail.route} color={color} />
      </div>
      <RouteVitalsCard route={detail.route} segments={detail.segments} />
    </div>
  );
}
