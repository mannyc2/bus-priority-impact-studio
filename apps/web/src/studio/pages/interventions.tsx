import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RouteBadge } from "@/components/RouteBadge";
import { SectionCard } from "@/components/SectionCard";
import {
  ciLongLabel,
  signedMphLabel,
  studyIndexRowForEventId,
  studyIndexRowsByJoinKey,
  studyTone,
  studyToneColor,
} from "@/components/study/study-display";
import { citationEntries, SourceNote, type SourceNoteEntry } from "@/components/SourceNote";
import { Badge } from "@/components/ui/badge";
import type {
  StudioIntervention,
  StudioInterventionCorpus,
  StudioInterventionCorpusRecord,
  StudioInterventionsEvidenceBundle,
  StudioRoute,
  StudioRouteEvidenceBundle,
  StudioRouteEvidenceIntervention,
  StudioRouteEvidenceProject,
  StudioRouteEvidenceSourceGap,
  StudioRouteEvidenceTimelineEvent,
  StudyIndexArtifact,
  StudyIndexRow,
} from "../api-contract.js";
import { ROUTE_INDEX_ALL_BOROUGHS, ROUTE_INDEX_BOROUGHS } from "../home-route-index.js";
import { StudioPage } from "../page.js";

type InterventionEvidenceBundle = StudioInterventionsEvidenceBundle | StudioRouteEvidenceBundle;

type InterventionFilter = "all" | "evaluated" | "future" | "source-gap";

type BoroughFilter = typeof ROUTE_INDEX_ALL_BOROUGHS | (typeof ROUTE_INDEX_BOROUGHS)[number];

type InterventionRow = {
  key: string;
  routes: readonly StudioRoute[];
  event: InterventionDisplayEvent;
  evidence: InterventionEvidenceBundle | null;
};

type InterventionDisplayEvent = Pick<
  StudioIntervention,
  "comparisonCohort" | "eventId" | "interventionType" | "sourceDetail" | "sourceLabel" | "tone"
> & {
  year: string;
  sortKey: string;
  kind: string;
  title: string;
  detail: string;
  source: "serving" | "wiki" | "corpus" | "source_gap";
  citationKeys: string[];
  sourceEntries?: SourceNoteEntry[];
  filterState?: "future" | "source-gap";
  documented?: boolean;
};

const filters: readonly { id: InterventionFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "evaluated", label: "Evaluated" },
  { id: "future", label: "Future" },
  { id: "source-gap", label: "Needs source" },
];

export const INTERVENTIONS_PAGE_SIZE = 30;

