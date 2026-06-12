import { ChartFrame } from "@/components/ChartFrame";
import { CorridorMap } from "@/components/CorridorMap";
import { DataAsOf } from "@/components/DataAsOf";
import {
  coverageLatestDataAsOf,
  coverageRows,
  coverageSummary,
} from "@/components/route/coverage-matrix";
import { routeMapHighlight } from "@/components/route/RouteMapSection";
import { routeDossierArchetype } from "@/components/route/route-archetype";
import {
  dossierMetricMonthCount,
  dossierMetricWindow,
  dossierSpeedSeries,
  formatCompact,
  routeVerdict,
} from "@/components/route/route-derived";
import {
  type RouteInsightMicroFigureKind,
  routeInsightCardSpec,
} from "@/components/route/route-insight-card";
import {
  routeInsightPlacements,
  safeInsightCaveats,
} from "@/components/route/route-insight-placement";
import {
  type RouteDetailTabValue,
  type RouteSectionRegistry,
  routeSectionCanNavigate,
} from "@/components/route/section-registry";
import { SectionHeader } from "@/components/SectionHeader";
import { SpeedTrend } from "@/components/SpeedTrend";
import { TreatmentBadgeRow } from "@/components/TreatmentBadge";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { StudioRouteDetailResponse, StudioRouteInsight } from "@/studio/api-contract";
import { routeTreatments } from "@/studio/treatment-model";

const SEGMENT_STRIP_BAR_CLASSES = [
  "h-[10px]",
  "h-[15px]",
  "h-[24px]",
  "h-[17px]",
  "h-[21px]",
  "h-[31px]",
  "h-[18px]",
  "h-[12px]",
] as const;

const SPARKLINE_BAR_CLASSES = [
  "h-[12px]",
  "h-[17px]",
  "h-[14px]",
  "h-[24px]",
  "h-[20px]",
  "h-[29px]",
] as const;

const TIMELINE_TICK_CLASSES = ["left-[10%]", "left-[37%]", "left-[64%]", "left-[88%]"] as const;

const COVERAGE_CHIP_CLASSES = ["w-8", "w-12", "w-7"] as const;

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
  const archetype = routeDossierArchetype({ capability: data.capability, dossier: data.dossier });
  const coverage = coverageRows(data.capability);
  const mapTarget = routeSectionCanNavigate(sectionRegistry, "map") ? "map" : "evidence";
  const manifestDataAsOf = coverageLatestDataAsOf(coverage);
  const overviewDataAsOf = data.dossier?.dataAsOf ?? manifestDataAsOf;
  const checkedCleanSurfaces = coverage.filter((surface) => surface.state === "checked_clean");
  const checkedThrough =
    coverageLatestDataAsOf(checkedCleanSurfaces) ?? data.dossier?.dataAsOf ?? null;
  const verdict = routeVerdict(route, data.dossier);

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-4">
        <SectionHeader
          title="Stands out"
          sub={coverageSummary(coverage)}
          right={<DataAsOf dataAsOf={overviewDataAsOf} />}
        />
        <VerdictSummary
          archetype={archetype}
          verdictLead={verdict.lead}
          speedPercentile={verdict.peerPercentile}
          speedDataAsOf={verdict.dataAsOf}
          slowestLabel={
            worst
              ? `${worst.label}: slowest for ${worst.persistenceMonths} mo.`
              : slowestByRiders
                ? `${slowestByRiders.from} to ${slowestByRiders.to}: top impact.`
                : "No rider row."
          }
        />
        {overviewInsights.length > 0 ? (
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
        ) : (
          <CheckedCleanCard
            checkedCount={checkedCleanSurfaces.length}
            checkedThrough={checkedThrough}
            onNavigate={() => onNavigate("evidence")}
          />
        )}
      </section>

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(320px,0.8fr)] gap-5 max-xl:grid-cols-1">
        <ChartFrame
          title="Story"
          source={hasSpeedHistory ? `Speed${speedWindow ? `, ${speedWindow}` : ""}.` : "Trend."}
          height={172}
          right={
            <Badge variant={verdict.speedMph < 6 ? "bad" : "warn"}>
              {hasSpeedHistory
                ? `${dossierMetricMonthCount(data.dossier?.speed) || speedTrendData.length} months`
                : `${verdict.speedMph.toFixed(1)} mph now`}
            </Badge>
          }
        >
          <SpeedTrend data={speedTrendData} scheduled={route.scheduledMph} height={172} legend />
        </ChartFrame>

        <section className="flex flex-col rounded-[3px] bg-[var(--bp-color-card)] p-[18px] shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <div className="mb-3.5 flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold tracking-[-0.005em]">Map</div>
              <div className="mt-[3px] text-[11px] text-[var(--bp-color-ink-55)]">Focus.</div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(mapTarget)}
              className="inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-[var(--bp-color-ink-20)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink)]"
            >
              View
            </button>
          </div>
          <div className="min-h-[172px]">
            <CorridorMap
              route={route}
              segments={segments}
              highlightId={mapHighlightSegment?.id}
              mode="mini"
            />
          </div>
        </section>
      </div>

      <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)] max-lg:grid-cols-1">
        <div>
          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            Verdict
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TreatmentBadgeRow treatments={treatments} max={6} />
            <Badge variant="neutral">{formatCompact(route.dailyRiders)} riders/day</Badge>
            <Badge variant={verdict.speedMph < 6 ? "bad" : "neutral"}>
              {verdict.speedMph.toFixed(1)} mph
            </Badge>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("evidence")}
          className="inline-flex w-fit items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-accent)] px-3 py-2 text-[12px] font-semibold text-[var(--bp-color-accent)]"
        >
          Evidence
        </button>
      </section>
    </div>
  );
}

