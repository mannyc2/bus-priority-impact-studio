import { ArrowRight } from "lucide-react";
import { ChartFrame } from "@/components/ChartFrame";
import { CorridorMap } from "@/components/CorridorMap";
import { DataAsOf } from "@/components/DataAsOf";
import type { RouteDetailTabValue } from "@/components/route/RouteDetailShell";
import { routeDossierArchetype } from "@/components/route/route-archetype";
import {
  dossierMetricMonthCount,
  dossierMetricWindow,
  dossierSpeedSeries,
  formatCompact,
} from "@/components/route/route-derived";
import {
  routeInsightPlacements,
  routeTabForInsight,
  safeInsightCaveats,
} from "@/components/route/route-insight-placement";
import { SectionHeader } from "@/components/SectionHeader";
import { SpeedTrend } from "@/components/SpeedTrend";
import { TreatmentBadgeRow } from "@/components/TreatmentBadge";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { StudioRouteDetailResponse, StudioRouteInsight } from "@/studio/api-contract";
import { routeTreatments } from "@/studio/treatment-model";

export function OverviewSection({
  data,
  onNavigate,
}: {
  data: StudioRouteDetailResponse;
  onNavigate: (tab: RouteDetailTabValue) => void;
}) {
  const { route, segments } = data;
  const historySpeeds = dossierSpeedSeries(data.dossier);
  const hasSpeedHistory = historySpeeds.length > 0;
  const speedTrendData = hasSpeedHistory ? historySpeeds : route.spark;
  const slowestByRiders = [...segments].sort((a, b) => b.riderHours - a.riderHours)[0] ?? null;
  const worst = data.dossier?.worstSegment ?? null;
  const flagged = segments.find((segment) => segment.flagged) ?? slowestByRiders;
  const treatments = routeTreatments(route, segments);
  const overviewInsights = routeInsightPlacements(data.insights).overview;
  const archetype = routeDossierArchetype({ capability: data.capability, dossier: data.dossier });
  const checkedCleanSurfaces = Object.values(data.capability?.surfaces ?? {}).filter(
    (surface) => surface.state === "checked_clean",
  );
  const checkedThrough =
    latestMonth(
      checkedCleanSurfaces.flatMap((surface) => (surface.dataAsOf ? [surface.dataAsOf] : [])),
    ) ??
    data.dossier?.dataAsOf ??
    null;

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-4">
        <SectionHeader
          title="What stands out"
          sub="Readiness-gated route signals, ordered by severity and grounded in the current dossier."
          right={<DataAsOf dataAsOf={data.dossier?.dataAsOf ?? null} />}
        />
        <VerdictSummary
          data={data}
          archetype={archetype}
          slowestLabel={
            worst
              ? `${worst.label} has been the slowest segment for ${worst.persistenceMonths} trailing month(s).`
              : slowestByRiders
                ? `${slowestByRiders.from} to ${slowestByRiders.to} is the highest rider-impact segment visible in this release.`
                : "No segment-level rider-impact row is available in this release."
          }
        />
        {overviewInsights.length > 0 ? (
          <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-1">
            {overviewInsights.map((insight) => (
              <InsightCard
                key={`${insight.detectorId}:${insight.scopeId ?? insight.title}`}
                insight={insight}
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
          title="Story strip"
          source={
            hasSpeedHistory
              ? `Monthly average speed${dossierMetricWindow(data.dossier?.speed) ? `, ${dossierMetricWindow(data.dossier?.speed)}` : ""}.`
              : "Recent trend estimate; the dashed line is the schedule."
          }
          height={172}
          right={
            <Badge variant={route.weightedAvgSpeed < 6 ? "bad" : "warn"}>
              {hasSpeedHistory
                ? `${dossierMetricMonthCount(data.dossier?.speed) || speedTrendData.length} months`
                : `${route.weightedAvgSpeed.toFixed(1)} mph now`}
            </Badge>
          }
        >
          <SpeedTrend data={speedTrendData} scheduled={route.scheduledMph} height={172} legend />
        </ChartFrame>

        <section className="flex flex-col rounded-[3px] bg-[var(--bp-color-card)] p-[18px] shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <div className="mb-3.5 flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold tracking-[-0.005em]">Mini-map</div>
              <div className="mt-[3px] text-[11px] text-[var(--bp-color-ink-55)]">
                Flagged segment and visible treatment coverage.
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("map")}
              className="inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-[var(--bp-color-ink-20)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink)]"
            >
              Map
              <ArrowRight size={13} />
            </button>
          </div>
          <div className="min-h-[172px]">
            <CorridorMap route={route} segments={segments} highlightId={flagged?.id} mode="mini" />
          </div>
        </section>
      </div>

      <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)] max-lg:grid-cols-1">
        <div>
          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            Verdict footer
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TreatmentBadgeRow treatments={treatments} max={6} />
            <Badge variant="neutral">{formatCompact(route.dailyRiders)} weekday riders</Badge>
            <Badge variant={route.weightedAvgSpeed < 6 ? "bad" : "neutral"}>
              {route.weightedAvgSpeed.toFixed(1)} mph
            </Badge>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("evidence")}
          className="inline-flex w-fit items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-accent)] px-3 py-2 text-[12px] font-semibold text-[var(--bp-color-accent)]"
        >
          What we checked
          <ArrowRight size={14} />
        </button>
      </section>
    </div>
  );
}

