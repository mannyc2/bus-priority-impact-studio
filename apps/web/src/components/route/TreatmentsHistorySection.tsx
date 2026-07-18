import { type ReactNode, useEffect, useRef, useState } from "react";

import { routeInsightPlacements } from "@/components/route/route-insight-placement";
import { SectionCard } from "@/components/SectionCard";
import { citationEntries, SourceNote, type SourceNoteEntry } from "@/components/SourceNote";
import { DescriptiveStudyCard, StudyCard } from "@/components/study/StudyCard";
import { studiesByEventId } from "@/components/study/study-display";
import { TreatmentInventory } from "@/components/TreatmentBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { fetchStudioInterventionCorpus } from "@/studio/api-client";
import type {
  RouteStudiesArtifact,
  StudioIntervention,
  StudioInterventionCorpus,
  StudioInterventionCorpusRecord,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteEvidenceIntervention,
  StudioRouteEvidenceProject,
  StudioRouteEvidenceTimelineEvent,
  StudioRouteInsight,
  StudyArtifact,
} from "@/studio/api-contract";
import { countTreatmentStates, routeTreatments } from "@/studio/treatment-model";

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
  /** Matched-segment study for this event, when one exists (eventKey join). */
  study?: StudyArtifact;
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
  source: "serving" | "wiki" | "corpus";
  citationKeys: string[];
  sourceLabel: string | null;
  tone: Tone;
  /** Extra cited sources (corpus records merged into this row). */
  sourceEntries?: SourceNoteEntry[];
};

const TIMELINE_LIMIT = 10;
const DOCUMENTED_LIMIT = 8;

export function treatmentHistoryInsightRows(
  insights: readonly StudioRouteInsight[],
): StudioRouteInsight[] {
  return routeInsightPlacements(insights).timeline;
}

export function TreatmentsHistorySection({
  data,
  evidence,
  studies = null,
  studyKey,
}: {
  data: StudioRouteDetailResponse;
  evidence: StudioRouteEvidenceBundle | null;
  studies?: RouteStudiesArtifact | null;
  studyKey?: string | undefined;
}) {
  const { route, segments } = data;
  const treatments = routeTreatments(route, segments);
  const counts = countTreatmentStates(treatments);
  const comparisonCards = interventionComparisonCards(route.interventions, studies);
  const sourceRows = treatmentSourceRows(route.interventions);
  const corpus = useInterventionCorpus();
  const timelineRows = mergedTreatmentTimelineRows(
    route.interventions,
    evidence,
    routeCorpusRecords(corpus, route.routeId),
  );
  const treatmentInsights = treatmentHistoryInsightRows(data.insights);
  const recordEntries: SourceNoteEntry[] = [
    { label: `${timelineRows.length} dated records (${sourceRows.length} with named sources)` },
    ...sourceRows.map((row) => ({ label: row.label, detail: `${row.detail} (${row.year})` })),
  ];

  return (
    <div className="flex flex-col gap-7">
      <SectionCard
        title="What's on this route"
        sub={`${counts.inPlace} treatments in place, ${counts.planned} planned or proposed.`}
        right={<SourceNote label="About these records" entries={recordEntries} />}
      >
        <TreatmentInventory treatments={treatments} />
      </SectionCard>

      <SectionCard title="Timeline" sub="Documented changes on this route, newest first.">
        <TimelineList rows={timelineRows} evidence={evidence} insights={treatmentInsights} />
      </SectionCard>

      <DocumentedTreatments evidence={evidence} />

      <SectionCard title="Before & after evaluations" sub={comparisonCardsSubLine(comparisonCards)}>
        <ComparisonCards cards={comparisonCards} studyKey={studyKey} />
      </SectionCard>
    </div>
  );
}

