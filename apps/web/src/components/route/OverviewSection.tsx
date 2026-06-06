import { ChartFrame } from "@/components/ChartFrame";
import { CorridorProfile } from "@/components/CorridorProfile";
import { HourBars } from "@/components/HourBars";
import { RouteBadge } from "@/components/RouteBadge";
import { RouteVitalsCard } from "@/components/route/RouteVitalsCard";
import {
  averageHourlySpeed,
  routeHistorySpeedSeries,
  routeHistoryWindow,
} from "@/components/route/route-derived";
import { SectionHeader } from "@/components/SectionHeader";
import { SpeedTrend } from "@/components/SpeedTrend";
import { TreatmentBadgeRow, TreatmentInventory } from "@/components/TreatmentBadge";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteDetailResponse, StudioRouteHistoryResponse } from "@/studio/api-contract";
import { routeTreatments } from "@/studio/treatment-model";

export function OverviewSection({
  data,
  history,
}: {
  data: StudioRouteDetailResponse;
  history: StudioRouteHistoryResponse | null;
}) {
  const { route, segments } = data;
  const historySpeeds = routeHistorySpeedSeries(history);
  const hasSpeedHistory = historySpeeds.length > 0;
  const slowest = [...segments].sort((a, b) => b.riderHours - a.riderHours)[0];
  const hourProfile = averageHourlySpeed(route, segments);
  const treatments = routeTreatments(route, segments);
  // Snapshot 2.0 can return partial route shells before rich segment artifacts exist.
  // Keep prototype panels mounted; downstream release gating decides when these values are public.
  const speedTrendData = hasSpeedHistory ? historySpeeds : route.spark;

  return (
    <div className="flex flex-col gap-7">
      <div className="grid grid-cols-[4px_minmax(0,1fr)_auto] items-start gap-4 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)] max-lg:grid-cols-[4px_minmax(0,1fr)]">
        <div className="h-full rounded-[2px] bg-[var(--bp-color-ink)]" />
        <div>
          <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            Route in one paragraph
          </div>
          <p className="m-0 max-w-[980px] text-[13.5px] leading-[1.65] text-[var(--bp-color-ink)]">
            {route.diagnosis}{" "}
            {slowest
              ? `${slowest.from} to ${slowest.to} is the highest rider-impact segment visible in this release at ${slowest.speedMph.toFixed(1)} mph and ${slowest.riderHours.toLocaleString()} rider-hours lost per day.`
              : "No segment-level rider-impact row is available in this release."}{" "}
            The corridor strip, slow-segment rows, and treatment inventory below expose the same
            facts used by briefs and findings.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 max-lg:col-start-2 max-lg:items-start">
          <RouteBadge route={route.label} sbs={route.sbs} size="md" />
          <TreatmentBadgeRow treatments={treatments} max={5} />
        </div>
      </div>

      <div>
        <SectionHeader
          title="The corridor"
          sub="Observed weekday bus speed across visible timepoint segments. The dashed line is scheduled speed; the rails show the segment-varying treatments available in this release."
        />
        <div className="rounded-[3px] bg-[var(--bp-color-card)] px-5 py-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <CorridorProfile route={route} segments={segments} highlightId={slowest?.id} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        <ChartFrame
          title={hasSpeedHistory ? "Multi-month speed history" : "Speed trend"}
          source={
            hasSpeedHistory
              ? `D1 route-month trend rows${routeHistoryWindow(history) ? `, ${routeHistoryWindow(history)}` : ""}.`
              : "Route sparkline from current Studio projection; dashed line is scheduled speed."
          }
          height={150}
          right={
            <Badge variant={route.weightedAvgSpeed < 6 ? "bad" : "warn"}>
              {hasSpeedHistory
                ? `${history?.coverage.speedMonthCount ?? speedTrendData.length} months`
                : `${route.weightedAvgSpeed.toFixed(1)} mph now`}
            </Badge>
          }
        >
          <SpeedTrend data={speedTrendData} scheduled={route.scheduledMph} height={150} />
        </ChartFrame>
        <ChartFrame
          title="Speed by hour of day"
          source="Derived from segment hourly severity and route weighted average."
          height={150}
        >
          <HourBars
            data={hourProfile}
            sched={route.scheduledMph}
            height={150}
            min={Math.max(0, Math.floor(Math.min(...hourProfile) - 1))}
            max={Math.ceil(Math.max(route.scheduledMph, ...hourProfile) + 1)}
          />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)] gap-5 max-xl:grid-cols-1">
        <div>
          <SectionHeader
            title="What's in place on this corridor"
            sub="Priority treatments grouped by family. Segment-varying treatments are also shown on the corridor strip and rows."
          />
          <TreatmentInventory treatments={treatments} />
        </div>
        <div>
          <SectionHeader title="Route vitals" sub="Service and geography." />
          <RouteVitalsCard route={route} segments={segments} />
        </div>
      </div>
    </div>
  );
}