export function InterventionsPage({
  routes,
  evidence,
  corpus = null,
  studiesIndex = null,
}: {
  routes: readonly StudioRoute[];
  evidence: readonly (InterventionEvidenceBundle | null)[];
  corpus?: StudioInterventionCorpus | null;
  studiesIndex?: StudyIndexArtifact | null;
}) {
  const [filter, setFilter] = useState<InterventionFilter>("all");
  const [borough, setBorough] = useState<BoroughFilter>(ROUTE_INDEX_ALL_BOROUGHS);
  const [limit, setLimit] = useState(INTERVENTIONS_PAGE_SIZE);
  const rows = useMemo(
    () => interventionRows(routes, evidence, corpus),
    [routes, evidence, corpus],
  );
  const studyRowsByJoinKey = useMemo(() => studyIndexRowsByJoinKey(studiesIndex), [studiesIndex]);
  const boroughRows =
    borough === ROUTE_INDEX_ALL_BOROUGHS
      ? rows
      : rows.filter((row) => row.routes.some((route) => route.borough.includes(borough)));
  const filteredRows = boroughRows.filter((row) => matchesFilter(row.event, filter));
  const visibleRows = filteredRows.slice(0, limit);
  const remaining = filteredRows.length - visibleRows.length;
  const groups = yearGroups(visibleRows);

  const selectFilter = (next: InterventionFilter) => {
    setFilter(next);
    setLimit(INTERVENTIONS_PAGE_SIZE);
  };
  const selectBorough = (next: BoroughFilter) => {
    setBorough(next);
    setLimit(INTERVENTIONS_PAGE_SIZE);
  };

  return (
    <StudioPage>
      <header className="mb-6 border-b border-[var(--bp-color-rule)] pb-5">
        <h1 className="m-0 text-[26px] font-semibold leading-[1.15] tracking-[-0.015em]">
          Interventions
        </h1>
        <p className="mt-2 max-w-[640px] text-[13.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
          Documented bus lanes, camera enforcement, signal priority, and service changes across the
          tracked network, newest first.
        </p>
      </header>

      <div className="mb-5 flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((item) => (
            <FilterChip
              key={item.id}
              active={filter === item.id}
              label={`${item.label} (${boroughRows.filter((row) => matchesFilter(row.event, item.id)).length})`}
              onClick={() => selectFilter(item.id)}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[ROUTE_INDEX_ALL_BOROUGHS, ...ROUTE_INDEX_BOROUGHS].map((item) => (
            <FilterChip
              key={item}
              active={borough === item}
              label={item}
              onClick={() => selectBorough(item as BoroughFilter)}
            />
          ))}
        </div>
      </div>

      <SectionCard
        title="Network timeline"
        sub="Open a route for maps, speed history, and full citations."
      >
        {filteredRows.length === 0 ? (
          <div className="px-1 py-4 text-[13px] text-[var(--bp-color-ink-55)]">
            No intervention records match this filter.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <div key={group.year}>
                <div className="border-b border-[var(--bp-color-rule)] pb-1 text-[13px] font-semibold">
                  {group.year}
                </div>
                {group.rows.map((row) => (
                  <ChronicleRow
                    key={row.key}
                    row={row}
                    study={studyIndexRowForEventId(row.event.eventId, studyRowsByJoinKey)}
                  />
                ))}
              </div>
            ))}
            {remaining > 0 ? (
              <button
                type="button"
                onClick={() => setLimit((value) => value + INTERVENTIONS_PAGE_SIZE)}
                className="w-full rounded-[3px] px-3 py-2.5 text-[12px] font-semibold text-[var(--bp-color-ink-55)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)] transition-colors hover:text-[var(--bp-color-ink)]"
              >
                {`Show ${Math.min(INTERVENTIONS_PAGE_SIZE, remaining)} more (${remaining} left)`}
              </button>
            ) : null}
          </div>
        )}
      </SectionCard>
    </StudioPage>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? "rounded-[3px] border-0 bg-[var(--bp-color-ink)] px-3 py-1.5 text-[12px] font-semibold text-[var(--bp-color-paper)]"
          : "rounded-[3px] border border-[var(--bp-color-ink-20)] bg-transparent px-3 py-1.5 text-[12px] font-semibold text-[var(--bp-color-ink-70)] hover:bg-[var(--bp-color-card)]"
      }
    >
      {label}
    </button>
  );
}

export function yearLabel(dateish: string): string {
  const year = dateish.match(/\b\d{4}\b/)?.[0];
  if (year) return year;
  return "Undated";
}

export function yearGroups(
  rows: readonly InterventionRow[],
): { year: string; rows: InterventionRow[] }[] {
  const groups: { year: string; rows: InterventionRow[] }[] = [];
  for (const row of rows) {
    const year = yearLabel(row.event.year);
    const last = groups.at(-1);
    if (last && last.year === year) last.rows.push(row);
    else groups.push({ year, rows: [row] });
  }
  return groups;
}

