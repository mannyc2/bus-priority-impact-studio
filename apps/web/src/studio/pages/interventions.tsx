import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips } from "@/components/FilterChips";
import { RouteBadge } from "@/components/RouteBadge";
import { SectionCard } from "@/components/SectionCard";
import { citationEntries, SourceNote, type SourceNoteEntry } from "@/components/SourceNote";
import {
  ciLongLabel,
  signedMphLabel,
  studyIndexRowForEventId,
  studyIndexRowsByJoinKey,
  studyTone,
  studyToneColor,
} from "@/components/study/study-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { InterventionsSearch } from "@/routes/interventions";
import type {
  StudioIntervention,
  StudioInterventionCorpus,
  StudioInterventionCorpusRecord,
  StudioInterventionFacetIndex,
  StudioInterventionFacetIndexRow,
  StudioInterventionsEvidenceBundle,
  StudioInterventionTreatmentFamily,
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

type InterventionEvidenceBundle = StudioInterventionsEvidenceBundle | StudioRouteEvidenceBundle;

type InterventionFilter = "all" | "evaluated" | "future" | "source-gap";

type BoroughFilter = typeof ROUTE_INDEX_ALL_BOROUGHS | (typeof ROUTE_INDEX_BOROUGHS)[number];

type InterventionRow = {
  key: string;
  routes: readonly StudioRoute[];
  event: InterventionDisplayEvent;
  evidence: InterventionEvidenceBundle | null;
  facets: readonly StudioInterventionFacetIndexRow[];
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
  recordId: string;
  relationshipIds?: readonly string[];
  searchTerms?: readonly string[];
};

const filters: readonly { id: InterventionFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "evaluated", label: "Evaluated" },
  { id: "future", label: "Future" },
  { id: "source-gap", label: "Needs source" },
];

const FAMILY_LABELS = {
  bus_priority_lane: "Bus priority lanes",
  signal_priority: "Signal priority",
  stop_change: "Stop changes",
  street_design: "Street design",
  boarding_and_fare: "Boarding and fare",
  enforcement: "Enforcement",
  service_change: "Service changes",
  service_package: "Service packages",
  capital: "Capital work",
  curb_management: "Curb management",
  customer_information: "Customer information",
  other: "Other documented",
} satisfies Record<StudioInterventionTreatmentFamily, string>;

const FUTURE_LIFECYCLE_STATES = new Set([
  "planned",
  "proposed",
  "under_consideration",
  "candidate",
]);

export const INTERVENTIONS_PAGE_SIZE = 30;

