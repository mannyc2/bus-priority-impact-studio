import { ChartFrame } from "@/components/ChartFrame";
import { RPubInterventionCard } from "@/components/route/RoutePublicAtoms";
import {
  dossierMetricMonthCount,
  dossierMetricWindow,
  dossierSpeedSeries,
} from "@/components/route/route-derived";
import { routeInsightPlacements } from "@/components/route/route-insight-placement";
import { routeSectionTitle } from "@/components/route/section-registry";
import { SectionHeader } from "@/components/SectionHeader";
import { SpeedTrend } from "@/components/SpeedTrend";
import { TreatmentInventory } from "@/components/TreatmentBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type {
  StudioIntervention,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteEvidenceIntervention,
  StudioRouteEvidenceProject,
  StudioRouteEvidenceTimelineEvent,
  StudioRouteInsight,
} from "@/studio/api-contract";
import { countTreatmentStates, groupTreatments, routeTreatments } from "@/studio/treatment-model";
import { CitationChips } from "./WikiEvidence";

type Tone = NonNullable<StudioIntervention["tone"]>;
type ComparisonCohort = NonNullable<StudioIntervention["comparisonCohort"]>;

export type TreatmentComparisonCard = {
  title: string;
  year: string;
  tone: Tone;
  routeDeltaLabel: string;
  adjustedDeltaLabel: string;
  comparisonLabel: string;
  windowLabel: string;
  caveat: string;
};

export type TreatmentSourceRow = {
  key: string;
  label: string;
  detail: string;
  year: string;
};

export type TreatmentTimelineRow = {
  key: string;
  dateLabel: string;
  sortKey: string;
  kind: string;
  title: string;
  detail: string;
  source: "serving" | "wiki";
  citationKeys: string[];
  sourceLabel: string | null;
  tone: Tone;
};

export function treatmentHistoryInsightRows(
  insights: readonly StudioRouteInsight[],
): StudioRouteInsight[] {
  return routeInsightPlacements(insights).timeline;
}

export function TreatmentsHistorySection({
  data,
  evidence,
}: {
  data: StudioRouteDetailResponse;
  evidence: StudioRouteEvidenceBundle | null;
}) {
  const { route, segments } = data;
  const treatments = routeTreatments(route, segments);
  const counts = countTreatmentStates(treatments);
  const familyCount = [...groupTreatments(treatments).values()].filter(
    (items) => items.length > 0,
  ).length;
  const comparisonCards = interventionComparisonCards(route.interventions);
  const sourceRows = treatmentSourceRows(route.interventions);
  const timelineRows = mergedTreatmentTimelineRows(route.interventions, evidence);
  const treatmentInsights = treatmentHistoryInsightRows(data.insights);
  const historySpeeds = dossierSpeedSeries(data.dossier);
  const hasSpeedHistory = historySpeeds.length > 0;
  const speedTrendData = hasSpeedHistory ? historySpeeds : route.spark;
  const speedWindow = dossierMetricWindow(data.dossier?.speed);
  const currentSpeedMph = data.dossier?.speed.current ?? route.weightedAvgSpeed;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <SectionHeader
          title={routeSectionTitle("treatments")}
          sub="What is in place, proposed, and comparable."
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={comparisonCards.length > 0 ? "accent" : "neutral"}>
                {comparisonCards.length} evaluated
              </Badge>
              {treatmentInsights.length > 0 ? (
                <Badge variant="warn">{treatmentInsights.length} signals</Badge>
              ) : null}
            </div>
          }
        />
        <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <PostureStat
            label="Families"
            value={familyCount}
            sub={`${treatments.length} treatments`}
          />
          <PostureStat label="In place" value={counts.inPlace} sub="active or implemented" good />
          <PostureStat label="Planned" value={counts.planned} sub="planned/proposed" />
          <PostureStat
            label="Records"
            value={timelineRows.length}
            sub={`${sourceRows.length} with source labels`}
          />
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6 max-xl:grid-cols-1">
        <section>
          <SectionHeader
            title="In the record"
            sub={`Treatments on ${route.label}${route.sbs ? " SBS" : ""}, grouped by family/state.`}
          />
          <TreatmentInventory treatments={treatments} />
        </section>

        <section>
          <SectionHeader title="Document refs" sub="Labels on dated records." />
          <TreatmentSourceList rows={sourceRows} />
        </section>
      </div>
      <section>
        <SectionHeader
          title="Dated history"
          sub={`${timelineRows.length} cited and serving records on ${route.label}${route.sbs ? " SBS" : ""}. Use before reading speed.`}
        />
        <MergedTimelineList rows={timelineRows} evidence={evidence} />
      </section>

      <WikiTreatmentEvidence evidence={evidence} />

      <div className="grid grid-cols-[minmax(0,1fr)_420px] items-start gap-6 max-xl:grid-cols-1">
        <ChartFrame
          title={hasSpeedHistory ? "Speed history" : "Speed near changes"}
          source={
            hasSpeedHistory
              ? `Avg speed${speedWindow ? `, ${speedWindow}` : ""}.`
              : "Trend estimate."
          }
          height={196}
          right={
            <Badge variant={hasSpeedHistory ? "accent" : "warn"}>
              {hasSpeedHistory
                ? `${dossierMetricMonthCount(data.dossier?.speed) || speedTrendData.length} months`
                : `${currentSpeedMph.toFixed(1)} mph now`}
            </Badge>
          }
        >
          <SpeedTrend data={speedTrendData} scheduled={route.scheduledMph} height={196} />
        </ChartFrame>

        <section>
          <SectionHeader title="Evaluation cards" sub="Promoted comparison windows." />
          <ComparisonCards cards={comparisonCards} />
        </section>
      </div>
    </div>
  );
}