export function mergedTreatmentTimelineRows(
  interventions: readonly StudioIntervention[],
  evidence: StudioRouteEvidenceBundle | null,
  corpusRecords: readonly StudioInterventionCorpusRecord[] = [],
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

  // Corpus records dedupe against existing rows by (year + treatment family):
  // the existing row wins and gains the corpus citation.
  const byYearFamily = new Map<string, TreatmentTimelineRow>();
  for (const row of rows.values()) {
    const family = treatmentFamilyOfText(`${row.kind} ${row.title}`);
    if (family === null) continue;
    const yearKey = `${timelineYearLabel(row.dateLabel)}:${family}`;
    if (!byYearFamily.has(yearKey)) byYearFamily.set(yearKey, row);
  }
  for (const record of corpusRecords) {
    if (record.effectiveDate === null) continue; // undated corpus records live on /interventions
    const row = corpusTimelineRow(record);
    const family = record.primaryTreatments[0] ?? treatmentFamilyOfText(`${row.kind} ${row.title}`);
    const existing =
      family === null
        ? undefined
        : byYearFamily.get(`${timelineYearLabel(row.dateLabel)}:${family}`);
    if (existing !== undefined) {
      existing.sourceEntries = [...(existing.sourceEntries ?? []), ...(row.sourceEntries ?? [])];
      continue;
    }
    rows.set(timelineIdentity(row), row);
  }

  return [...rows.values()].sort(treatmentTimelineSort);
}

/** Corpus record → timeline row (dateLabel honors datePrecision). */
export function corpusTimelineRow(record: StudioInterventionCorpusRecord): TreatmentTimelineRow {
  const date = record.effectiveDate ?? "undated";
  const dateLabel = record.datePrecision === "day" ? date : date.slice(0, 7);
  const corridor = record.corridorStreets.join(", ");
  const status = record.statusLatest ?? record.recordKind.replaceAll("_", " ");
  return {
    key: `corpus:${record.recordId}`,
    dateLabel,
    sortKey: record.effectiveDate ?? "9999",
    kind: record.primaryTreatments[0] ?? record.customTreatments[0] ?? "intervention",
    title: record.title,
    detail: `${status}${corridor.length > 0 ? ` — ${corridor}` : ""}`,
    source: "corpus",
    citationKeys: [],
    // The cited source renders via sourceEntries (label + link + record id).
    sourceLabel: null,
    tone: "accent",
    sourceEntries: [
      {
        label: record.sourceLabel,
        ...(record.sourceUrl === null ? {} : { href: record.sourceUrl }),
        detail: `${record.sourceId}; ${record.recordId}`,
      },
    ],
  };
}

/** Loose treatment-family read of a row's kind + title, for the corpus
 * dedupe heuristic only — never used for study or evidence joins. */
export function treatmentFamilyOfText(text: string): string | null {
  const haystack = text.toLowerCase();
  if (/\bbusway\b/.test(haystack)) return "busway";
  if (/\b(ace|able|camera|enforcement)\b/.test(haystack)) return "automated_bus_lane_enforcement";
  if (/\b(sbs|select bus)\b/.test(haystack)) return "select_bus_service";
  if (/\bsignal\b/.test(haystack)) return "transit_signal_priority";
  if (/\bredesign\b/.test(haystack)) return "route_redesign";
  if (/\bqueue jump\b/.test(haystack)) return "queue_jump";
  if (/\b(all[- ]door|boarding)\b/.test(haystack)) return "all_door_boarding";
  if (/\bfare\b/.test(haystack)) return "off_board_fare_collection";
  if (/\bstop\b/.test(haystack)) return "stop_change";
  if (/\bbus lane|lane\b/.test(haystack)) return "bus_lane";
  return null;
}

/** Corpus records mentioning this route (same normalization as /interventions). */
export function routeCorpusRecords(
  corpus: StudioInterventionCorpus | null,
  routeId: string,
): StudioInterventionCorpusRecord[] {
  const normalize = (value: string) =>
    value.trim().toUpperCase().replace(/-SBS$/, "").replace(/\+$/, "");
  const target = normalize(routeId);
  return (corpus?.records ?? []).filter((record) =>
    record.routes.some((candidate) => normalize(candidate) === target),
  );
}