function VerdictSummary({
  data,
  archetype,
  slowestLabel,
}: {
  data: StudioRouteDetailResponse;
  archetype: ReturnType<typeof routeDossierArchetype>;
  slowestLabel: string;
}) {
  const { route } = data;
  return (
    <div className="grid grid-cols-[4px_minmax(0,1fr)_auto] items-start gap-4 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)] max-lg:grid-cols-[4px_minmax(0,1fr)]">
      <div className="h-full rounded-[2px] bg-[var(--bp-color-ink)]" />
      <div>
        <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
          Route in one paragraph
        </div>
        <p className="m-0 max-w-[980px] text-[13.5px] leading-[1.65] text-[var(--bp-color-ink)]">
          {route.diagnosis} {slowestLabel}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2 max-lg:col-start-2 max-lg:items-start">
        <Badge variant={archetype.badgeVariant}>{archetype.label}</Badge>
        <Badge variant={route.speedPercentile < 35 ? "bad" : "neutral"}>
          {Math.round(route.speedPercentile)}th pct speed
        </Badge>
        <DataAsOf dataAsOf={data.dossier?.speed.dataAsOf ?? null} />
      </div>
    </div>
  );
}

function InsightCard({
  insight,
  onNavigate,
}: {
  insight: StudioRouteInsight;
  onNavigate: (tab: RouteDetailTabValue) => void;
}) {
  const caveats = safeInsightCaveats(insight, 2);
  const tab = routeTabForInsight(insight);
  return (
    <article className="flex min-h-[178px] flex-col rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            {insight.detectorId.replaceAll("_", " ")}
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
      <div className="mt-4 flex items-center justify-between gap-3">
        <DataAsOf dataAsOf={insight.asOfMonth ?? insight.month ?? null} />
        <button
          type="button"
          onClick={() => onNavigate(tab)}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--bp-color-accent)]"
        >
          Open {tabLabel(tab)}
          <ArrowRight size={13} />
        </button>
      </div>
    </article>
  );
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
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-good)]">
        Checked clean
      </div>
      <p className="m-0 max-w-[760px] text-[13px] leading-[1.6] text-[var(--bp-color-ink)]">
        Checked through {checkedThrough ?? "the current dossier"}: no ranked overview flags are
        published for this route. {checkedCount} checked-clean surface(s) are listed in Evidence.
      </p>
      <button
        type="button"
        onClick={onNavigate}
        className="mt-3 inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink)]"
      >
        Open Evidence
        <ArrowRight size={13} />
      </button>
    </div>
  );
}

function tabLabel(tab: RouteDetailTabValue): string {
  switch (tab) {
    case "where-when":
      return "Where & when";
    case "treatments":
      return "Treatments";
    default:
      return tab[0]?.toUpperCase() + tab.slice(1);
  }
}

function latestMonth(months: readonly string[]): string | null {
  return months.length === 0 ? null : ([...months].sort().at(-1) ?? null);
}