function ChronicleRow({ row, study }: { row: InterventionRow; study?: StudyIndexRow | undefined }) {
  const cohort = row.event.comparisonCohort;
  const undated = yearLabel(row.event.year) === "Undated";
  const citationSourceEntries: SourceNoteEntry[] =
    row.event.citationKeys.length > 0
      ? citationEntries(row.evidence, row.event.citationKeys)
      : [{ label: row.event.sourceLabel ?? "Serving record" }];
  const entries = dedupeSourceEntries([
    ...citationSourceEntries,
    ...(row.event.sourceEntries ?? []),
  ]);
  const primaryRoute = row.routes[0] ?? null;

  return (
    <div className="grid grid-cols-[64px_auto_minmax(0,1fr)_auto] items-start gap-3 py-2.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-md:grid-cols-[64px_minmax(0,1fr)]">
      <div
        className={`pt-0.5 font-mono text-[11px] ${undated ? "text-[var(--bp-color-ink-40)]" : "text-[var(--bp-color-ink-70)]"}`}
      >
        {undated ? "Undated" : row.event.year}
      </div>
      <div className="flex flex-wrap gap-1 pt-0.5">
        {row.routes.length === 0 ? (
          <span className="font-mono text-[10.5px] text-[var(--bp-color-ink-40)]">Network</span>
        ) : (
          row.routes.map((route) => (
            <Link
              key={route.slug}
              to="/routes/$routeId"
              params={{ routeId: route.slug }}
              viewTransition
              className="no-underline"
            >
              <RouteBadge route={route.label} sbs={route.sbs} size="sm" />
            </Link>
          ))
        )}
      </div>
      <div className="min-w-0 max-md:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{row.event.kind.replaceAll("_", " ")}</Badge>
          {row.event.documented ? <Badge variant="neutral">documented</Badge> : null}
          {primaryRoute === null ? (
            <span className="text-[13px] font-semibold leading-tight text-[var(--bp-color-ink)]">
              {row.event.title}
            </span>
          ) : (
            <Link
              to="/routes/$routeId"
              params={{ routeId: primaryRoute.slug }}
              viewTransition
              className="text-[13px] font-semibold leading-tight text-[var(--bp-color-ink)] no-underline"
            >
              {row.event.title}
            </Link>
          )}
        </div>
        <div className="mt-1 line-clamp-2 text-[12px] leading-[1.45] text-[var(--bp-color-ink-55)]">
          {row.event.detail}
        </div>
        {entries.length > 0 ? (
          <div className="mt-1">
            <SourceNote entries={entries} />
          </div>
        ) : null}
      </div>
      {cohort && study !== undefined && study.effectMph !== null ? (
        <div className="text-right text-[11.5px] text-[var(--bp-color-ink-55)] max-md:col-span-2 max-md:text-left">
          <div
            className="font-mono text-[15px] font-semibold"
            style={{ color: studyToneColor(studyTone(study.direction)) }}
          >
            {signedMphLabel(study.effectMph)}
          </div>
          {study.confidenceInterval === null ? null : (
            <div className="mt-1 font-mono">{ciLongLabel(study.confidenceInterval)}</div>
          )}
          <div className="mt-1">matched-segment study</div>
          <div className="mt-1">
            <Link
              to="/routes/$routeId"
              params={{ routeId: study.routeSlug }}
              search={{ tab: "history", study: study.eventKey }}
              viewTransition
              className="text-[11.5px]"
            >
              View study →
            </Link>
          </div>
        </div>
      ) : cohort ? (
        <div className="text-right text-[11.5px] text-[var(--bp-color-ink-55)] max-md:col-span-2 max-md:text-left">
          <div className="font-mono text-[15px] font-semibold text-[var(--bp-color-ink)]">
            {formatDelta(cohort.adjustedSpeedDeltaMph ?? cohort.routeSpeedDeltaMph)}
          </div>
          <div className="mt-1">{cohort.causalInterpretation.replaceAll("_", " ")}</div>
          <div className="mt-1">{cohort.routeCount} comparison routes</div>
        </div>
      ) : (
        <div />
      )}
    </div>
  );
}

export function interventionRows(
  routes: readonly StudioRoute[],
  evidence: readonly (InterventionEvidenceBundle | null)[] = [],
  corpus: StudioInterventionCorpus | null = null,
): InterventionRow[] {
  const evidenceBySlug = new Map<string, InterventionEvidenceBundle>();
  for (const bundle of evidence) {
    if (bundle !== null) evidenceBySlug.set(bundle.routeSlug, bundle);
  }
  const registryRows = routes.flatMap((route) => {
    const bundle = evidenceBySlug.get(route.slug) ?? null;
    return [
      ...route.interventions.map(
        (event, index): InterventionRow => ({
          key: `${route.slug}:serving:${event.year}:${index}`,
          routes: [route],
          evidence: bundle,
          event: {
            ...event,
            sortKey: event.year,
            kind: "program record",
            source: "serving",
            citationKeys: [],
          },
        }),
      ),
      ...wikiInterventionRows(route, bundle),
    ];
  });
  const registryEventIds = new Set(
    registryRows.flatMap((row) => (row.event.eventId === undefined ? [] : [row.event.eventId])),
  );
  const corpusEntriesByRegistryEventId = corpusSourceEntriesByRegistryEventId(corpus);
  const enrichedRegistryRows: InterventionRow[] = registryRows.map((row) => {
    const sourceEntries =
      row.event.eventId === undefined
        ? undefined
        : corpusEntriesByRegistryEventId.get(row.event.eventId);
    if (sourceEntries === undefined) return row;
    return { ...row, event: { ...row.event, sourceEntries } };
  });

  return [
    ...enrichedRegistryRows,
    ...corpusInterventionRows(routes, corpus, registryEventIds),
  ].sort(
    (left, right) =>
      right.event.sortKey.localeCompare(left.event.sortKey) ||
      (left.routes[0]?.label ?? "").localeCompare(right.routes[0]?.label ?? "") ||
      left.event.title.localeCompare(right.event.title),
  );
}