export function mergedTreatmentTimelineRows(
  interventions: readonly StudioIntervention[],
  evidence: StudioRouteEvidenceBundle | null,
): TreatmentTimelineRow[] {
  const rows = new Map<string, TreatmentTimelineRow>();
  for (const [index, event] of interventions.entries()) {
    const row: TreatmentTimelineRow = {
      key: `serving:${event.year}:${index}`,
      dateLabel: event.year,
      sortKey: event.year,
      kind: "serving_intervention",
      title: event.title,
      detail: event.detail,
      source: "serving",
      citationKeys: [],
      sourceLabel: event.sourceLabel ?? event.sourceDetail ?? null,
      tone: event.tone ?? "accent",
    };
    rows.set(timelineIdentity(row), row);
  }

  for (const event of evidence?.timeline ?? []) {
    if (event.citationKeys.length === 0) continue;
    const row = wikiTimelineRow(event);
    rows.set(timelineIdentity(row), row);
  }

  return [...rows.values()].sort(treatmentTimelineSort);
}

function timelineIdentity(row: TreatmentTimelineRow): string {
  return `${row.sortKey}:${row.kind}:${row.title}`.toLowerCase();
}

function wikiTimelineRow(event: StudioRouteEvidenceTimelineEvent): TreatmentTimelineRow {
  const title = event.title ?? event.eventKind ?? "Documented route event";
  return {
    key: `wiki:${event.recordId}`,
    dateLabel: event.dateNormalized ?? event.dateText ?? "undated",
    sortKey: event.dateNormalized ?? event.dateText ?? "9999",
    kind: event.eventKind ?? event.eventFamily ?? event.recordKind,
    title,
    detail: event.description ?? event.lifecyclePhase ?? "Wiki-derived route evidence.",
    source: "wiki",
    citationKeys: event.citationKeys,
    sourceLabel: "MTA-wiki",
    tone: wikiEventTone(event),
  };
}

function treatmentTimelineSort(left: TreatmentTimelineRow, right: TreatmentTimelineRow): number {
  const leftDated = isNormalizedDate(left.sortKey);
  const rightDated = isNormalizedDate(right.sortKey);
  if (leftDated && rightDated) {
    return right.sortKey.localeCompare(left.sortKey) || left.title.localeCompare(right.title);
  }
  if (leftDated !== rightDated) return leftDated ? -1 : 1;
  return left.dateLabel.localeCompare(right.dateLabel) || left.title.localeCompare(right.title);
}

function isNormalizedDate(value: string): boolean {
  return /^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(value);
}

