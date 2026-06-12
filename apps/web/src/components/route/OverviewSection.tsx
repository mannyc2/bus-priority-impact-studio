import { ChartFrame } from "@/components/ChartFrame";
import { CorridorMap } from "@/components/CorridorMap";
import { RouteGeoMap } from "@/components/route/RouteGeoMap";
import { routeMapHighlight, useRouteSegmentsGeo } from "@/components/route/RouteMapSection";
import {
  dossierMetricMonthCount,
  dossierMetricWindow,
  dossierSpeedSeries,
  formatCompact,
  routeVerdict,
} from "@/components/route/route-derived";
import { routeInsightCardSpec } from "@/components/route/route-insight-card";
import {
  routeInsightPlacements,
  safeInsightCaveats,
} from "@/components/route/route-insight-placement";
import {
  type RouteDetailTabValue,
  type RouteSectionRegistry,
  routeSectionCanNavigate,
} from "@/components/route/section-registry";
import { SpeedTrend } from "@/components/SpeedTrend";
import { TreatmentBadgeRow } from "@/components/TreatmentBadge";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { StudioRouteDetailResponse, StudioRouteInsight } from "@/studio/api-contract";
import { routeTreatments } from "@/studio/treatment-model";

export function OverviewSection({
  data,
  sectionRegistry,
  onNavigate,
}: {
  data: StudioRouteDetailResponse;
  sectionRegistry: Pick<RouteSectionRegistry, "presentations">;
  onNavigate: (tab: RouteDetailTabValue) => void;
}) {
  const { route, segments } = data;
  const historySpeeds = dossierSpeedSeries(data.dossier);
  const hasSpeedHistory = historySpeeds.length > 0;
  const speedTrendData = hasSpeedHistory ? historySpeeds : route.spark;
  const speedWindow = dossierMetricWindow(data.dossier?.speed);
  const slowestByRiders = [...segments].sort((a, b) => b.riderHours - a.riderHours)[0] ?? null;
  const worst = data.dossier?.worstSegment ?? null;
  const mapHighlightSegment = routeMapHighlight(segments, data.insights).segment ?? slowestByRiders;
  const treatments = routeTreatments(route, segments);
  const overviewInsights = routeInsightPlacements(data.insights).overview;
  const mapTarget = routeSectionCanNavigate(sectionRegistry, "map") ? "map" : "evidence";
  const verdict = routeVerdict(route, data.dossier);
  const geo = useRouteSegmentsGeo(route.routeId);

  return (
    <div className="flex flex-col gap-7">
      <SummaryCard
        data={data}
        verdictSpeed={verdict.speedMph}
        peerPercentile={verdict.peerPercentile}
        worstLabel={
          worst
            ? `${worst.label} has been the slowest stretch for ${worst.persistenceMonths} months`
            : slowestByRiders
              ? `${slowestByRiders.from} to ${slowestByRiders.to} costs riders the most time`
              : null
        }
        treatments={treatments}
      />

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(320px,0.8fr)] gap-5 max-xl:grid-cols-1">
        <ChartFrame
          title="Speed history"
          source={
            hasSpeedHistory
              ? `Observed average speed${speedWindow ? `, ${speedWindow}` : ""}, vs. schedule.`
              : "Recent observed speed vs. schedule."
          }
          height={172}
          right={
            hasSpeedHistory ? (
              <Badge variant="neutral">
                {dossierMetricMonthCount(data.dossier?.speed) || speedTrendData.length} months
              </Badge>
            ) : undefined
          }
        >
          <SpeedTrend data={speedTrendData} scheduled={route.scheduledMph} height={172} legend />
        </ChartFrame>

        <section className="flex flex-col rounded-[3px] bg-[var(--bp-color-card)] p-[18px] shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <div className="mb-3.5 flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold tracking-[-0.005em]">Route map</div>
              <div className="mt-[3px] text-[11px] text-[var(--bp-color-ink-55)]">
                Observed speed by segment.
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(mapTarget)}
              className="inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-[var(--bp-color-ink-20)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink)]"
            >
              Full map →
            </button>
          </div>
          <div className="min-h-[172px]">
            {geo.status === "ready" ? (
              <RouteGeoMap collection={geo.collection} context={geo.context} variant="mini" />
            ) : geo.status === "loading" ? (
              <div
                className="h-[200px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]"
                aria-hidden
              />
            ) : (
              <CorridorMap
                route={route}
                segments={segments}
                highlightId={mapHighlightSegment?.id}
                mode="mini"
              />
            )}
          </div>
        </section>
      </div>

      {overviewInsights.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="m-0 text-[15px] font-semibold tracking-[-0.005em]">What stands out</h2>
          <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-1">
            {overviewInsights.map((insight) => (
              <InsightCard
                key={`${insight.detectorId}:${insight.scopeId ?? insight.title}`}
                insight={insight}
                routeSlug={route.slug}
                sectionRegistry={sectionRegistry}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SummaryCard({
  data,
  verdictSpeed,
  peerPercentile,
  worstLabel,
  treatments,
}: {
  data: StudioRouteDetailResponse;
  verdictSpeed: number;
  peerPercentile: number | null;
  worstLabel: string | null;
  treatments: ReturnType<typeof routeTreatments>;
}) {
  const { route } = data;
  const speed = data.dossier?.speed ?? null;
  const sentences: string[] = [];

  if (verdictSpeed > 0) {
    const schedule =
      route.scheduledMph > 0 ? ` against a ${route.scheduledMph.toFixed(1)} mph schedule` : "";
    sentences.push(`${route.label} runs ${verdictSpeed.toFixed(1)} mph${schedule}.`);
  }
  const movement = speed?.movement6mPct ?? null;
  if (movement !== null && Math.abs(movement) >= 0.05) {
    sentences.push(
      `Speed is ${movement < 0 ? "down" : "up"} ${Math.abs(movement).toFixed(1)}% over the past six months.`,
    );
  }
  if (peerPercentile !== null) {
    sentences.push(
      peerPercentile >= 50
        ? `It is faster than ${Math.round(peerPercentile)}% of comparable routes.`
        : `It is slower than ${Math.round(100 - peerPercentile)}% of comparable routes.`,
    );
  }
  if (worstLabel !== null) {
    sentences.push(`${worstLabel}.`);
  }

  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <p className="m-0 max-w-[980px] text-[14px] leading-[1.65] text-[var(--bp-color-ink)]">
        {sentences.length > 0 ? sentences.join(" ") : route.diagnosis}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TreatmentBadgeRow treatments={treatments} max={6} />
        {route.dailyRiders > 0 ? (
          <Badge variant="neutral">{formatCompact(route.dailyRiders)} riders/day</Badge>
        ) : null}
      </div>
    </div>
  );
}

function InsightCard({
  insight,
  routeSlug,
  sectionRegistry,
  onNavigate,
}: {
  insight: StudioRouteInsight;
  routeSlug: string;
  sectionRegistry: Pick<RouteSectionRegistry, "presentations">;
  onNavigate: (tab: RouteDetailTabValue) => void;
}) {
  const caveats = safeInsightCaveats(insight, 2);
  const spec = routeInsightCardSpec(insight);
  const target = routeSectionCanNavigate(sectionRegistry, spec.tab) ? spec.tab : "evidence";
  return (
    <article className="flex flex-col rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            {spec.detectorLabel}
          </div>
          <h3 className="m-0 mt-1 text-[14px] leading-[1.3]">{insight.title}</h3>
        </div>
        <Badge variant={insight.severity === "high" ? "bad" : "warn"}>{insight.severity}</Badge>
      </div>
      <p className="m-0 mt-3 flex-1 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
        {insight.shortText}
        {caveats.length > 0 ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                type="button"
                className="ml-2 inline-flex align-baseline text-[11.5px] font-semibold text-[var(--bp-color-accent)] underline decoration-dotted underline-offset-2"
              >
                Why
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-[280px]">
                <span className="leading-[1.45]">{caveats.join(" ")}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="neutral" className="max-w-full truncate">
            {spec.evidenceLabel}
          </Badge>
        </div>
        <button
          type="button"
          onClick={() => onNavigate(target)}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--bp-color-accent)]"
        >
          Open
        </button>
        <a
          href={`/briefs/new?route=${routeSlug}`}
          className="text-[11.5px] font-semibold text-[var(--bp-color-ink)]"
        >
          Brief
        </a>
      </div>
    </article>
  );
}