function VerdictSummary({
  archetype,
  verdictLead,
  speedPercentile,
  speedDataAsOf,
  slowestLabel,
}: {
  archetype: ReturnType<typeof routeDossierArchetype>;
  verdictLead: string;
  speedPercentile: number | null;
  speedDataAsOf: string | null;
  slowestLabel: string;
}) {
  return (
    <div className="grid grid-cols-[4px_minmax(0,1fr)_auto] items-start gap-4 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)] max-lg:grid-cols-[4px_minmax(0,1fr)]">
      <div className="h-full rounded-[2px] bg-[var(--bp-color-ink)]" />
      <div>
        <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
          Summary
        </div>
        <p className="m-0 max-w-[980px] text-[13.5px] leading-[1.65] text-[var(--bp-color-ink)]">
          {verdictLead} {slowestLabel}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2 max-lg:col-start-2 max-lg:items-start">
        <Badge variant={archetype.badgeVariant}>{archetype.label}</Badge>
        <Badge variant={speedPercentile !== null && speedPercentile < 35 ? "bad" : "neutral"}>
          {speedPercentile === null ? "No rank" : `${Math.round(speedPercentile)}th pct speed`}
        </Badge>
        <DataAsOf dataAsOf={speedDataAsOf} />
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
    <article className="flex min-h-[224px] flex-col rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
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
      <InsightMicroFigure kind={spec.microFigureKind} severity={insight.severity} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <DataAsOf dataAsOf={insight.asOfMonth ?? insight.month ?? null} />
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

function InsightMicroFigure({
  kind,
  severity,
}: {
  kind: RouteInsightMicroFigureKind;
  severity: StudioRouteInsight["severity"];
}) {
  const toneClass = microFigureToneClass(severity);
  return (
    <div className="mt-3 h-[38px] rounded-[2px] bg-[var(--bp-color-ink-06)]">
      {kind === "timeline_tick" ? (
        <div className="relative h-full px-3 py-1.5">
          <span className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-[var(--bp-color-ink-20)]" />
          {TIMELINE_TICK_CLASSES.map((positionClass, index) => (
            <span
              key={positionClass}
              className={cn(
                "absolute top-1/2 size-2 -translate-y-1/2 rounded-full",
                positionClass,
                index === 2 ? toneClass : "bg-[var(--bp-color-ink-40)]",
              )}
            />
          ))}
        </div>
      ) : null}
      {kind === "coverage_chip" ? (
        <div className="flex h-full items-center gap-1.5 px-2">
          {COVERAGE_CHIP_CLASSES.map((widthClass, index) => (
            <span
              key={`${widthClass}:${index}`}
              className={cn(
                "h-3 rounded-[2px]",
                widthClass,
                index === 0 ? toneClass : "bg-[var(--bp-color-ink-20)]",
              )}
            />
          ))}
          <span className={cn("ml-auto size-2 rounded-full", toneClass)} />
        </div>
      ) : null}
      {kind === "segment_strip" ? (
        <div className="flex h-full items-end gap-1.5 px-2 py-1.5">
          {SEGMENT_STRIP_BAR_CLASSES.map((heightClass, index) => (
            <span
              key={`${heightClass}:${index}`}
              className={cn(
                "min-w-0 flex-1 rounded-[1px]",
                heightClass,
                index === 5 ? toneClass : "bg-[var(--bp-color-ink-20)]",
              )}
            />
          ))}
        </div>
      ) : null}
      {kind === "sparkline" ? (
        <div className="flex h-full items-end gap-1.5 px-2 py-1.5">
          {SPARKLINE_BAR_CLASSES.map((heightClass, index) => (
            <span
              key={`${heightClass}:${index}`}
              className={cn(
                "min-w-0 flex-1 rounded-[1px]",
                heightClass,
                index >= 3 ? toneClass : "bg-[var(--bp-color-ink-20)]",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function microFigureToneClass(severity: StudioRouteInsight["severity"]): string {
  switch (severity) {
    case "high":
      return "bg-[var(--bp-color-bad)]";
    case "medium":
      return "bg-[var(--bp-color-warn)]";
    case "low":
      return "bg-[var(--bp-color-accent)]";
  }
}

function CheckedCleanCard({
  checkedCount,
  checkedThrough,
  onNavigate,
}: {
  checkedCount: number;
  checkedThrough: string | null;
  onNavigate: () => void;
}) {
  const hasCleanSurface = checkedCount > 0;
  const surfaceLabel = checkedCount === 1 ? "surface" : "surfaces";
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-good)]">
        {hasCleanSurface ? "Checked clean" : "No flags"}
      </div>
      <p className="m-0 max-w-[760px] text-[13px] leading-[1.6] text-[var(--bp-color-ink)]">
        {hasCleanSurface
          ? `Through ${checkedThrough ?? "dossier"}: no flags. ${checkedCount} clean ${surfaceLabel}.`
          : "No flags yet. Evidence shows readiness."}
      </p>
      <button
        type="button"
        onClick={onNavigate}
        className="mt-3 inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink)]"
      >
        {hasCleanSurface ? "Checks" : "Evidence"}
      </button>
    </div>
  );
}