function wikiEventTone(event: StudioRouteEvidenceTimelineEvent): Tone {
  const haystack = [
    event.lifecyclePhase,
    event.eventKind,
    event.eventFamily,
    event.recordKind,
    event.title,
  ]
    .filter((value): value is string => value !== null)
    .join(" ")
    .toLowerCase();
  if (/\b(complete|completed|open|opened|implemented|launch|launched)\b/.test(haystack)) {
    return "good";
  }
  if (/\b(plan|planned|proposal|proposed|future|scheduled)\b/.test(haystack)) return "accent";
  if (/\b(gap|unknown|missing|blocked|delayed)\b/.test(haystack)) return "warn";
  return "accent";
}

function MergedTimelineList({
  rows,
  evidence,
}: {
  rows: readonly TreatmentTimelineRow[];
  evidence: StudioRouteEvidenceBundle | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4 text-[12.5px] text-[var(--bp-color-ink-55)]">
        No documented interventions or wiki timeline events on this route.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 max-xl:grid-cols-1">
      {rows.map((row) => (
        <RPubInterventionCard
          key={row.key}
          dateLabel={row.dateLabel}
          yearLabel={timelineYearLabel(row.dateLabel)}
          kind={row.source === "wiki" ? row.kind : "serving"}
          title={row.title}
          detail={row.detail}
          tone={row.tone}
          sourceLabel={row.sourceLabel}
          citationKeys={row.citationKeys}
          evidence={evidence}
        />
      ))}
    </div>
  );
}

function timelineYearLabel(dateLabel: string): string {
  const year = dateLabel.match(/\b\d{4}\b/)?.[0];
  return year ?? dateLabel.slice(0, 4);
}

function WikiTreatmentEvidence({ evidence }: { evidence: StudioRouteEvidenceBundle | null }) {
  const interventions = evidence?.interventions ?? [];
  const projects = evidence?.projects ?? [];
  if (interventions.length === 0 && projects.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title="Wiki treatments"
        sub="Interventions and projects extracted from cited source documents."
        right={<Badge variant="accent">{interventions.length + projects.length} cited</Badge>}
      />
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        {interventions.map((intervention) => (
          <WikiTreatmentCard
            key={intervention.recordId}
            intervention={intervention}
            evidence={evidence}
          />
        ))}
        {projects.map((project) => (
          <WikiProjectCard key={project.recordId} project={project} evidence={evidence} />
        ))}
      </div>
    </section>
  );
}

function WikiTreatmentCard({
  intervention,
  evidence,
}: {
  intervention: StudioRouteEvidenceIntervention;
  evidence: StudioRouteEvidenceBundle | null;
}) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-2 flex flex-wrap gap-2">
        <Badge variant="accent">{intervention.treatmentKind ?? "treatment"}</Badge>
        {intervention.treatmentFamily ? (
          <Badge variant="neutral">{intervention.treatmentFamily}</Badge>
        ) : null}
      </div>
      <div className="text-[13px] font-semibold leading-tight">
        {intervention.title ?? "Documented treatment"}
      </div>
      <div className="mt-1 text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-70)]">
        {wikiTreatmentDescription(intervention)}
      </div>
      <div className="mt-3">
        <CitationChips evidence={evidence} citationKeys={intervention.citationKeys} />
      </div>
    </div>
  );
}

function WikiProjectCard({
  project,
  evidence,
}: {
  project: StudioRouteEvidenceProject;
  evidence: StudioRouteEvidenceBundle | null;
}) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-2 flex flex-wrap gap-2">
        <Badge variant="neutral">{project.projectType ?? "project"}</Badge>
        {project.status ? <Badge variant="accent">{project.status}</Badge> : null}
      </div>
      <div className="text-[13px] font-semibold leading-tight">
        {project.projectName ?? "Documented project"}
      </div>
      <div className="mt-1 text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-70)]">
        {wikiProjectDescription(project)}
      </div>
      <div className="mt-3">
        <CitationChips evidence={evidence} citationKeys={project.citationKeys} />
      </div>
    </div>
  );
}

function wikiTreatmentDescription(intervention: StudioRouteEvidenceIntervention): string {
  if (intervention.description !== null) return intervention.description;
  const locations = intervention.locations.join(", ");
  return locations.length > 0 ? locations : "Source-backed treatment.";
}

function wikiProjectDescription(project: StudioRouteEvidenceProject): string {
  return project.description ?? project.location ?? "Source-backed project.";
}

