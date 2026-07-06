import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RouteBadge } from "@/components/RouteBadge";
import { SectionCard } from "@/components/SectionCard";
import { citationEntries, SourceNote, type SourceNoteEntry } from "@/components/SourceNote";
import { Badge } from "@/components/ui/badge";
import type {
  StudioIntervention,
  StudioInterventionsEvidenceBundle,
  StudioRoute,
  StudioRouteEvidenceBundle,
  StudioRouteEvidenceIntervention,
  StudioRouteEvidenceProject,
  StudioRouteEvidenceSourceGap,
  StudioRouteEvidenceTimelineEvent,
} from "../api-contract.js";
import { ROUTE_INDEX_ALL_BOROUGHS, ROUTE_INDEX_BOROUGHS } from "../home-route-index.js";
import { StudioPage } from "../page.js";

type InterventionEvidenceBundle = StudioInterventionsEvidenceBundle | StudioRouteEvidenceBundle;

type InterventionFilter = "all" | "evaluated" | "future" | "source-gap";

type BoroughFilter = typeof ROUTE_INDEX_ALL_BOROUGHS | (typeof ROUTE_INDEX_BOROUGHS)[number];

type InterventionRow = {
  key: string;
  route: StudioRoute;
  event: InterventionDisplayEvent;
  evidence: InterventionEvidenceBundle | null;
};

type InterventionDisplayEvent = Pick<
  StudioIntervention,
  "comparisonCohort" | "sourceDetail" | "sourceLabel" | "tone"
> & {
  year: string;
  sortKey: string;
  kind: string;
  title: string;
  detail: string;
  source: "serving" | "wiki" | "source_gap";
  citationKeys: string[];
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
}: {
  routes: readonly StudioRoute[];
  evidence: readonly (InterventionEvidenceBundle | null)[];
}) {
  const [filter, setFilter] = useState<InterventionFilter>("all");
  const [borough, setBorough] = useState<BoroughFilter>(ROUTE_INDEX_ALL_BOROUGHS);
  const [limit, setLimit] = useState(INTERVENTIONS_PAGE_SIZE);
  const rows = useMemo(() => interventionRows(routes, evidence), [routes, evidence]);
  const boroughRows =
    borough === ROUTE_INDEX_ALL_BOROUGHS
      ? rows
      : rows.filter((row) => row.route.borough.includes(borough));
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
                  <ChronicleRow key={row.key} row={row} />
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

function ChronicleRow({ row }: { row: InterventionRow }) {
  const cohort = row.event.comparisonCohort;
  const undated = yearLabel(row.event.year) === "Undated";
  const entries: SourceNoteEntry[] =
    row.event.citationKeys.length > 0
      ? citationEntries(row.evidence, row.event.citationKeys)
      : [{ label: row.event.sourceLabel ?? "Serving record" }];

  return (
    <div className="grid grid-cols-[64px_auto_minmax(0,1fr)_auto] items-start gap-3 py-2.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-md:grid-cols-[64px_minmax(0,1fr)]">
      <div
        className={`pt-0.5 font-mono text-[11px] ${undated ? "text-[var(--bp-color-ink-40)]" : "text-[var(--bp-color-ink-70)]"}`}
      >
        {undated ? "Undated" : row.event.year}
      </div>
      <Link
        to="/routes/$routeId"
        params={{ routeId: row.route.slug }}
        viewTransition
        className="pt-0.5 no-underline"
      >
        <RouteBadge route={row.route.label} sbs={row.route.sbs} size="sm" />
      </Link>
      <div className="min-w-0 max-md:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{row.event.kind.replaceAll("_", " ")}</Badge>
          <Link
            to="/routes/$routeId"
            params={{ routeId: row.route.slug }}
            viewTransition
            className="text-[13px] font-semibold leading-tight text-[var(--bp-color-ink)] no-underline"
          >
            {row.event.title}
          </Link>
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
      {cohort ? (
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
): InterventionRow[] {
  const evidenceBySlug = new Map<string, InterventionEvidenceBundle>();
  for (const bundle of evidence) {
    if (bundle !== null) evidenceBySlug.set(bundle.routeSlug, bundle);
  }
  return routes
    .flatMap((route) => {
      const bundle = evidenceBySlug.get(route.slug) ?? null;
      return [
        ...route.interventions.map(
          (event, index): InterventionRow => ({
            key: `${route.slug}:serving:${event.year}:${index}`,
            route,
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
    })
    .sort(
      (left, right) =>
        right.event.sortKey.localeCompare(left.event.sortKey) ||
        left.route.label.localeCompare(right.route.label) ||
        left.event.title.localeCompare(right.event.title),
    );
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
    route,
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
    route,
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
    route,
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
    route,
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
  if (filter === "source-gap") return event.source === "source_gap";
  return true;
}

function isFutureEvent(event: InterventionDisplayEvent): boolean {
  const text = `${event.title} ${event.detail}`.toLowerCase();
  return text.includes("future") || text.includes("scheduled") || text.includes("await");
}

function formatDelta(value: number | null): string {
  if (value === null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} mph`;
}