function routeJoinKey(routeId: string): string {
  return routeId.trim().toUpperCase().replace(/-SBS$/, "").replace(/\+$/, "");
}

function corpusSourceEntry(record: StudioInterventionCorpusRecord): SourceNoteEntry {
  return {
    label: record.sourceLabel,
    ...(record.sourceUrl === null ? {} : { href: record.sourceUrl }),
    detail: `${record.sourceId}; ${record.recordId}`,
  };
}

function corpusSourceEntriesByRegistryEventId(
  corpus: StudioInterventionCorpus | null,
): ReadonlyMap<string, SourceNoteEntry[]> {
  const entries = new Map<string, SourceNoteEntry[]>();
  for (const record of corpus?.records ?? []) {
    for (const eventId of record.matchedRegistryEventIds) {
      const current = entries.get(eventId) ?? [];
      current.push(corpusSourceEntry(record));
      entries.set(eventId, current);
    }
  }
  return entries;
}

function corpusInterventionRows(
  routes: readonly StudioRoute[],
  corpus: StudioInterventionCorpus | null,
  visibleRegistryEventIds: ReadonlySet<string>,
): InterventionRow[] {
  const routesByJoinKey = new Map(routes.map((route) => [routeJoinKey(route.routeId), route]));
  return (corpus?.records ?? []).flatMap((record): InterventionRow[] => {
    if (record.matchedRegistryEventIds.some((eventId) => visibleRegistryEventIds.has(eventId))) {
      return [];
    }
    const matchedRoutes = record.routes.flatMap((routeId) => {
      const route = routesByJoinKey.get(routeJoinKey(routeId));
      return route === undefined ? [] : [route];
    });
    const unmatchedRouteIds = record.routes.filter(
      (routeId) => !routesByJoinKey.has(routeJoinKey(routeId)),
    );
    const status = record.statusLatest ?? record.recordKind.replaceAll("_", " ");
    const corridor = record.corridorStreets.join(", ");
    const unmatchedRoutes =
      unmatchedRouteIds.length > 0 ? ` — Unmatched routes: ${unmatchedRouteIds.join(", ")}` : "";
    return [
      {
        key: `corpus:${record.recordId}`,
        routes: matchedRoutes,
        evidence: null,
        event: {
          year: record.effectiveDate ?? "undated",
          sortKey: record.effectiveDate ?? "0000",
          kind: record.primaryTreatments[0] ?? record.customTreatments[0] ?? "intervention",
          title: record.title,
          detail: `${status}${corridor.length > 0 ? ` — ${corridor}` : ""}${unmatchedRoutes}`,
          source: "corpus",
          sourceLabel: record.sourceLabel,
          citationKeys: [],
          sourceEntries: [corpusSourceEntry(record)],
          ...(record.recordKind === "proposed"
            ? { filterState: "future" as const }
            : record.effectiveDate === null
              ? { filterState: "source-gap" as const }
              : {}),
          documented: !record.evaluableInWindow,
        },
      },
    ];
  });
}