export function interventionComparisonCards(
  events: readonly StudioIntervention[],
): TreatmentComparisonCard[] {
  return events.flatMap((event) => {
    const cohort = event.comparisonCohort;
    if (cohort === undefined) return [];
    return [
      {
        title: event.title,
        year: event.year,
        tone: event.tone ?? toneForDelta(cohort.adjustedSpeedDeltaMph),
        routeDeltaLabel: signedMph(cohort.routeSpeedDeltaMph),
        adjustedDeltaLabel: signedMph(cohort.adjustedSpeedDeltaMph),
        comparisonLabel: cohort.routeCount === 1 ? "1 route" : `${cohort.routeCount} routes`,
        windowLabel: windowLabel(cohort.preWindow, cohort.postWindow),
        caveat: cohort.caveat,
      },
    ];
  });
}

export function treatmentSourceRows(events: readonly StudioIntervention[]): TreatmentSourceRow[] {
  const rows = new Map<string, TreatmentSourceRow>();
  for (const event of events) {
    const label = event.sourceLabel ?? event.sourceDetail;
    if (label === undefined) continue;
    const detail = event.sourceDetail ?? event.title;
    const key = `${label}:${detail}`;
    if (!rows.has(key)) rows.set(key, { key, label, detail, year: event.year });
  }
  return [...rows.values()];
}

function PostureStat({
  label,
  value,
  sub,
  good = false,
}: {
  label: string;
  value: number;
  sub: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
      <div
        className="mt-1 font-mono text-[24px] font-semibold leading-none"
        style={{ color: good ? "var(--bp-color-good)" : "var(--bp-color-ink)" }}
      >
        {value}
      </div>
      <div className="mt-1 text-[11.5px] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}

function TreatmentSourceList({ rows }: { rows: readonly TreatmentSourceRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 text-[12.5px] text-[var(--bp-color-ink-55)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
        No source-labeled records yet.
      </div>
    );
  }
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 px-4 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none"
        >
          <div className="font-mono text-[10.5px] font-semibold text-[var(--bp-color-accent)]">
            {row.year}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold">{row.label}</div>
            <div className="mt-0.5 text-[11px] leading-[1.4] text-[var(--bp-color-ink-55)]">
              {row.detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ComparisonCards({ cards }: { cards: readonly TreatmentComparisonCard[] }) {
  if (cards.length === 0) {
    return (
      <Alert variant="info">
        <AlertTitle variant="info">No window</AlertTitle>
        <AlertDescription>No before/after card yet.</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {cards.map((card) => (
        <div
          key={`${card.year}-${card.title}`}
          className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold leading-tight">{card.title}</div>
              <div className="mt-0.5 font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">
                {card.year} / {card.windowLabel}
              </div>
            </div>
            <Badge variant={card.tone}>{card.comparisonLabel}</Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <DeltaMetric label="route" value={card.routeDeltaLabel} tone={card.tone} />
            <DeltaMetric label="adjusted" value={card.adjustedDeltaLabel} tone={card.tone} />
          </div>
          <div className="mt-3 text-[11.5px] leading-[1.45] text-[var(--bp-color-ink-55)]">
            {card.caveat}
          </div>
        </div>
      ))}
    </div>
  );
}

function DeltaMetric({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-paper-deep)] px-3 py-2">
      <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
      <div className="mt-1 font-mono text-[18px] font-semibold" style={{ color: toneColor(tone) }}>
        {value}
      </div>
    </div>
  );
}

function signedMph(value: number | null): string {
  if (value === null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} mph`;
}

function toneForDelta(value: number | null): Tone {
  if (value === null) return "accent";
  if (value > 0.05) return "good";
  if (value < -0.05) return "bad";
  return "accent";
}

function toneColor(tone: Tone): string {
  if (tone === "good") return "var(--bp-color-good)";
  if (tone === "warn") return "var(--bp-color-warn)";
  if (tone === "bad") return "var(--bp-color-bad)";
  return "var(--bp-color-accent)";
}

function windowLabel(
  preWindow: ComparisonCohort["preWindow"],
  postWindow: ComparisonCohort["postWindow"],
): string {
  const pre = preWindow === null ? "pre missing" : `${preWindow.from} to ${preWindow.to}`;
  const post = postWindow === null ? "post missing" : `${postWindow.from} to ${postWindow.to}`;
  return `${pre} -> ${post}`;
}