/** In-component lazy fetch: the corpus is citywide and must not ride the
 * route loader (matches the route-detail-data artifact-fetch idiom). */
function useInterventionCorpus(): StudioInterventionCorpus | null {
  const [corpus, setCorpus] = useState<StudioInterventionCorpus | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchStudioInterventionCorpus({ signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setCorpus(data);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCorpus(null);
      });

    return () => controller.abort();
  }, []);

  return corpus;
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

export function timelineYearLabel(dateLabel: string): string {
  const year = dateLabel.match(/\b\d{4}\b/)?.[0];
  if (year) return year;
  return "Undated";
}

/** Display order for the timeline. The data-layer sort keeps a "9999"
 * sentinel for null-date wiki events, which sorts FIRST under the descending
 * order; render-side the Undated group always goes last. */
export function timelineDisplayRows(rows: readonly TreatmentTimelineRow[]): TreatmentTimelineRow[] {
  const dated = rows.filter((row) => timelineYearLabel(row.dateLabel) !== "Undated");
  const undated = rows.filter((row) => timelineYearLabel(row.dateLabel) === "Undated");
  return [...dated, ...undated];
}

function timelineKindLabel(kind: string): string {
  return kind === "serving_intervention" ? "program record" : kind.replaceAll("_", " ");
}

function TimelineList({
  rows,
  evidence,
  insights,
}: {
  rows: readonly TreatmentTimelineRow[];
  evidence: StudioRouteEvidenceBundle | null;
  insights: readonly StudioRouteInsight[];
}) {
  const [showAll, setShowAll] = useState(false);

  if (rows.length === 0) {
    return (
      <div className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4 text-[12.5px] text-[var(--bp-color-ink-55)]">
        No documented interventions or wiki timeline events on this route.
      </div>
    );
  }

  const ordered = timelineDisplayRows(rows);
  const visible = showAll ? ordered : ordered.slice(0, TIMELINE_LIMIT);
  const groups: { year: string; rows: TreatmentTimelineRow[] }[] = [];
  for (const row of visible) {
    const year = timelineYearLabel(row.dateLabel);
    const last = groups.at(-1);
    if (last && last.year === year) last.rows.push(row);
    else groups.push({ year, rows: [row] });
  }

  return (
    <div className="flex flex-col gap-4">
      {insights.length > 0 ? (
        <div className="flex flex-col gap-2">
          {insights.slice(0, 3).map((insight, index) => (
            <TimelineSignalRow
              key={`${insight.detectorId}:${insight.scopeId ?? insight.title}:${index}`}
              insight={insight}
            />
          ))}
        </div>
      ) : null}
      {groups.map((group) => (
        <div key={group.year}>
          <div className="border-b border-[var(--bp-color-rule)] pb-1 text-[13px] font-semibold">
            {group.year}
          </div>
          {group.rows.map((row) => (
            <TimelineRow key={row.key} row={row} evidence={evidence} />
          ))}
        </div>
      ))}
      {rows.length > TIMELINE_LIMIT ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="w-full rounded-[3px] px-3 py-2.5 text-[12px] font-semibold text-[var(--bp-color-ink-55)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)] transition-colors hover:text-[var(--bp-color-ink)]"
        >
          {showAll ? "Show fewer records" : `Show all ${rows.length} records`}
        </button>
      ) : null}
    </div>
  );
}

function TimelineSignalRow({ insight }: { insight: StudioRouteInsight }) {
  return (
    <div className="flex items-center gap-2 rounded-[3px] bg-[var(--bp-color-paper-deep)] px-3 py-2">
      <Badge variant={insight.severity === "high" ? "bad" : "warn"}>{insight.severity}</Badge>
      <span className="min-w-0 truncate text-[12.5px] font-semibold">{insight.title}</span>
    </div>
  );
}