function dedupeSourceEntries(entries: readonly SourceNoteEntry[]): SourceNoteEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.label}|${entry.href ?? ""}|${entry.detail ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function wikiInterventionRows(
  route: StudioRoute,
  evidence: InterventionEvidenceBundle | null,
): InterventionRow[] {
  if (evidence === null) return [];
  return [
    ...evidence.timeline.map((event) => wikiTimelineRow(route, evidence, event)),
    ...evidence.interventions.map((intervention) =>
      wikiTreatmentRow(route, evidence, intervention),
    ),
    ...evidence.projects.map((project) => wikiProjectRow(route, evidence, project)),
    ...evidence.sourceGaps.map((gap) => wikiSourceGapRow(route, evidence, gap)),
  ];
}

function wikiTimelineRow(
  route: StudioRoute,
  evidence: InterventionEvidenceBundle,
  event: StudioRouteEvidenceTimelineEvent,
): InterventionRow {
  const year = event.dateNormalized ?? event.dateText ?? "undated";
  return {
    key: `${route.slug}:wiki-timeline:${event.recordId}`,
    routes: [route],
    evidence,
    event: {
      year,
      sortKey: event.dateNormalized ?? event.dateText ?? "0000",
      kind: event.eventKind ?? event.eventFamily ?? "route event",
      title: event.title ?? event.eventKind ?? "Documented route event",
      detail: event.description ?? event.lifecyclePhase ?? "Wiki-derived route evidence.",
      source: "wiki",
      sourceLabel: "MTA-wiki",
      citationKeys: event.citationKeys,
    },
  };
}

function wikiTreatmentRow(
  route: StudioRoute,
  evidence: InterventionEvidenceBundle,
  intervention: StudioRouteEvidenceIntervention,
): InterventionRow {
  return {
    key: `${route.slug}:wiki-treatment:${intervention.recordId}`,
    routes: [route],
    evidence,
    event: {
      year: "undated",
      sortKey: "0000",
      kind: intervention.treatmentKind ?? "treatment",
      title: intervention.title ?? intervention.treatmentKind ?? "Documented treatment",
      detail: wikiTreatmentDescription(intervention),
      source: "wiki",
      sourceLabel: "MTA-wiki",
      citationKeys: intervention.citationKeys,
    },
  };
}

function wikiTreatmentDescription(intervention: StudioRouteEvidenceIntervention): string {
  if (intervention.description !== null) return intervention.description;
  const locations = intervention.locations.join(", ");
  return locations.length > 0 ? locations : "Source-backed treatment.";
}

function wikiProjectRow(
  route: StudioRoute,
  evidence: InterventionEvidenceBundle,
  project: StudioRouteEvidenceProject,
): InterventionRow {
  return {
    key: `${route.slug}:wiki-project:${project.recordId}`,
    routes: [route],
    evidence,
    event: {
      year: "undated",
      sortKey: "0000",
      kind: project.projectType ?? project.status ?? "project",
      title: project.projectName ?? "Documented project",
      detail: project.description ?? project.location ?? "Source-backed project.",
      source: "wiki",
      sourceLabel: "MTA-wiki",
      citationKeys: project.citationKeys,
    },
  };
}

function wikiSourceGapRow(
  route: StudioRoute,
  evidence: InterventionEvidenceBundle,
  gap: StudioRouteEvidenceSourceGap,
): InterventionRow {
  return {
    key: `${route.slug}:wiki-source-gap:${gap.recordId}`,
    routes: [route],
    evidence,
    event: {
      year: "undated",
      sortKey: "0000",
      kind: "source gap",
      title: `Source gap: ${gap.gapKind ?? "route evidence"}`,
      detail: gap.gapText ?? gap.missingInformation ?? gap.description ?? "Missing source detail.",
      tone: "warn",
      source: "source_gap",
      sourceLabel: "MTA-wiki",
      citationKeys: gap.citationKeys,
    },
  };
}

function matchesFilter(event: InterventionDisplayEvent, filter: InterventionFilter): boolean {
  if (filter === "evaluated") return event.comparisonCohort !== undefined;
  if (filter === "future") return isFutureEvent(event);
  if (filter === "source-gap")
    return event.source === "source_gap" || event.filterState === "source-gap";
  return true;
}

function isFutureEvent(event: InterventionDisplayEvent): boolean {
  if (event.filterState === "future") return true;
  const text = `${event.title} ${event.detail}`.toLowerCase();
  return text.includes("future") || text.includes("scheduled") || text.includes("await");
}

function formatDelta(value: number | null): string {
  if (value === null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} mph`;
}
