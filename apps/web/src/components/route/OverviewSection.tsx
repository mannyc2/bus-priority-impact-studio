import { ChartFrame } from "@/components/ChartFrame";
import { CorridorMap } from "@/components/CorridorMap";
import { RouteGeoMap } from "@/components/route/RouteGeoMap";
import { RouteInsightList } from "@/components/route/RouteInsightList";
import {
  dossierMetricMonthCount,
  dossierMetricWindow,
  dossierSpeedSeries,
  formatCompact,
  routePerformanceSummary,
} from "@/components/route/route-derived";
import { useRouteSegmentsGeo } from "@/components/route/route-detail-data";
import type { RouteDetailSectionValue } from "@/components/route/section-registry";
import { SectionCard } from "@/components/SectionCard";
import { SpeedTrend } from "@/components/SpeedTrend";
import { TreatmentBadgeRow } from "@/components/TreatmentBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  RouteDossierSummaryForDetail,
  StudioRoute,
  StudioRouteDetailResponse,
} from "@/studio/api-contract";
import { routeTreatments } from "@/studio/treatment-model";

/**
 * The Overview tab: one plain-language route summary, the route's one plain
 * monthly speed-trend chart, a small locator map, and the ranked insight list.
 * This is the canonical home for each of those data families — the Slow
 * segments tab owns the analytical map, History owns the event timeline.
 */
export function OverviewSection({
  data,
  onNavigate,
}: {
  data: StudioRouteDetailResponse;
  onNavigate: (section: RouteDetailSectionValue) => void;
}) {
  const { route, segments } = data;
  const historySpeeds = dossierSpeedSeries(data.dossier);
  const hasSpeedHistory = historySpeeds.length > 0;
  const speedWindow = dossierMetricWindow(data.dossier?.speed);
  const slowestByRiders = [...segments].sort((a, b) => b.riderHours - a.riderHours)[0] ?? null;
  const worst = data.dossier?.worstSegment ?? null;
  const worstLabel = worst
    ? `${worst.label} has been the slowest stretch for ${worst.persistenceMonths} months`
    : slowestByRiders
      ? `${slowestByRiders.from} to ${slowestByRiders.to} costs riders the most time`
      : null;
  const treatments = routeTreatments(route, segments);
  const geo = useRouteSegmentsGeo(route.routeId);

  return (
    <div className="flex flex-col gap-7">
      <SectionCard title={`${route.label} at a glance`}>
        <p className="m-0 max-w-[980px] text-[14px] leading-[1.65] text-[var(--bp-color-ink)]">
          {overviewSummary(route, data.dossier, worstLabel)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TreatmentBadgeRow treatments={treatments} max={6} />
          {route.dailyRiders > 0 ? (
            <Badge variant="neutral">{formatCompact(route.dailyRiders)} riders/day</Badge>
          ) : null}
        </div>
      </SectionCard>

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(320px,0.8fr)] items-stretch gap-5 max-xl:grid-cols-1">
        <ChartFrame
          title="Speed history"
          source={
            hasSpeedHistory
              ? `Observed average speed${speedWindow ? `, ${speedWindow}` : ""}.`
              : "No route speed history is attached yet."
          }
          height={172}
          right={
            hasSpeedHistory ? (
              <Badge variant="neutral">
                {dossierMetricMonthCount(data.dossier?.speed) || historySpeeds.length} months
              </Badge>
            ) : undefined
          }
        >
          {hasSpeedHistory ? (
            <SpeedTrend
              data={historySpeeds}
              {...(route.scheduledMph === null ? {} : { scheduled: route.scheduledMph })}
              height={172}
              legend
            />
          ) : (
            <div className="flex h-full min-h-[172px] items-center justify-center rounded-[3px] bg-[var(--bp-color-paper-deep)] px-4 text-center text-[12.5px] text-[var(--bp-color-ink-55)]">
              No route speed history is attached yet.
            </div>
          )}
        </ChartFrame>

        <SectionCard
          title="Route map"
          sub="Observed speed by segment."
          right={
            <Button type="button" size="sm" variant="secondary" onClick={() => onNavigate("map")}>
              Explore route segments
            </Button>
          }
          bodyClassName="flex min-h-[172px] flex-1 flex-col"
        >
          {geo.status === "ready" ? (
            <RouteGeoMap collection={geo.collection} context={geo.context} variant="mini" />
          ) : geo.status === "loading" ? (
            <div
              className="h-[200px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]"
              aria-hidden
            />
          ) : (
            <CorridorMap route={route} segments={segments} mode="mini" />
          )}
        </SectionCard>
      </div>

      <RouteInsightList
        insights={data.insights}
        capability={data.capability}
        onNavigate={onNavigate}
      />
    </div>
  );
}

/**
 * The single surviving route-summary prose builder (the old public-lede atom
 * and this section's near-identical `SummaryCard` are gone). Sentences: speed
 * vs schedule; movement over six months; peer percentile; worst stretch.
 * Falls back to `route.diagnosis` only when every served part is missing.
 */
function overviewSummary(
  route: StudioRoute,
  dossier: RouteDossierSummaryForDetail | null,
  worstLabel: string | null,
): string {
  const performance = routePerformanceSummary(route, dossier);
  const sentences: string[] = [];

  if (performance.speedMph > 0) {
    const schedule =
      route.scheduledMph !== null && route.scheduledMph > 0
        ? ` against a ${route.scheduledMph.toFixed(1)} mph schedule`
        : "";
    sentences.push(`${route.label} runs ${performance.speedMph.toFixed(1)} mph${schedule}.`);
  }

  const movement = dossier?.speed.movement6mPct ?? null;
  if (movement !== null && Math.abs(movement) >= 0.05) {
    sentences.push(
      `Speed is ${movement < 0 ? "down" : "up"} ${Math.abs(movement).toFixed(1)}% over the past six months.`,
    );
  }

  if (performance.peerPercentile !== null) {
    sentences.push(
      performance.peerPercentile >= 50
        ? `It is faster than ${Math.round(performance.peerPercentile)}% of comparable routes.`
        : `It is slower than ${Math.round(100 - performance.peerPercentile)}% of comparable routes.`,
    );
  }

  if (worstLabel !== null) {
    sentences.push(`${worstLabel}.`);
  }

  return sentences.length > 0 ? sentences.join(" ") : route.diagnosis;
}
