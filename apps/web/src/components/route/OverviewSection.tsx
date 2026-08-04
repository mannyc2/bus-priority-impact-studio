import { ChartFrame } from "@/components/ChartFrame";
import { routeSpeedInterventionTrend } from "@/components/route/intervention-trend-model";
import { RouteInsightList } from "@/components/route/RouteInsightList";
import { RouteSegmentMapCard } from "@/components/route/RouteSegmentMapCard";
import {
  dossierSpeedPoints,
  formatCompact,
  routePerformanceSummary,
} from "@/components/route/route-derived";
import { routeInterventionViewModel } from "@/components/route/route-intervention-model";
import type { RouteDetailSearch } from "@/components/route/route-segment-explorer";
import type { RouteDetailSectionValue } from "@/components/route/section-registry";
import { SectionCard } from "@/components/SectionCard";
import { SpeedTrend } from "@/components/SpeedTrend";
import { TreatmentBadgeRow } from "@/components/TreatmentBadge";
import { Badge } from "@/components/ui/badge";
import type {
  RouteDossierSummaryForDetail,
  RouteStudiesArtifact,
  StudioRoute,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionObservationBundle,
} from "@/studio/api-contract";

const OVERVIEW_INTERVENTION_MARKER_CAP = 4;

/**
 * The Overview tab: one plain-language route summary, the route's one monthly
 * speed-trend chart, the route's ONE map, and the ranked insight list. Plan 126
 * moved the interactive map here from the Slow-segments tab, which had been
 * drawing the same segment speeds a second time; that tab kept the ranked list.
 * History still owns the event timeline.
 */
export function OverviewSection({
  data,
  search,
  onSearchChange,
  evidence = null,
  inventory = null,
  observations = null,
  studies = null,
  onNavigate,
}: {
  data: StudioRouteDetailResponse;
  search: RouteDetailSearch;
  onSearchChange: (search: RouteDetailSearch, replace: boolean) => void;
  evidence?: StudioRouteEvidenceBundle | null;
  inventory?: StudioRouteInterventionInventoryBundle | null;
  observations?: StudioRouteInterventionObservationBundle | null;
  studies?: RouteStudiesArtifact | null;
  onNavigate: (section: RouteDetailSectionValue) => void;
}) {
  const { route, segments } = data;
  const dossierPoints = dossierSpeedPoints(data.dossier);
  const speedTrend = routeSpeedInterventionTrend(
    observations,
    inventory,
    dossierPoints,
    OVERVIEW_INTERVENTION_MARKER_CAP,
  );
  const hasSpeedHistory = speedTrend.points.some(
    (point) => point.value !== null && Number.isFinite(point.value),
  );
  const slowestByRiders = [...segments].sort((a, b) => b.riderHours - a.riderHours)[0] ?? null;
  const worst = data.dossier?.worstSegment ?? null;
  const worstLabel = worst
    ? `${worst.label} has been the slowest stretch for ${worst.persistenceMonths} months`
    : slowestByRiders
      ? `${slowestByRiders.from} to ${slowestByRiders.to} costs riders the most time`
      : null;
  const interventionModel = routeInterventionViewModel(inventory);
  const treatments = interventionModel.treatments.filter(
    (row) => row.treatment.lifecycleState !== "historical_confirmed",
  );

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
        {interventionModel.coverage.message === null ? null : (
          <p className="mt-3 text-[11.5px] text-[var(--bp-color-ink-55)]" role="status">
            {interventionModel.coverage.message}
          </p>
        )}
      </SectionCard>

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(320px,0.8fr)] items-stretch gap-5 max-xl:grid-cols-1">
        <ChartFrame
          title="Speed history"
          source={
            hasSpeedHistory
              ? speedTrend.methodLimitation === null
                ? "Monthly observed average speed."
                : speedTrend.seriesLabel
              : "No route speed history is attached yet."
          }
          height={172}
          fill
          right={
            hasSpeedHistory ? (
              <Badge variant="neutral">{speedTrend.points.length} months</Badge>
            ) : undefined
          }
        >
          {hasSpeedHistory ? (
            <>
              {/* Fills the card instead of leaving dead space beneath a fixed
                  172px body — the row is height-matched to the map card. */}
              <div className="min-h-[172px] flex-1">
                <SpeedTrend
                  mode="calendar"
                  points={speedTrend.points}
                  markers={speedTrend.markers}
                  {...(route.scheduledMph === null ? {} : { scheduled: route.scheduledMph })}
                  height="100%"
                  seriesLabel={speedTrend.seriesLabel}
                />
              </div>
              {speedTrend.methodLimitation === null ? null : (
                <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--bp-color-ink-55)]">
                  {speedTrend.methodLimitation}
                </p>
              )}
            </>
          ) : (
            <div className="flex min-h-[172px] flex-1 items-center justify-center rounded-[3px] bg-[var(--bp-color-paper-deep)] px-4 text-center text-[12.5px] text-[var(--bp-color-ink-55)]">
              No route speed history is attached yet.
            </div>
          )}
        </ChartFrame>

        <RouteSegmentMapCard
          data={data}
          search={search}
          onSearchChange={onSearchChange}
          evidence={evidence}
          inventory={inventory}
          studies={studies}
          onExploreSegments={() => onNavigate("where-when")}
        />
      </div>

      <RouteInsightList insights={data.insights} onNavigate={onNavigate} />
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

  /* The speed scalar is stated by the header stat and the ranked segment
     list. Saying it a third time in prose made the page contradict itself
     when the sources disagreed. */

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