function TimelineRow({
  row,
  evidence,
}: {
  row: TreatmentTimelineRow;
  evidence: StudioRouteEvidenceBundle | null;
}) {
  const undated = timelineYearLabel(row.dateLabel) === "Undated";
  const baseEntries =
    row.citationKeys.length > 0
      ? citationEntries(evidence, row.citationKeys)
      : row.sourceLabel !== null
        ? [{ label: row.sourceLabel }]
        : [];
  const entries = [...baseEntries, ...(row.sourceEntries ?? [])];

  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 py-2.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none">
      <div
        className={`pt-0.5 font-mono text-[11px] ${undated ? "text-[var(--bp-color-ink-40)]" : "text-[var(--bp-color-ink-70)]"}`}
      >
        {undated ? "Undated" : row.dateLabel}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{timelineKindLabel(row.kind)}</Badge>
          <span className="text-[13px] font-semibold leading-tight">{row.title}</span>
        </div>
        <div className="mt-1 line-clamp-2 text-[12px] leading-[1.45] text-[var(--bp-color-ink-55)]">
          {row.detail}
        </div>
        {entries.length > 0 ? (
          <div className="mt-1">
            <SourceNote entries={entries} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

type DocumentedRow = {
  key: string;
  chips: { label: string; variant: "accent" | "neutral" }[];
  title: string;
  detail: string;
  citationKeys: readonly string[];
};

function documentedTreatmentRows(evidence: StudioRouteEvidenceBundle | null): DocumentedRow[] {
  const interventions = evidence?.interventions ?? [];
  const projects = evidence?.projects ?? [];
  return [
    ...interventions.map((intervention): DocumentedRow => {
      const chips: DocumentedRow["chips"] = [
        { label: intervention.treatmentKind ?? "treatment", variant: "accent" },
      ];
      if (intervention.treatmentFamily) {
        chips.push({ label: intervention.treatmentFamily, variant: "neutral" });
      }
      return {
        key: intervention.recordId,
        chips,
        title: intervention.title ?? "Documented treatment",
        detail: wikiTreatmentDescription(intervention),
        citationKeys: intervention.citationKeys,
      };
    }),
    ...projects.map((project): DocumentedRow => {
      const chips: DocumentedRow["chips"] = [
        { label: project.projectType ?? "project", variant: "neutral" },
      ];
      if (project.status) chips.push({ label: project.status, variant: "accent" });
      return {
        key: project.recordId,
        chips,
        title: project.projectName ?? "Documented project",
        detail: wikiProjectDescription(project),
        citationKeys: project.citationKeys,
      };
    }),
  ];
}

function DocumentedTreatments({ evidence }: { evidence: StudioRouteEvidenceBundle | null }) {
  const [showAll, setShowAll] = useState(false);
  const rows = documentedTreatmentRows(evidence);
  if (rows.length === 0) return null;
  const visible = showAll ? rows : rows.slice(0, DOCUMENTED_LIMIT);

  return (
    <SectionCard
      title="Documented treatments"
      sub="Treatments and projects extracted from cited source documents."
    >
      <div className="flex flex-col gap-4">
        <div>
          {visible.map((row) => (
            <div
              key={row.key}
              className="py-2.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none"
            >
              <div className="flex flex-wrap items-center gap-2">
                {row.chips.map((chip) => (
                  <Badge key={chip.label} variant={chip.variant}>
                    {chip.label}
                  </Badge>
                ))}
                <span className="text-[13px] font-semibold leading-tight">{row.title}</span>
              </div>
              <div className="mt-1 line-clamp-2 text-[12px] leading-[1.45] text-[var(--bp-color-ink-55)]">
                {row.detail}
              </div>
              <div className="mt-1">
                <SourceNote entries={citationEntries(evidence, row.citationKeys)} />
              </div>
            </div>
          ))}
        </div>
        {rows.length > DOCUMENTED_LIMIT ? (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="w-full rounded-[3px] px-3 py-2.5 text-[12px] font-semibold text-[var(--bp-color-ink-55)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)] transition-colors hover:text-[var(--bp-color-ink)]"
          >
            {showAll ? "Show fewer records" : `Show all ${rows.length} records`}
          </button>
        ) : null}
      </div>
    </SectionCard>
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
  studies: RouteStudiesArtifact | null = null,
): TreatmentComparisonCard[] {
  const studyByEventId = studiesByEventId(studies);
  return events.flatMap((event) => {
    const cohort = event.comparisonCohort;
    if (cohort === undefined) return [];
    const study = event.eventId === undefined ? undefined : studyByEventId.get(event.eventId);
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
        ...(study === undefined ? {} : { study }),
      },
    ];
  });
}

export function comparisonCardsSubLine(cards: readonly TreatmentComparisonCard[]): string {
  if (cards.length === 0) return "Comparison windows promoted by the pipeline.";
  const studied = cards.filter((card) => card.study !== undefined).length;
  const evaluations = cards.length === 1 ? "1 evaluation" : `${cards.length} evaluations`;
  if (studied === 0) return `${cards.length} promoted comparison windows.`;
  return `${evaluations}, ${studied} with matched-segment ${studied === 1 ? "study" : "studies"}.`;
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

function ComparisonCards({
  cards,
  studyKey,
}: {
  cards: readonly TreatmentComparisonCard[];
  studyKey?: string | undefined;
}) {
  const studiedCount = cards.filter((card) => card.study !== undefined).length;
  let studiedIndex = -1;
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
      {cards.map((card) => {
        const study = card.study;
        // No-study cards render exactly as before the studies integration.
        if (study === undefined) {
          return (
            <div
              key={`${card.year}-${card.title}`}
              className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]"
            >
              <LegacyComparisonCardBody card={card} />
            </div>
          );
        }
        studiedIndex += 1;
        return (
          <ComparisonCardShell
            key={`${card.year}-${card.title}`}
            highlighted={study.eventKey === studyKey}
          >
            {study.claimTier === "descriptive" ? (
              <DescriptiveStudyCard title={card.title} study={study} />
            ) : (
              <StudyCard
                title={card.title}
                study={study}
                // Bounded presentation: past four studied cards, only the two
                // most recent render their chart eagerly.
                defaultChartVisible={studiedCount <= 4 || studiedIndex < 2}
              />
            )}
          </ComparisonCardShell>
        );
      })}
    </div>
  );
}

/** `?study=` deep-link target: scrolls into view and shows a temporary
 * accent ring using the existing focus-ring vocabulary. */
function ComparisonCardShell({
  highlighted,
  children,
}: {
  highlighted: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ringVisible, setRingVisible] = useState(false);
  useEffect(() => {
    if (!highlighted || ref.current === null) return;
    ref.current.scrollIntoView({ block: "center", behavior: "smooth" });
    setRingVisible(true);
    const timer = setTimeout(() => setRingVisible(false), 2600);
    return () => clearTimeout(timer);
  }, [highlighted]);
  return (
    <div
      ref={ref}
      className={`rounded-[3px] bg-[var(--bp-color-card)] p-4 transition-shadow duration-700 ${
        ringVisible
          ? "shadow-[0_0_0_1px_var(--bp-color-rule),0_0_0_3px_var(--bp-color-accent-bg),0_0_0_4px_var(--bp-color-accent)]"
          : "shadow-[0_0_0_1px_var(--bp-color-rule)]"
      }`}
    >
      {children}
    </div>
  );
}

function LegacyComparisonCardBody({ card }: { card: TreatmentComparisonCard }) {
  return (
    <>
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
    </>
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
  return `${pre} → ${post}`;
}
