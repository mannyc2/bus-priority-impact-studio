import { ChartFrame } from "@/components/ChartFrame";
import { CorridorProfile } from "@/components/CorridorProfile";
import { HourBars } from "@/components/HourBars";
import { RouteBadge } from "@/components/RouteBadge";
import { RouteVitalsCard } from "@/components/route/RouteVitalsCard";
import {
  averageHourlySpeed,
  dossierMetricMonthCount,
  dossierMetricWindow,
  dossierSpeedSeries,
} from "@/components/route/route-derived";
import {
  routeInsightPlacements,
  safeInsightCaveats,
} from "@/components/route/route-insight-placement";
import { SectionHeader } from "@/components/SectionHeader";
import { SpeedTrend } from "@/components/SpeedTrend";
import { TreatmentBadgeRow, TreatmentInventory } from "@/components/TreatmentBadge";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";
import { routeTreatments } from "@/studio/treatment-model";

export function OverviewSection({ data }: { data: StudioRouteDetailResponse }) {
  const { route, segments } = data;
  const historySpeeds = dossierSpeedSeries(data.dossier);
  const hasSpeedHistory = historySpeeds.length > 0;
  const slowest = [...segments].sort((a, b) => b.riderHours - a.riderHours)[0];
  const hourProfile = averageHourlySpeed(route, segments);
  const treatments = routeTreatments(route, segments);
  const overviewInsight = routeInsightPlacements(data.insights).overview[0] ?? null;
  const overviewCaveats = overviewInsight === null ? [] : safeInsightCaveats(overviewInsight, 2);
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
              : "No segment-level rider-impact row is available in this release."}
          </p>
          {overviewInsight ? (
            <div className="mt-3 flex max-w-[860px] items-start gap-2 border-t border-[var(--bp-color-rule)] pt-3">
              <span className="mt-[2px] shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-accent)]">
                Observed pattern
              </span>
              <p className="m-0 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
                {overviewInsight.shortText}
                {overviewCaveats.length > 0 ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        className="ml-2 inline-flex align-baseline text-[11.5px] font-semibold text-[var(--bp-color-accent)] underline decoration-dotted underline-offset-2"
                      >
                        Why
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="start" className="max-w-[280px]">
                        <span className="leading-[1.45]">{overviewCaveats.join(" ")}</span>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2 max-lg:col-start-2 max-lg:items-start">
          <RouteBadge route={route.label} sbs={route.sbs} size="md" />
          <TreatmentBadgeRow treatments={treatments} max={5} />
        </div>
      </div>

      <div className="rounded-[3px] bg-[var(--bp-color-card)] px-5 py-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <SectionHeader
          title="The corridor"
          sub="Average weekday speed for each segment. The dashed line is the schedule; the bars below show each segment's bus-priority treatments."
        />
        <CorridorProfile route={route} segments={segments} highlightId={slowest?.id} />
      </div>

      <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        <ChartFrame
          title={hasSpeedHistory ? "Multi-month speed history" : "Speed trend"}
          source={
            hasSpeedHistory
              ? `Monthly average speed${dossierMetricWindow(data.dossier?.speed) ? `, ${dossierMetricWindow(data.dossier?.speed)}` : ""}.`
              : "Recent trend estimate; the dashed line is the schedule."
          }
          height={150}
          right={
            <Badge variant={route.weightedAvgSpeed < 6 ? "bad" : "warn"}>
              {hasSpeedHistory
                ? `${dossierMetricMonthCount(data.dossier?.speed) || speedTrendData.length} months`
                : `${route.weightedAvgSpeed.toFixed(1)} mph now`}
            </Badge>
          }
        >
          <SpeedTrend data={speedTrendData} scheduled={route.scheduledMph} height={150} legend />
        </ChartFrame>
        <ChartFrame
          title="Speed by hour of day"
          source="Average speed by time of day."
          height={150}
        >
          <HourBars
            data={hourProfile}
            sched={route.scheduledMph}
            height={150}
            min={Math.max(0, Math.floor(Math.min(...hourProfile) - 1))}
            max={Math.ceil(Math.max(route.scheduledMph, ...hourProfile) + 1)}
            legend
          />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)] gap-5 max-xl:grid-cols-1">
        <div>
          <SectionHeader
            title="What's in place on this corridor"
            sub="Bus-priority treatments on this route, grouped by type."
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