export function InterventionsPage({
  routes,
  evidence,
  corpus = null,
  studiesIndex = null,
  facetIndex = null,
  search = {},
  onSearchChange = () => undefined,
}: {
  routes: readonly StudioRoute[];
  evidence: readonly (InterventionEvidenceBundle | null)[];
  corpus?: StudioInterventionCorpus | null;
  studiesIndex?: StudyIndexArtifact | null;
  facetIndex?: StudioInterventionFacetIndex | null;
  search?: InterventionsSearch;
  onSearchChange?: (search: InterventionsSearch) => void;
}) {
  const [limit, setLimit] = useState(INTERVENTIONS_PAGE_SIZE);
  const paginationResetKey = interventionsPaginationResetKey(search);
  const rows = useMemo(
    () => interventionRows(routes, evidence, corpus, facetIndex),
    [routes, evidence, corpus, facetIndex],
  );
  const studyRowsByJoinKey = useMemo(() => studyIndexRowsByJoinKey(studiesIndex), [studiesIndex]);
  const exactRouteSlugs = useMemo(() => new Set(routes.map((route) => route.slug)), [routes]);
  const unmatchedRoute = search.route !== undefined && !exactRouteSlugs.has(search.route);
  const filteredRows = useMemo(
    () =>
      unmatchedRoute
        ? []
        : filterInterventionRows(rows, search, { facetIndexAvailable: facetIndex !== null }),
    [facetIndex, rows, search, unmatchedRoute],
  );
  const visibleRows = filteredRows.slice(0, limit);
  const remaining = filteredRows.length - visibleRows.length;
  const datedRows = visibleRows.filter((row) => yearLabel(row.event.year) !== "Undated");
  const undatedRows = visibleRows.filter((row) => yearLabel(row.event.year) === "Undated");
  const groups = yearGroups(datedRows);
  const routeCount = new Set(rows.flatMap((row) => row.routes.map((route) => route.slug))).size;
  const totalDatedCount = rows.filter((row) => yearLabel(row.event.year) !== "Undated").length;
  const filteredDatedCount = filteredRows.filter(
    (row) => yearLabel(row.event.year) !== "Undated",
  ).length;
  const filteredUndatedCount = filteredRows.length - filteredDatedCount;
  const facetGapCount = rows.filter((row) => row.facets.length === 0).length;
  const familyCountRows = filterInterventionRows(
    rows,
    omitInterventionsSearchKey(search, "family"),
    { facetIndexAvailable: facetIndex !== null },
  );
  const statusCountRows = (status: InterventionFilter) =>
    filterInterventionRows(
      rows,
      status === "all" ? omitInterventionsSearchKey(search, "status") : { ...search, status },
      { facetIndexAvailable: facetIndex !== null },
    ).length;
  const updateSearch = (next: InterventionsSearch) => {
    setLimit(INTERVENTIONS_PAGE_SIZE);
    onSearchChange(compactInterventionsSearch(next));
  };

  useEffect(() => {
    setLimit(INTERVENTIONS_PAGE_SIZE);
  }, [paginationResetKey]);

  return (
    <main className="min-h-full bg-[var(--bp-color-paper)]">
      <section className="mx-auto max-w-[1180px] px-9 pb-16 pt-14 max-sm:px-4 max-sm:pt-10">
        <header className="mb-7">
          <h1 className="m-0 text-[26px] font-semibold leading-[1.15] tracking-[-0.022em]">
            Interventions
          </h1>
          <p className="mt-2.5 max-w-[720px] text-[15px] leading-[1.55] text-[var(--bp-color-ink-70)]">
            Documented bus lanes, camera enforcement, signal priority, and service changes across
            the tracked network.
          </p>
          <p className="mt-3 font-mono text-[11px] tabular-nums text-[var(--bp-color-ink-55)]">
            {`${rows.length} records across ${routeCount} routes. ${totalDatedCount} dated. Newest first.`}
          </p>
          <p aria-live="polite" className="sr-only">
            {interventionMatchAnnouncement(filteredRows.length)}
          </p>
        </header>

        <div className="grid grid-cols-[238px_minmax(0,1fr)] items-start gap-6 max-lg:grid-cols-1">
          <aside className="sticky top-6 max-lg:static">
            <SectionCard
              title="Filter timeline"
              sub={`${filteredRows.length} records in the current view.`}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] font-semibold text-[var(--bp-color-ink-70)]">
                    Status
                  </div>
                  <FilterChips
                    value={search.status ?? "all"}
                    onChange={(status) =>
                      updateSearch(
                        status === "all"
                          ? omitInterventionsSearchKey(search, "status")
                          : { ...search, status },
                      )
                    }
                    ariaLabel="Filter interventions by status"
                    options={filters.map((item) => ({
                      id: item.id,
                      label: `${item.label} (${statusCountRows(item.id)})`,
                    }))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] font-semibold text-[var(--bp-color-ink-70)]">
                    Borough
                  </div>
                  <FilterChips
                    value={search.borough ?? ROUTE_INDEX_ALL_BOROUGHS}
                    onChange={(borough) =>
                      updateSearch(
                        borough === ROUTE_INDEX_ALL_BOROUGHS
                          ? omitInterventionsSearchKey(search, "borough")
                          : { ...search, borough },
                      )
                    }
                    ariaLabel="Filter interventions by borough"
                    options={[ROUTE_INDEX_ALL_BOROUGHS, ...ROUTE_INDEX_BOROUGHS].map((item) => ({
                      id: item as BoroughFilter,
                      label: item,
                    }))}
                  />
                </div>
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldLabel htmlFor="intervention-search">Search records</FieldLabel>
                    <Input
                      id="intervention-search"
                      type="search"
                      value={search.q ?? ""}
                      placeholder="Route, project, corridor…"
                      onChange={(event) =>
                        updateSearch({ ...search, q: event.currentTarget.value })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="intervention-family">Treatment family</FieldLabel>
                    <Select
                      value={search.family ?? "all"}
                      disabled={facetIndex === null}
                      onValueChange={(family) => {
                        if (typeof family !== "string") return;
                        updateSearch(
                          family === "all"
                            ? omitInterventionsSearchKey(search, "family")
                            : {
                                ...search,
                                family: family as StudioInterventionTreatmentFamily,
                              },
                        );
                      }}
                    >
                      <SelectTrigger id="intervention-family" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectGroup>
                          <SelectItem value="all">{`All families (${familyCountRows.length})`}</SelectItem>
                          {Object.entries(FAMILY_LABELS).map(([family, label]) => (
                            <SelectItem key={family} value={family}>
                              {`${label} (${familyCountRows.filter((row) => row.facets.some((facet) => facet.treatmentFamilies.includes(family as StudioInterventionTreatmentFamily))).length})`}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {facetIndex === null ? (
                      <p className="m-0 text-[10.5px] leading-[1.4] text-[var(--bp-color-ink-55)]">
                        Typed family filters are unavailable; all known records remain visible.
                      </p>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="intervention-route">Exact route</FieldLabel>
                    <Select
                      value={search.route ?? "all"}
                      onValueChange={(route) => {
                        if (typeof route !== "string") return;
                        updateSearch(
                          route === "all"
                            ? omitInterventionsSearchKey(search, "route")
                            : { ...search, route },
                        );
                      }}
                    >
                      <SelectTrigger id="intervention-route" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectGroup>
                          <SelectItem value="all">All routes</SelectItem>
                          {[...routes]
                            .sort((left, right) =>
                              (left.displayLabel ?? left.label).localeCompare(
                                right.displayLabel ?? right.label,
                              ),
                            )
                            .map((route) => (
                              <SelectItem key={route.slug} value={route.slug}>
                                {route.displayLabel ?? route.label}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
                <Separator />
                <dl className="m-0 grid grid-cols-2 gap-3">
                  <TimelineCount label="Dated" value={filteredDatedCount} />
                  <TimelineCount label="No date" value={filteredUndatedCount} />
                </dl>
                {facetIndex === null ? null : (
                  <p className="m-0 text-[10.5px] leading-[1.4] text-[var(--bp-color-ink-55)]">
                    {facetGapCount === 0
                      ? "Every displayed record has a typed facet join."
                      : `${facetGapCount} records have no typed facet join and remain visible.`}
                  </p>
                )}
              </div>
            </SectionCard>
          </aside>

          <div className="flex min-w-0 flex-col gap-5">
            {filteredRows.length === 0 ? (
              <SectionCard title="Network timeline" sub="No records match the current filters.">
                <EmptyState
                  title={unmatchedRoute ? "Route not found" : "No matching interventions"}
                  body={
                    unmatchedRoute
                      ? `No route has the exact slug “${search.route ?? ""}”. Clear the route filter to see network records.`
                      : "Choose another status, borough, family, route, or search term to return records to the timeline."
                  }
                />
                {unmatchedRoute ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => updateSearch(omitInterventionsSearchKey(search, "route"))}
                    className="mt-3"
                  >
                    Clear route filter
                  </Button>
                ) : null}
              </SectionCard>
            ) : (
              <>
                {groups.length > 0 ? (
                  <SectionCard
                    title="Network timeline"
                    sub={`${filteredDatedCount} dated records. Open a route for maps, speed history, and full citations.`}
                    right={<Badge variant="neutral">Newest first</Badge>}
                  >
                    <InterventionTimeline groups={groups} studyRowsByJoinKey={studyRowsByJoinKey} />
                  </SectionCard>
                ) : null}

                {undatedRows.length > 0 ? (
                  <SectionCard
                    title="Undated records"
                    sub="Documented treatments, projects, and source gaps without a defensible event date."
                  >
                    <div className="flex flex-col">
                      {undatedRows.map((row, index) => (
                        <div key={row.key}>
                          {index === 0 ? null : <Separator />}
                          <div className="py-3.5 first:pt-0 last:pb-0">
                            <InterventionRecord
                              row={row}
                              study={studyIndexRowForEventId(row.event.eventId, studyRowsByJoinKey)}
                              undated
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                ) : null}

                {remaining > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setLimit((value) => value + INTERVENTIONS_PAGE_SIZE)}
                    className="w-full"
                  >
                    {`Show ${Math.min(INTERVENTIONS_PAGE_SIZE, remaining)} more (${remaining} left)`}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function TimelineCount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold text-[var(--bp-color-ink-55)]">{label}</dt>
      <dd className="m-0 mt-1 font-mono text-[17px] font-semibold tabular-nums">{value}</dd>
    </div>
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

function InterventionTimeline({
  groups,
  studyRowsByJoinKey,
}: {
  groups: readonly { year: string; rows: InterventionRow[] }[];
  studyRowsByJoinKey: ReadonlyMap<string, StudyIndexRow | null>;
}) {
  return (
    <ol
      aria-label="Network intervention timeline"
      className="relative m-0 flex list-none flex-col gap-7 p-0 before:pointer-events-none before:absolute before:bottom-4 before:left-[75px] before:top-2 before:w-px before:bg-[var(--bp-color-rule)] max-sm:before:left-[5px]"
    >
      {groups.map((group) => (
        <li
          key={group.year}
          className="relative grid grid-cols-[72px_minmax(0,1fr)] gap-8 max-sm:block"
        >
          <div className="pt-0.5 max-sm:mb-3 max-sm:pl-7">
            <div className="font-mono text-[15px] font-semibold tabular-nums leading-none">
              {group.year}
            </div>
            <div className="mt-1.5 font-mono text-[9.5px] tabular-nums text-[var(--bp-color-ink-40)]">
              {`${group.rows.length} ${group.rows.length === 1 ? "record" : "records"}`}
            </div>
          </div>
          <ol className="m-0 flex list-none flex-col gap-6 p-0 max-sm:pl-7">
            {group.rows.map((row, index) => {
              const study = studyIndexRowForEventId(row.event.eventId, studyRowsByJoinKey);
              const tone = timelineTone(row.event, study);
              return (
                <li key={row.key} className="relative">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute -left-[33px] top-1.5 block ring-[3px] ring-[var(--bp-color-card)] max-sm:-left-[27px]",
                      index === 0 ? "size-2.5 rounded-[2px]" : "size-2 rounded-full",
                      timelineToneClass[tone],
                    )}
                  />
                  <InterventionRecord row={row} study={study} />
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ol>
  );
}

type TimelineTone = "accent" | "good" | "warn" | "bad" | "neutral";

const timelineToneClass: Record<TimelineTone, string> = {
  accent: "bg-[var(--bp-color-accent)]",
  good: "bg-[var(--bp-color-good)]",
  warn: "bg-[var(--bp-color-warn)]",
  bad: "bg-[var(--bp-color-bad)]",
  neutral: "bg-[var(--bp-color-card)] shadow-[inset_0_0_0_1px_var(--bp-color-ink-40)]",
};

function timelineTone(event: InterventionDisplayEvent, study?: StudyIndexRow): TimelineTone {
  if (event.source === "source_gap" || event.filterState === "source-gap") return "warn";
  if (study !== undefined) return studyTone(study.direction);
  if (event.comparisonCohort !== undefined) {
    const effect =
      event.comparisonCohort.adjustedSpeedDeltaMph ?? event.comparisonCohort.routeSpeedDeltaMph;
    if (effect === null || effect === 0) return "neutral";
    return effect > 0 ? "good" : "bad";
  }
  if (event.filterState === "future") return "accent";
  if (event.tone === "good" || event.tone === "warn" || event.tone === "bad") return event.tone;
  if (event.source === "wiki" || event.source === "corpus") return "neutral";
  return "accent";
}

function InterventionRecord({
  row,
  study,
  undated = false,
}: {
  row: InterventionRow;
  study?: StudyIndexRow | undefined;
  undated?: boolean;
}) {
  const hasStudySummary = row.event.comparisonCohort !== undefined;
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
    <article
      className={cn(
        "grid items-start gap-5 max-md:grid-cols-1 max-md:gap-3",
        hasStudySummary ? "grid-cols-[minmax(0,1fr)_170px]" : "grid-cols-1",
      )}
    >
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {undated ? (
            <span className="font-mono text-[10.5px] text-[var(--bp-color-ink-40)]">Undated</span>
          ) : (
            <time
              dateTime={timelineDateTime(row.event.year)}
              className="font-mono text-[10.5px] font-semibold tabular-nums text-[var(--bp-color-ink-55)]"
            >
              {timelineDateLabel(row.event.year)}
            </time>
          )}
          {row.routes.length === 0 ? (
            <span className="font-mono text-[10.5px] text-[var(--bp-color-ink-40)]">Network</span>
          ) : (
            row.routes.map((route) => (
              <Link
                key={route.slug}
                to="/routes/$routeId"
                params={{ routeId: route.slug }}
                search={{
                  tab: "history",
                  record: recordTargetForRoute(row, route.slug),
                }}
                viewTransition
                className="no-underline"
              >
                <RouteBadge
                  route={route.routeId}
                  displayLabel={route.displayLabel}
                  sbs={route.sbs}
                  size="sm"
                />
              </Link>
            ))
          )}
          <Badge variant="neutral">{humanizeKind(row.event.kind)}</Badge>
          <EventStatusBadge row={row} study={study} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {primaryRoute === null ? (
            <span className="text-[13.5px] font-semibold leading-[1.3] text-[var(--bp-color-ink)]">
              {row.event.title}
            </span>
          ) : (
            <Link
              to="/routes/$routeId"
              params={{ routeId: primaryRoute.slug }}
              search={{
                tab: "history",
                record: recordTargetForRoute(row, primaryRoute.slug),
              }}
              viewTransition
              className="text-[13.5px] font-semibold leading-[1.3] text-[var(--bp-color-ink)] no-underline hover:text-[var(--bp-color-accent)]"
            >
              {row.event.title}
            </Link>
          )}
        </div>
        <div className="mt-1.5 text-[12px] leading-[1.5] text-[var(--bp-color-ink-70)]">
          {row.event.detail}
        </div>
        {entries.length > 0 ? (
          <div className="mt-1.5">
            <SourceNote entries={entries} />
          </div>
        ) : null}
      </div>
      <StudySummary row={row} study={study} />
    </article>
  );
}

function StudySummary({ row, study }: { row: InterventionRow; study: StudyIndexRow | undefined }) {
  const cohort = row.event.comparisonCohort;
  if (cohort && study !== undefined && study.effectMph !== null) {
    return (
      <aside className="text-right text-[11px] leading-[1.4] text-[var(--bp-color-ink-55)] max-md:text-left">
        <div
          className="font-mono text-[15px] font-semibold tabular-nums"
          style={{ color: studyToneColor(studyTone(study.direction)) }}
        >
          {signedMphLabel(study.effectMph)}
        </div>
        {study.confidenceInterval === null ? null : (
          <div className="mt-1 font-mono tabular-nums">{ciLongLabel(study.confidenceInterval)}</div>
        )}
        <div className="mt-1.5">
          <Link
            to="/routes/$routeId"
            params={{ routeId: study.routeSlug }}
            search={{ tab: "history", study: study.eventKey }}
            viewTransition
            className="font-semibold text-[var(--bp-color-accent)]"
          >
            View study →
          </Link>
        </div>
      </aside>
    );
  }
  if (cohort) {
    return (
      <aside className="text-right text-[11px] leading-[1.4] text-[var(--bp-color-ink-55)] max-md:text-left">
        <div className="font-mono text-[15px] font-semibold tabular-nums text-[var(--bp-color-ink)]">
          {formatDelta(cohort.adjustedSpeedDeltaMph ?? cohort.routeSpeedDeltaMph)}
        </div>
        <div className="mt-1">{cohort.causalInterpretation.replaceAll("_", " ")}</div>
        <div className="mt-1">{cohort.routeCount} comparison routes</div>
      </aside>
    );
  }
  return null;
}

function EventStatusBadge({
  row,
  study,
}: {
  row: InterventionRow;
  study: StudyIndexRow | undefined;
}) {
  const { event } = row;
  if (event.source === "source_gap" || event.filterState === "source-gap") {
    return <Badge variant="warn">Needs source</Badge>;
  }
  if (isFutureRow(row)) return <Badge variant="accent">Future</Badge>;
  if (study !== undefined || event.comparisonCohort !== undefined) {
    return <Badge variant={timelineTone(event, study)}>Evaluated</Badge>;
  }
  if (event.documented) return <Badge variant="neutral">Documented</Badge>;
  return null;
}

function humanizeKind(kind: string): string {
  return kind.replaceAll("_", " ").trim();
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function timelineDateTime(dateish: string): string {
  const isoDate = dateish.match(/^\d{4}(?:-\d{2})?(?:-\d{2})?/u)?.[0];
  return isoDate ?? yearLabel(dateish);
}

function timelineDateLabel(dateish: string): string {
  const isoParts = dateish.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/u);
  if (isoParts !== null) {
    const month = MONTH_LABELS[Number(isoParts[2]) - 1];
    if (month !== undefined) return isoParts[3] === undefined ? month : `${month} ${isoParts[3]}`;
  }
  const year = yearLabel(dateish);
  const remainder = dateish.replace(year, "").trim();
  return remainder.length > 0 ? remainder : "Year";
}

export function interventionRows(
  routes: readonly StudioRoute[],
  evidence: readonly (InterventionEvidenceBundle | null)[] = [],
  corpus: StudioInterventionCorpus | null = null,
  facetIndex: StudioInterventionFacetIndex | null = null,
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
          facets: [],
          event: {
            ...event,
            recordId: event.eventId ?? `${route.slug}:serving:${event.year}:${index}`,
            sortKey: event.year,
            kind: event.interventionType ?? "program record",
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

  return attachInterventionFacets(
    [...enrichedRegistryRows, ...corpusInterventionRows(routes, corpus, registryEventIds)],
    facetIndex,
  ).sort(
    (left, right) =>
      right.event.sortKey.localeCompare(left.event.sortKey) ||
      (left.routes[0]?.label ?? "").localeCompare(right.routes[0]?.label ?? "") ||
      left.event.title.localeCompare(right.event.title),
  );
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
  const routesByExactId = new Map(routes.map((route) => [route.routeId, route]));
  return (corpus?.records ?? []).flatMap((record): InterventionRow[] => {
    if (record.matchedRegistryEventIds.some((eventId) => visibleRegistryEventIds.has(eventId))) {
      return [];
    }
    const matchedRoutes = record.routes.flatMap((routeId) => {
      const route = routesByExactId.get(routeId);
      return route === undefined ? [] : [route];
    });
    const unmatchedRouteIds = record.routes.filter((routeId) => !routesByExactId.has(routeId));
    const status = record.statusLatest ?? record.recordKind.replaceAll("_", " ");
    const corridor = record.corridorStreets.join(", ");
    const unmatchedRoutes =
      unmatchedRouteIds.length > 0 ? ` — Unmatched routes: ${unmatchedRouteIds.join(", ")}` : "";
    return [
      {
        key: `corpus:${record.recordId}`,
        routes: matchedRoutes,
        evidence: null,
        facets: [],
        event: {
          recordId: record.recordId,
          relationshipIds: record.matchedRegistryEventIds,
          searchTerms: [
            ...record.corridorStreets,
            ...record.primaryTreatments,
            ...record.customTreatments,
            record.sourceLabel,
          ],
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
    facets: [],
    event: {
      recordId: event.recordId,
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
    facets: [],
    event: {
      recordId: intervention.recordId,
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
    facets: [],
    event: {
      recordId: project.recordId,
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
    facets: [],
    event: {
      recordId: gap.recordId,
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

function attachInterventionFacets(
  rows: readonly InterventionRow[],
  facetIndex: StudioInterventionFacetIndex | null,
): InterventionRow[] {
  if (facetIndex === null) return [...rows];
  const facetsByRelationshipId = new Map<string, StudioInterventionFacetIndexRow[]>();
  for (const facet of facetIndex.rows) {
    const relationshipIds = new Set([
      facet.facetId,
      facet.sourceRecordId,
      ...(facet.sourceOccurrenceId === null ? [] : [facet.sourceOccurrenceId]),
      ...(facet.occurrenceId === null ? [] : [facet.occurrenceId]),
      ...facet.treatmentIds,
      ...facet.projectIds,
    ]);
    for (const relationshipId of relationshipIds) {
      const related = facetsByRelationshipId.get(relationshipId) ?? [];
      related.push(facet);
      facetsByRelationshipId.set(relationshipId, related);
    }
  }

  return rows.map((row) => {
    const rowRouteSlugs = new Set(row.routes.map((route) => route.slug));
    const relationshipIds = new Set([
      row.event.recordId,
      ...(row.event.eventId === undefined ? [] : [row.event.eventId]),
      ...(row.event.relationshipIds ?? []),
    ]);
    const byFacetId = new Map<string, StudioInterventionFacetIndexRow>();
    for (const relationshipId of relationshipIds) {
      for (const facet of facetsByRelationshipId.get(relationshipId) ?? []) {
        if (rowRouteSlugs.size > 0 && !rowRouteSlugs.has(facet.routeSlug)) continue;
        byFacetId.set(facet.facetId, facet);
      }
    }
    return { ...row, facets: [...byFacetId.values()].sort(compareFacetRows) };
  });
}

function compareFacetRows(
  left: StudioInterventionFacetIndexRow,
  right: StudioInterventionFacetIndexRow,
): number {
  return (
    left.routeSlug.localeCompare(right.routeSlug) ||
    (right.effectiveDate ?? "").localeCompare(left.effectiveDate ?? "") ||
    left.facetId.localeCompare(right.facetId)
  );
}

export function filterInterventionRows(
  rows: readonly InterventionRow[],
  search: InterventionsSearch,
  options: { facetIndexAvailable: boolean },
): InterventionRow[] {
  const query = search.q?.trim().toLocaleLowerCase();
  const selectedFamily = search.family;
  return rows.filter((row) => {
    if (search.status !== undefined && !matchesFilter(row, search.status)) return false;
    if (
      search.borough !== undefined &&
      !row.routes.some((route) => route.borough === search.borough)
    ) {
      return false;
    }
    if (
      search.route !== undefined &&
      !row.routes.some((route) => route.slug === search.route) &&
      !row.facets.some((facet) => facet.routeSlug === search.route)
    ) {
      return false;
    }
    if (
      options.facetIndexAvailable &&
      selectedFamily !== undefined &&
      selectedFamily !== "all" &&
      !row.facets.some((facet) => facet.treatmentFamilies.includes(selectedFamily))
    ) {
      return false;
    }
    if (query !== undefined && query.length > 0 && !interventionSearchText(row).includes(query)) {
      return false;
    }
    return true;
  });
}

function matchesFilter(row: InterventionRow, filter: InterventionFilter): boolean {
  if (filter === "evaluated") return row.event.comparisonCohort !== undefined;
  if (filter === "future") return isFutureRow(row);
  if (filter === "source-gap") {
    return row.event.source === "source_gap" || row.event.filterState === "source-gap";
  }
  return true;
}

function isFutureRow(row: InterventionRow): boolean {
  return (
    row.event.filterState === "future" ||
    row.facets.some((facet) => FUTURE_LIFECYCLE_STATES.has(facet.lifecycleState))
  );
}

function interventionSearchText(row: InterventionRow): string {
  return [
    row.event.title,
    row.event.detail,
    row.event.kind,
    row.event.sourceLabel,
    ...(row.event.searchTerms ?? []),
    ...row.routes.flatMap((route) => [
      route.routeId,
      route.displayLabel,
      route.corridor,
      route.corridorFull,
    ]),
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ")
    .toLocaleLowerCase();
}

export function compactInterventionsSearch(search: InterventionsSearch): InterventionsSearch {
  return {
    ...(search.status === undefined || search.status === "all" ? {} : { status: search.status }),
    ...(search.borough === undefined || search.borough === ROUTE_INDEX_ALL_BOROUGHS
      ? {}
      : { borough: search.borough }),
    ...(search.family === undefined || search.family === "all" ? {} : { family: search.family }),
    ...(search.route === undefined || search.route.trim().length === 0
      ? {}
      : { route: search.route.trim() }),
    ...(search.q === undefined || search.q.trim().length === 0 ? {} : { q: search.q.trim() }),
  };
}

export function interventionsPaginationResetKey(search: InterventionsSearch): string {
  return JSON.stringify([
    search.status ?? null,
    search.borough ?? null,
    search.family ?? null,
    search.route ?? null,
    search.q ?? null,
  ]);
}

export function interventionMatchAnnouncement(count: number): string {
  return count === 1
    ? "1 intervention record matches the current filters."
    : `${count} intervention records match the current filters.`;
}

function omitInterventionsSearchKey(
  search: InterventionsSearch,
  key: keyof InterventionsSearch,
): InterventionsSearch {
  const next = { ...search };
  delete next[key];
  return next;
}

export function recordTargetForRoute(row: InterventionRow, routeSlug: string): string {
  const facet = row.facets.find((candidate) => candidate.routeSlug === routeSlug);
  return (
    facet?.occurrenceId ??
    facet?.treatmentIds[0] ??
    facet?.projectIds[0] ??
    facet?.sourceOccurrenceId ??
    row.event.recordId
  );
}

function formatDelta(value: number | null): string {
  if (value === null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} mph`;
}
