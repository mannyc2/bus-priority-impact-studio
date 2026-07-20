import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { routeInsightPlacements } from "@/components/route/route-insight-placement";
import {
  type RouteInterventionViewModel,
  routeInterventionViewModel,
  type RouteInterventionTimelineRow as TypedOccurrenceRow,
  treatmentRecordAnchorId,
} from "@/components/route/route-intervention-model";
import { SectionCard } from "@/components/SectionCard";
import { citationEntries, SourceNote, type SourceNoteEntry } from "@/components/SourceNote";
import { DescriptiveStudyCard, StudyCard } from "@/components/study/StudyCard";
import { studiesByEventId } from "@/components/study/study-display";
import { TreatmentInventory } from "@/components/TreatmentBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type {
  RouteStudiesArtifact,
  StudioIntervention,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteEvidenceProject,
  StudioRouteEvidenceTimelineEvent,
  StudioRouteInsight,
  StudioRouteInterventionInventoryBundle,
  StudyArtifact,
} from "@/studio/api-contract";

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
  source: "serving" | "wiki" | "inventory";
  recordId: string;
  citationKeys: string[];
  sourceLabel: string | null;
  tone: Tone;
  /** Extra source labels merged through stable relationship IDs. */
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
  inventory = null,
  studies = null,
  studyKey,
  recordKey,
}: {
  data: StudioRouteDetailResponse;
  evidence: StudioRouteEvidenceBundle | null;
  inventory?: StudioRouteInterventionInventoryBundle | null;
  studies?: RouteStudiesArtifact | null;
  studyKey?: string | undefined;
  recordKey?: string | undefined;
}) {
  const { route } = data;
  const model = routeInterventionViewModel(inventory);
  const comparisonCards = interventionComparisonCards(route.interventions, studies);
  const sourceRows = treatmentSourceRows(route.interventions);
  const timelineRows = mergedTreatmentTimelineRows(route.interventions, evidence, model.timeline);
  const treatmentInsights = treatmentHistoryInsightRows(data.insights);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const targetAnchor =
    studyKey !== undefined
      ? treatmentRecordAnchorId(`study:${studyKey}`)
      : recordKey === undefined
        ? undefined
        : treatmentRecordAnchorId(recordKey);
  useHistoryTarget(targetAnchor, sectionRef);
  const recordEntries: SourceNoteEntry[] = [
    { label: `${timelineRows.length} dated records (${sourceRows.length} with named sources)` },
    ...sourceRows.map((row) => ({ label: row.label, detail: `${row.detail} (${row.year})` })),
  ];

  return (
    <div
      ref={sectionRef}
      tabIndex={-1}
      className="flex flex-col gap-7 outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)]"
    >
      <SectionCard
        title="What's on this route"
        sub={`${model.treatments.length} typed treatment records, shown without prose inference.`}
        right={<SourceNote label="About these records" entries={recordEntries} />}
      >
        {model.coverage.message === null ? null : (
          <Alert variant={model.coverage.status === "partial" ? "info" : "warn"}>
            <AlertTitle variant={model.coverage.status === "partial" ? "info" : "warn"}>
              {model.coverage.status === "partial" ? "Partial coverage" : "Treatment inventory"}
            </AlertTitle>
            <AlertDescription>{model.coverage.message}</AlertDescription>
          </Alert>
        )}
        <TreatmentInventory treatments={model.treatments} />
        {model.routeSlug === null ? null : (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[11.5px]">
            <Link
              to="/interventions"
              search={{ route: model.routeSlug }}
              className="font-semibold text-[var(--bp-color-accent)]"
            >
              Browse this route in all interventions →
            </Link>
            {[...new Set(model.treatments.map((row) => row.presentation.family))].map((family) => (
              <Link
                key={family}
                to="/interventions"
                search={{ ...(model.routeSlug === null ? {} : { route: model.routeSlug }), family }}
                className="text-[var(--bp-color-ink-55)]"
              >
                {model.treatments.find((row) => row.presentation.family === family)?.presentation
                  .familyLabel ?? family}
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Timeline" sub="Documented changes on this route, newest first.">
        <TimelineList rows={timelineRows} evidence={evidence} insights={treatmentInsights} />
      </SectionCard>

      <DocumentedTreatments evidence={evidence} model={model} />

      <InventorySourceGaps model={model} />

      <SectionCard title="Before & after evaluations" sub={comparisonCardsSubLine(comparisonCards)}>
        <ComparisonCards cards={comparisonCards} studyKey={studyKey} />
      </SectionCard>
    </div>
  );
}

export function mergedTreatmentTimelineRows(
  interventions: readonly StudioIntervention[],
  evidence: StudioRouteEvidenceBundle | null,
  occurrences: readonly TypedOccurrenceRow[] = [],
): TreatmentTimelineRow[] {
  const rows = new Map<string, TreatmentTimelineRow>();
  const rowKeyByRelationshipId = new Map<string, string>();

  for (const occurrence of occurrences) {
    const row = typedOccurrenceTimelineRow(occurrence);
    rows.set(row.key, row);
    const relationshipIds = [
      occurrence.occurrence.occurrenceId,
      occurrence.occurrence.sourceOccurrenceId,
      occurrence.occurrence.wikiOccurrenceId,
      occurrence.occurrence.registryLineage?.eventId,
    ];
    for (const relationshipId of relationshipIds) {
      if (relationshipId !== null && relationshipId !== undefined) {
        rowKeyByRelationshipId.set(relationshipId, row.key);
      }
    }
  }

  for (const [index, event] of interventions.entries()) {
    const relatedKey =
      event.eventId === undefined ? undefined : rowKeyByRelationshipId.get(event.eventId);
    if (relatedKey !== undefined) {
      const related = rows.get(relatedKey);
      const label = event.sourceLabel ?? event.sourceDetail;
      if (related !== undefined && label !== undefined) {
        related.sourceEntries = [...(related.sourceEntries ?? []), { label }];
      }
      continue;
    }
    const row: TreatmentTimelineRow = {
      key: `serving:${event.year}:${index}`,
      recordId: event.eventId ?? `serving:${event.year}:${index}`,
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
    rows.set(row.key, row);
    if (event.eventId !== undefined) rowKeyByRelationshipId.set(event.eventId, row.key);
  }

  for (const event of evidence?.timeline ?? []) {
    if (event.citationKeys.length === 0) continue;
    const relatedKey = rowKeyByRelationshipId.get(event.recordId);
    if (relatedKey !== undefined) {
      const related = rows.get(relatedKey);
      if (related !== undefined) {
        related.citationKeys = [...new Set([...related.citationKeys, ...event.citationKeys])];
      }
      continue;
    }
    const row = wikiTimelineRow(event);
    rows.set(row.key, row);
    rowKeyByRelationshipId.set(event.recordId, row.key);
  }

  return [...rows.values()].sort(treatmentTimelineSort);
}

function typedOccurrenceTimelineRow(row: TypedOccurrenceRow): TreatmentTimelineRow {
  const { occurrence } = row;
  const treatmentLabels = row.treatmentRows.map((item) => item.presentation.label);
  const kind = treatmentLabels[0] ?? "Documented treatment occurrence";
  const title = occurrence.program ?? occurrence.phase ?? kind;
  const relationshipDetail = [
    treatmentLabels.length === 0 ? null : treatmentLabels.join(", "),
    occurrence.phase,
    occurrence.lifecycleState.replaceAll("_", " "),
  ]
    .filter((value): value is string => value !== null)
    .join(" — ");
  return {
    key: `inventory:${occurrence.occurrenceId}`,
    recordId: occurrence.occurrenceId,
    dateLabel: occurrence.effectiveDate ?? "undated",
    sortKey: occurrence.effectiveDate ?? "0000",
    kind,
    title,
    detail: relationshipDetail,
    source: "inventory",
    citationKeys: [],
    sourceLabel: occurrence.sourceId,
    tone: "accent",
    sourceEntries: occurrence.sourceRefs.map((sourceRef) => ({ label: sourceRef })),
  };
}

function wikiTimelineRow(event: StudioRouteEvidenceTimelineEvent): TreatmentTimelineRow {
  const title = event.title ?? event.eventKind ?? "Documented route event";
  return {
    key: `wiki:${event.recordId}`,
    recordId: event.recordId,
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
    <div
      id={treatmentRecordAnchorId(row.recordId)}
      tabIndex={-1}
      className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 rounded-[3px] py-2.5 outline-none shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)]"
    >
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

function documentedTreatmentRows(
  evidence: StudioRouteEvidenceBundle | null,
  model: RouteInterventionViewModel,
): DocumentedRow[] {
  const projects = evidence?.projects ?? [];
  const evidenceById = new Map(projects.map((project) => [project.recordId, project]));
  const relatedRows = model.projects.map((relationship): DocumentedRow => {
    const project = evidenceById.get(relationship.projectId);
    if (project === undefined) {
      return {
        key: relationship.projectId,
        chips: [{ label: "project relationship", variant: "neutral" }],
        title: relationship.projectId,
        detail: `${relationship.treatmentIds.length} treatments and ${relationship.occurrenceIds.length} occurrences linked by the typed inventory.`,
        citationKeys: relationship.citationKeys,
      };
    }
    return documentedProjectRow(project);
  });
  const relatedIds = new Set(model.projects.map((project) => project.projectId));
  return [
    ...relatedRows,
    ...projects
      .filter((project) => !relatedIds.has(project.recordId))
      .map((project): DocumentedRow => documentedProjectRow(project)),
  ];
}

function documentedProjectRow(project: StudioRouteEvidenceProject): DocumentedRow {
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
}

function DocumentedTreatments({
  evidence,
  model,
}: {
  evidence: StudioRouteEvidenceBundle | null;
  model: RouteInterventionViewModel;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = documentedTreatmentRows(evidence, model);
  if (rows.length === 0) return null;
  const visible = showAll ? rows : rows.slice(0, DOCUMENTED_LIMIT);

  return (
    <SectionCard
      title="Related projects"
      sub="Project containers remain separate from typed treatments and occurrences."
    >
      <div className="flex flex-col gap-4">
        <div>
          {visible.map((row) => (
            <div
              id={treatmentRecordAnchorId(row.key)}
              tabIndex={-1}
              key={row.key}
              className="rounded-[3px] py-2.5 outline-none shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)]"
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

function InventorySourceGaps({ model }: { model: RouteInterventionViewModel }) {
  if (model.gaps.length === 0) return null;
  return (
    <SectionCard title="Source gaps" sub="Missing evidence stays separate from treatment records.">
      <div className="flex flex-col gap-2">
        {model.gaps.map((gap) => (
          <div
            key={gap.key}
            id={gap.anchorId}
            tabIndex={-1}
            className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warn">Source gap</Badge>
              <span className="text-[13px] font-semibold">{gap.gapKind.replaceAll("_", " ")}</span>
            </div>
            <div className="mt-1 text-[11.5px] text-[var(--bp-color-ink-55)]">{gap.sourceId}</div>
            <SourceNote entries={gap.sourceRefs.map((sourceRef) => ({ label: sourceRef }))} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
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
            targetId={treatmentRecordAnchorId(`study:${study.eventKey}`)}
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
  targetId,
  children,
}: {
  highlighted: boolean;
  targetId: string;
  children: ReactNode;
}) {
  return (
    <div
      id={targetId}
      tabIndex={-1}
      className={`rounded-[3px] bg-[var(--bp-color-card)] p-4 outline-none transition-shadow duration-700 focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)] ${
        highlighted
          ? "shadow-[0_0_0_1px_var(--bp-color-rule),0_0_0_3px_var(--bp-color-accent-bg),0_0_0_4px_var(--bp-color-accent)]"
          : "shadow-[0_0_0_1px_var(--bp-color-rule)]"
      }`}
    >
      {children}
    </div>
  );
}

export function historyTargetScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? "auto" : "smooth";
}

function useHistoryTarget(
  targetAnchor: string | undefined,
  sectionRef: { readonly current: HTMLDivElement | null },
) {
  useEffect(() => {
    if (targetAnchor === undefined || typeof document === "undefined") return;
    const target = document.getElementById(targetAnchor) ?? sectionRef.current;
    if (target === null) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.focus({ preventScroll: true });
    target.scrollIntoView({
      block: target === sectionRef.current ? "start" : "center",
      behavior: historyTargetScrollBehavior(prefersReducedMotion),
    });
  }, [sectionRef, targetAnchor]);
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
