import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { NetworkBuildout } from "@/components/interventions/NetworkBuildout";

export { PublicInterventions as PublicInterventionsPage } from "@/components/interventions/PublicInterventions";

import { ProposedPlans } from "@/components/interventions/ProposedPlans";
import {
  ROUTE_CHANGE_INDEX_ROWS,
  RouteChangeIndex,
} from "@/components/interventions/RouteChangeIndex";
import { RouteBadge } from "@/components/RouteBadge";
import { citationEntries, SourceNote, type SourceNoteEntry } from "@/components/SourceNote";
import {
  ciLongLabel,
  signedMphLabel,
  studyIndexRowForEventId,
  studyIndexRowsByJoinKey,
} from "@/components/study/study-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { InterventionsSearch } from "@/routes/interventions";
import type {
  StudioIntervention,
  StudioInterventionCorpus,
  StudioInterventionCorpusRecord,
  StudioInterventionFacetIndex,
  StudioInterventionFacetIndexRow,
  StudioInterventionsEvidenceBundle,
  StudioInterventionsEvidenceIntervention,
  StudioInterventionsEvidenceProject,
  StudioInterventionsEvidenceSourceGap,
  StudioInterventionsEvidenceTimelineEvent,
  StudioInterventionTreatmentFamily,
  StudioRoute,
  StudioRouteEvidenceBundle,
  StudyIndexArtifact,
  StudyIndexRow,
} from "../api-contract.js";
import {
  type ChangeDate,
  changeDateGroupLabel,
  compareChangeDatesNewestFirst,
  parseChangeDate,
} from "../change-date.js";
import { ROUTE_INDEX_ALL_BOROUGHS, ROUTE_INDEX_BOROUGHS } from "../home-route-index.js";
import {
  networkBuildout,
  proposedPlanGroups,
  type RouteChangeGroup,
  routeChangeIndex,
} from "../network-change-record.js";

type InterventionEvidenceBundle = StudioInterventionsEvidenceBundle | StudioRouteEvidenceBundle;

type InterventionFilter = "all" | "evaluated" | "future" | "source-gap";
type InterventionView = "documented" | "planned";

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
  /** The typed reading of the same source string `year` holds. */
  date: ChangeDate;
  kind: string;
  title: string;
  detail: string;
  source: "serving" | "wiki" | "corpus" | "source_gap";
  citationKeys: string[];
  sourceEntries?: SourceNoteEntry[];
  filterState?: "future" | "source-gap";
  recordId: string;
  relationshipIds?: readonly string[];
  searchTerms?: readonly string[];
  planLabel?: string;
  plannedStatus?: string;
};

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
  const buildout = useMemo(() => networkBuildout(routes), [routes]);
  const changeGroup: RouteChangeGroup = search.group ?? "recent";
  const changeIndex = useMemo(
    () =>
      routeChangeIndex(routes, {
        group: changeGroup,
        studiesIndex,
        corpus,
        lastYear: buildout.lastYear,
        lastCompleteYear: buildout.lastCompleteYear,
        limit: ROUTE_CHANGE_INDEX_ROWS,
      }),
    [buildout.lastCompleteYear, buildout.lastYear, changeGroup, corpus, routes, studiesIndex],
  );
  const proposed = useMemo(() => proposedPlanGroups(corpus), [corpus]);
  const exactRouteSlugs = useMemo(() => new Set(routes.map((route) => route.slug)), [routes]);
  const unmatchedRoute = search.route !== undefined && !exactRouteSlugs.has(search.route);
  const filteredRows = useMemo(
    () =>
      unmatchedRoute
        ? []
        : filterInterventionRows(rows, search, {
            facetIndexAvailable: facetIndex !== null,
            studyRowsByJoinKey,
          }),
    [facetIndex, rows, search, studyRowsByJoinKey, unmatchedRoute],
  );
  const view = interventionView(search);
  const visibleRows = filteredRows.slice(0, limit);
  const remaining = filteredRows.length - visibleRows.length;
  const datedRows = visibleRows.filter((row) => changeDateGroupLabel(row.event.date) !== "Undated");
  const undatedRows = visibleRows.filter(
    (row) => changeDateGroupLabel(row.event.date) === "Undated",
  );
  const groups =
    view === "documented"
      ? yearGroups(
          datedRows,
          filteredRows.filter((row) => changeDateGroupLabel(row.event.date) !== "Undated"),
        )
      : planGroups(visibleRows, filteredRows);
  const documentedCount = rows.filter((row) => !isPlannedRow(row)).length;
  const plannedCount = rows.length - documentedCount;
  const studiedCount = rows.filter(
    (row) => studyIndexRowForEventId(row.event.eventId, studyRowsByJoinKey) !== undefined,
  ).length;
  const facetGapCount = rows.filter((row) => row.facets.length === 0).length;
  const updateSearch = (next: InterventionsSearch) => {
    setLimit(INTERVENTIONS_PAGE_SIZE);
    onSearchChange(compactInterventionsSearch(next));
  };
  const updateView = (next: InterventionView) => {
    const withoutLegacyStatus = omitInterventionsSearchKey(search, "status");
    updateSearch(
      next === "planned"
        ? { ...withoutLegacyStatus, view: next }
        : omitInterventionsSearchKey(withoutLegacyStatus, "view"),
    );
  };

  useEffect(() => {
    setLimit(INTERVENTIONS_PAGE_SIZE);
  }, [paginationResetKey]);

  return (
    <main className="min-h-full bg-[var(--bp-color-paper)]">
      <section className="mx-auto max-w-[1180px] px-9 pb-16 max-sm:px-4">
        <header className="-mx-9 border-b border-[var(--bp-color-rule)] bg-[var(--bp-color-card)] px-9 pb-10 pt-14 max-sm:-mx-4 max-sm:px-4 max-sm:pb-8 max-sm:pt-10">
          <h1 className="m-0 max-w-[820px] text-[52px] font-semibold leading-[1.04] tracking-[-0.04em] text-balance max-md:text-[40px] max-sm:text-[34px]">
            What the city built for buses — and what it changed.
          </h1>
          <p className="mb-0 mt-5 max-w-[720px] text-[15px] leading-[1.6] text-[var(--bp-color-ink-70)] text-pretty">
            Every documented bus lane, busway, camera corridor, and service change on the tracked
            network — with matched-control studies where the data can support them.
          </p>
          <p className="mb-0 mt-4 font-mono text-[11px] tabular-nums text-[var(--bp-color-ink-55)]">
            {`${documentedCount} documented, ${plannedCount} planned, ${studiedCount} studied`}
          </p>
          <p aria-live="polite" className="sr-only">
            {interventionMatchAnnouncement(filteredRows.length)}
          </p>
        </header>

        <div className="mt-6">
          <NetworkBuildout buildout={buildout} />
        </div>
        <RouteChangeIndex
          index={changeIndex}
          routesWithAnyChange={buildout.routesWithAnyChange}
          routesWithNoChange={buildout.routesWithNoChange}
          firstYear={buildout.firstYear}
          ledgerHref="#network-ledger-title"
          onGroupChange={(group) =>
            updateSearch(
              group === "recent"
                ? omitInterventionsSearchKey(search, "group")
                : { ...search, group },
            )
          }
        />
        <ProposedPlans proposed={proposed} />

        <section
          aria-labelledby="network-ledger-title"
          className="mt-5 overflow-hidden rounded-[4px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)] scroll-mt-4"
        >
          <div className="flex items-stretch justify-between border-b border-[var(--bp-color-rule)] max-md:flex-col">
            <div className="min-w-0 flex-1 px-5 py-4">
              <h2 id="network-ledger-title" className="m-0 text-[16px] font-semibold">
                The full record
              </h2>
              <p className="mb-0 mt-1 text-[11.5px] text-[var(--bp-color-ink-55)]">
                Every documented and proposed change, searchable and filterable by route, kind and
                borough. Open a route for maps, speed history, and full citations.
              </p>
            </div>
            <ToggleGroup
              role="tablist"
              aria-label="Intervention record status"
              value={[view]}
              onValueChange={(values) => {
                const next = values[0];
                if (next === "documented" || next === "planned") updateView(next);
              }}
              spacing={0}
              className="flex shrink-0 border-l border-[var(--bp-color-rule)] max-md:border-l-0 max-md:border-t"
            >
              {(
                [
                  ["documented", "Documented", documentedCount],
                  ["planned", "Planned", plannedCount],
                ] as const
              ).map(([id, label, count]) => (
                <ToggleGroupItem
                  key={id}
                  id={`intervention-tab-${id}`}
                  value={id}
                  role="tab"
                  aria-controls="intervention-ledger-content"
                  aria-selected={view === id}
                  className="h-auto min-w-[132px] flex-col items-start rounded-none border-0 border-l border-[var(--bp-color-rule)] bg-transparent px-5 py-3 text-left first:border-l-0 aria-selected:bg-[var(--bp-color-paper-deep)] max-sm:min-w-0 max-sm:flex-1"
                >
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
                    {label}
                  </span>
                  <span className="font-mono text-[21px] font-semibold leading-none tabular-nums">
                    {count}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-b border-[var(--bp-color-rule)] px-4 py-3">
            <div className="min-w-[210px] flex-[1_1_260px]">
              <label htmlFor="intervention-search" className="sr-only">
                Search records
              </label>
              <Input
                id="intervention-search"
                type="search"
                value={search.q ?? ""}
                placeholder="Route, street, or corridor…"
                onChange={(event) => updateSearch({ ...search, q: event.currentTarget.value })}
              />
            </div>
            <div className="flex h-8 items-center gap-2 whitespace-nowrap px-1 text-[12px] font-medium text-[var(--bp-color-ink-70)]">
              <input
                id="intervention-studied"
                type="checkbox"
                checked={search.studied ?? false}
                onChange={(event) =>
                  updateSearch(
                    event.currentTarget.checked
                      ? { ...search, studied: true }
                      : omitInterventionsSearchKey(search, "studied"),
                  )
                }
                className="size-4 shrink-0 cursor-pointer accent-[var(--bp-color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bp-color-accent)]"
              />
              <label htmlFor="intervention-studied" className="cursor-pointer">
                Studied only
              </label>
            </div>
            <ToolbarSelect
              id="intervention-family"
              label="Kind"
              value={search.family ?? "all"}
              disabled={facetIndex === null}
              onValueChange={(family) =>
                updateSearch(
                  family === "all"
                    ? omitInterventionsSearchKey(search, "family")
                    : {
                        ...search,
                        family: family as StudioInterventionTreatmentFamily,
                      },
                )
              }
              options={[
                { value: "all", label: "All kinds" },
                ...Object.entries(FAMILY_LABELS).map(([family, label]) => ({
                  value: family,
                  label,
                })),
              ]}
            />
            <ToolbarSelect
              id="intervention-borough"
              label="Borough"
              value={search.borough ?? ROUTE_INDEX_ALL_BOROUGHS}
              onValueChange={(borough) =>
                updateSearch(
                  borough === ROUTE_INDEX_ALL_BOROUGHS
                    ? omitInterventionsSearchKey(search, "borough")
                    : { ...search, borough: borough as BoroughFilter },
                )
              }
              options={[ROUTE_INDEX_ALL_BOROUGHS, ...ROUTE_INDEX_BOROUGHS].map((borough) => ({
                value: borough,
                label: borough,
              }))}
            />
          </div>
          {facetIndex === null ? (
            <p className="m-0 border-b border-[var(--bp-color-rule)] px-4 py-2 text-[10.5px] leading-[1.4] text-[var(--bp-color-ink-55)]">
              Typed family filters are unavailable; all known records remain visible.
            </p>
          ) : facetGapCount > 0 ? (
            <p className="m-0 border-b border-[var(--bp-color-rule)] px-4 py-2 text-[10.5px] leading-[1.4] text-[var(--bp-color-ink-55)]">
              {`${facetGapCount} records have no typed facet join and remain visible.`}
            </p>
          ) : null}

          <div
            id="intervention-ledger-content"
            role="tabpanel"
            aria-labelledby={`intervention-tab-${view}`}
          >
            {filteredRows.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title={unmatchedRoute ? "Route not found" : "No matching interventions"}
                  body={
                    unmatchedRoute
                      ? `No route has the exact slug “${search.route ?? ""}”. Clear the route filter to see network records.`
                      : "Choose another tab, borough, kind, route, study setting, or search term to return records to the ledger."
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
              </div>
            ) : (
              <>
                <div
                  aria-hidden="true"
                  className="grid grid-cols-[120px_52px_92px_minmax(0,1fr)_180px] gap-3 border-b border-[var(--bp-color-rule)] bg-[var(--bp-color-paper-deep)] px-4 py-2 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)] max-md:hidden"
                >
                  <span>{view === "documented" ? "Year" : "Source plan"}</span>
                  <span>When</span>
                  <span>Route</span>
                  <span>Intervention</span>
                  <span className="text-right">Outcome</span>
                </div>
                <ol aria-label="Network intervention ledger" className="m-0 list-none p-0">
                  {groups.flatMap((group) =>
                    group.rows.map((row, index) => (
                      <LedgerRow
                        key={row.key}
                        row={row}
                        group={index === 0 ? group : null}
                        study={studyIndexRowForEventId(row.event.eventId, studyRowsByJoinKey)}
                      />
                    )),
                  )}
                </ol>
                {view === "documented" && undatedRows.length > 0 ? (
                  <UndatedRollups rows={undatedRows} />
                ) : null}
                {remaining > 0 ? (
                  <div className="border-t border-[var(--bp-color-rule)] p-3 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setLimit((value) => value + INTERVENTIONS_PAGE_SIZE)}
                    >
                      {`Show ${Math.min(INTERVENTIONS_PAGE_SIZE, remaining)} more (${remaining} left)`}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function ToolbarSelect({
  id,
  label,
  value,
  options,
  disabled = false,
  onValueChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="min-w-[126px] max-sm:flex-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (typeof next === "string") onValueChange(next);
        }}
      >
        <SelectTrigger id={id} className="w-full text-[12px]">
          <span className="text-[var(--bp-color-ink-55)]">{`${label}:`}</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function yearLabel(dateish: string): string {
  const year = dateish.match(/\b\d{4}\b/)?.[0];
  if (year) return year;
  return "Undated";
}

type LedgerGroupModel = { label: string; count: number; rows: InterventionRow[] };

export function yearGroups(
  rows: readonly InterventionRow[],
  allRows: readonly InterventionRow[] = rows,
): LedgerGroupModel[] {
  return ledgerGroups(rows, allRows, (row) => changeDateGroupLabel(row.event.date));
}

export function planGroups(
  rows: readonly InterventionRow[],
  allRows: readonly InterventionRow[] = rows,
): LedgerGroupModel[] {
  return ledgerGroups(
    rows,
    allRows,
    (row) => row.event.planLabel ?? "Plan not named in source",
  ).sort((left, right) => left.label.localeCompare(right.label));
}

function ledgerGroups(
  rows: readonly InterventionRow[],
  allRows: readonly InterventionRow[],
  labelFor: (row: InterventionRow) => string,
): LedgerGroupModel[] {
  const totals = new Map<string, number>();
  for (const row of allRows) {
    const label = labelFor(row);
    totals.set(label, (totals.get(label) ?? 0) + 1);
  }
  const groups: LedgerGroupModel[] = [];
  for (const row of rows) {
    const label = labelFor(row);
    const current = groups.find((group) => group.label === label);
    if (current !== undefined) current.rows.push(row);
    else groups.push({ label, count: totals.get(label) ?? 1, rows: [row] });
  }
  return groups;
}

function LedgerRow({
  row,
  group,
  study,
}: {
  row: InterventionRow;
  group: LedgerGroupModel | null;
  study: StudyIndexRow | undefined;
}) {
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
    <li
      className={`grid grid-cols-[120px_52px_92px_minmax(0,1fr)_180px] items-start gap-3 border-b border-[var(--bp-color-rule)] px-4 py-3 last:border-b-0 max-md:grid-cols-[76px_minmax(0,1fr)] max-md:gap-x-3 max-md:gap-y-2${group === null ? "" : " border-t border-t-[var(--bp-color-ink-20)] first:border-t-0"}`}
    >
      {group === null ? (
        <div className="max-md:hidden" />
      ) : (
        <div className="min-w-0 max-md:col-start-1 max-md:row-span-4">
          <div className="break-words font-mono text-[13px] font-semibold leading-[1.2]">
            {group.label}
          </div>
          <div className="mt-1 font-mono text-[9px] tabular-nums text-[var(--bp-color-ink-40)]">
            {`${group.count} records`}
          </div>
        </div>
      )}
      <div className="max-md:col-start-2">
        {row.event.date.precision === "unknown" ? (
          <span className="font-mono text-[10px] text-[var(--bp-color-ink-40)]">No date</span>
        ) : (
          <time
            dateTime={row.event.date.start}
            className="font-mono text-[10.5px] tabular-nums text-[var(--bp-color-ink-55)]"
          >
            {row.event.date.display}
          </time>
        )}
      </div>
      <div className="flex flex-wrap gap-1 max-md:col-start-2">
        {row.routes.length === 0 ? (
          <span className="font-mono text-[10.5px] text-[var(--bp-color-ink-40)]">Network</span>
        ) : (
          row.routes.map((route) => (
            <Link
              key={route.slug}
              to="/routes/$routeId"
              params={{ routeId: route.slug }}
              search={{ tab: "history", record: recordTargetForRoute(row, route.slug) }}
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
      </div>
      <article className="min-w-0 max-md:col-start-2">
        <div className="flex flex-wrap items-center gap-2">
          {primaryRoute === null ? (
            <span className="text-[13px] font-semibold leading-[1.3] text-[var(--bp-color-ink)]">
              {row.event.title}
            </span>
          ) : (
            <Link
              to="/routes/$routeId"
              params={{ routeId: primaryRoute.slug }}
              search={{ tab: "history", record: recordTargetForRoute(row, primaryRoute.slug) }}
              viewTransition
              className="text-[13px] font-semibold leading-[1.3] text-[var(--bp-color-ink)] no-underline hover:text-[var(--bp-color-accent)]"
            >
              {row.event.title}
            </Link>
          )}
          <EventStatusBadge row={row} />
        </div>
        {row.facets.some((facet) => facet.treatmentKinds.includes("other_documented")) ? (
          <div className="mt-1 text-[11px] leading-[1.4] text-[var(--bp-color-ink-55)]">
            {row.event.kind}
          </div>
        ) : null}
        {entries.length > 0 ? (
          <div className="mt-1">
            <SourceNote entries={entries} />
          </div>
        ) : null}
      </article>
      <StudySummary row={row} study={study} />
    </li>
  );
}

function StudySummary({ row, study }: { row: InterventionRow; study: StudyIndexRow | undefined }) {
  const cohort = row.event.comparisonCohort;
  if (study !== undefined) {
    return (
      <aside className="text-right text-[11px] leading-[1.4] text-[var(--bp-color-ink-55)] max-md:col-start-2 max-md:text-left">
        <div className="font-mono text-[15px] font-semibold tabular-nums text-[var(--bp-color-accent)]">
          {study.effectMph === null ? "Not estimable" : signedMphLabel(study.effectMph)}
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
            {`${studyRegisterLabel(study)} →`}
          </Link>
        </div>
      </aside>
    );
  }
  if (cohort) {
    return (
      <aside className="text-right text-[11px] leading-[1.4] text-[var(--bp-color-ink-55)] max-md:col-start-2 max-md:text-left">
        <div className="font-mono text-[13px] font-medium tabular-nums text-[var(--bp-color-ink-55)]">
          {formatDelta(cohort.adjustedSpeedDeltaMph ?? cohort.routeSpeedDeltaMph)}
        </div>
        <div className="mt-0.5">peer-adjusted</div>
      </aside>
    );
  }
  return null;
}

export function studyRegisterLabel(study: StudyIndexRow): string {
  return study.claimTier === "gated_estimate" ? "matched-segment study" : "descriptive study";
}

function EventStatusBadge({ row }: { row: InterventionRow }) {
  const { event } = row;
  if (event.source === "source_gap" || event.filterState === "source-gap") {
    return <Badge variant="warn">Needs source</Badge>;
  }
  if (isPlannedRow(row))
    return (
      <Badge variant="accent" className="capitalize">
        {plannedStatusLabel(row)}
      </Badge>
    );
  return null;
}

function plannedStatusLabel(row: InterventionRow): string {
  const status =
    row.event.plannedStatus ??
    row.facets.find((facet) => FUTURE_LIFECYCLE_STATES.has(facet.lifecycleState))?.lifecycleState ??
    "planned";
  return status.replaceAll("_", " ");
}

function UndatedRollups({ rows }: { rows: readonly InterventionRow[] }) {
  const routes = [
    ...new Map(rows.flatMap((row) => row.routes.map((route) => [route.slug, route]))).values(),
  ];
  return (
    <section
      aria-label="Undated intervention rollups"
      className="flex flex-wrap items-center gap-3 border-t border-[var(--bp-color-rule)] bg-[var(--bp-color-paper)] px-4 py-2.5 text-[12px] text-[var(--bp-color-ink-70)]"
    >
      <span className="min-w-[220px] flex-1">
        {`Records without a defensible date: ${rows.length}`}
      </span>
      {routes.map((route) => (
        <Link
          key={route.slug}
          to="/routes/$routeId"
          params={{ routeId: route.slug }}
          search={{ tab: "history" }}
          className="whitespace-nowrap text-[11.5px]"
        >
          {`${route.displayLabel ?? route.label} Route History →`}
        </Link>
      ))}
    </section>
  );
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
            date: parseChangeDate(event.year),
            kind: event.interventionType ?? "program record",
            source: "serving",
            citationKeys: [],
            ...(event.sourceLabel === undefined ? {} : { planLabel: event.sourceLabel }),
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
      compareChangeDatesNewestFirst(left.event.date, right.event.date) ||
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
          date: parseChangeDate(record.effectiveDate),
          kind: record.primaryTreatments[0] ?? record.customTreatments[0] ?? "intervention",
          title: record.title,
          detail: `${status}${corridor.length > 0 ? ` — ${corridor}` : ""}${unmatchedRoutes}`,
          source: "corpus",
          sourceLabel: record.sourceLabel,
          planLabel: record.sourceLabel,
          citationKeys: [],
          sourceEntries: [corpusSourceEntry(record)],
          ...(record.recordKind === "proposed"
            ? {
                filterState: "future" as const,
                plannedStatus: record.statusLatest ?? record.recordKind,
              }
            : record.effectiveDate === null
              ? { filterState: "source-gap" as const }
              : {}),
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
  event: StudioInterventionsEvidenceTimelineEvent,
): InterventionRow {
  const year = event.dateNormalized ?? event.dateText ?? "undated";
  const planLabel = sourcePlanLabel(evidence, event.citationKeys);
  return {
    key: `${route.slug}:wiki-timeline:${event.recordId}`,
    routes: [route],
    evidence,
    facets: [],
    event: {
      recordId: event.recordId,
      year,
      sortKey: event.dateNormalized ?? event.dateText ?? "0000",
      date: parseChangeDate(event.dateNormalized ?? event.dateText),
      kind: event.eventKind ?? event.eventFamily ?? "route event",
      title: event.title ?? event.eventKind ?? "Documented route event",
      detail: event.description ?? event.lifecyclePhase ?? "Wiki-derived route evidence.",
      source: "wiki",
      sourceLabel: "MTA-wiki",
      ...(planLabel === undefined ? {} : { planLabel }),
      citationKeys: event.citationKeys,
    },
  };
}

function wikiTreatmentRow(
  route: StudioRoute,
  evidence: InterventionEvidenceBundle,
  intervention: StudioInterventionsEvidenceIntervention,
): InterventionRow {
  const planLabel = sourcePlanLabel(evidence, intervention.citationKeys);
  return {
    key: `${route.slug}:wiki-treatment:${intervention.recordId}`,
    routes: [route],
    evidence,
    facets: [],
    event: {
      recordId: intervention.recordId,
      year: "undated",
      sortKey: "0000",
      date: parseChangeDate("undated"),
      kind: intervention.treatmentKind ?? "treatment",
      title: intervention.title ?? intervention.treatmentKind ?? "Documented treatment",
      detail: wikiTreatmentDescription(intervention),
      source: "wiki",
      sourceLabel: "MTA-wiki",
      ...(planLabel === undefined ? {} : { planLabel }),
      citationKeys: intervention.citationKeys,
    },
  };
}

function wikiTreatmentDescription(intervention: StudioInterventionsEvidenceIntervention): string {
  if (intervention.description !== null) return intervention.description;
  const locations = intervention.locations.join(", ");
  return locations.length > 0 ? locations : "Source-backed treatment.";
}

function wikiProjectRow(
  route: StudioRoute,
  evidence: InterventionEvidenceBundle,
  project: StudioInterventionsEvidenceProject,
): InterventionRow {
  const planLabel = sourcePlanLabel(evidence, project.citationKeys) ?? project.projectName;
  return {
    key: `${route.slug}:wiki-project:${project.recordId}`,
    routes: [route],
    evidence,
    facets: [],
    event: {
      recordId: project.recordId,
      year: "undated",
      sortKey: "0000",
      date: parseChangeDate("undated"),
      kind: project.projectType ?? project.status ?? "project",
      title: project.projectName ?? "Documented project",
      detail: project.description ?? project.location ?? "Source-backed project.",
      source: "wiki",
      sourceLabel: "MTA-wiki",
      ...(planLabel === null ? {} : { planLabel }),
      ...(project.status === null ? {} : { plannedStatus: project.status }),
      ...(project.status !== null && FUTURE_LIFECYCLE_STATES.has(project.status)
        ? { filterState: "future" as const }
        : {}),
      citationKeys: project.citationKeys,
    },
  };
}

function sourcePlanLabel(
  evidence: InterventionEvidenceBundle,
  citationKeys: readonly string[],
): string | undefined {
  const keys = new Set(citationKeys);
  return evidence.citations.find((citation) => keys.has(citation.key))?.sourceTitle;
}

function wikiSourceGapRow(
  route: StudioRoute,
  evidence: InterventionEvidenceBundle,
  gap: StudioInterventionsEvidenceSourceGap,
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
      date: parseChangeDate("undated"),
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
  options: {
    facetIndexAvailable: boolean;
    studyRowsByJoinKey?: ReadonlyMap<string, StudyIndexRow | null>;
  },
): InterventionRow[] {
  const query = search.q?.trim().toLocaleLowerCase();
  const selectedFamily = search.family;
  const selectedView = interventionView(search);
  return rows.filter((row) => {
    if ((selectedView === "planned") !== isPlannedRow(row)) return false;
    if (search.status !== undefined && !matchesFilter(row, search.status)) return false;
    if (
      search.studied === true &&
      studyIndexRowForEventId(row.event.eventId, options.studyRowsByJoinKey ?? new Map()) ===
        undefined
    ) {
      return false;
    }
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
  if (filter === "future") return isPlannedRow(row);
  if (filter === "source-gap") {
    return row.event.source === "source_gap" || row.event.filterState === "source-gap";
  }
  return true;
}

function interventionView(search: InterventionsSearch): InterventionView {
  return search.view === "planned" || search.status === "future" ? "planned" : "documented";
}

function isPlannedRow(row: InterventionRow): boolean {
  if (row.facets.length > 0) {
    return row.facets.every((facet) => FUTURE_LIFECYCLE_STATES.has(facet.lifecycleState));
  }
  return row.event.filterState === "future";
}

function interventionSearchText(row: InterventionRow): string {
  return [
    row.event.title,
    row.event.detail,
    row.event.kind,
    row.event.sourceLabel,
    row.event.planLabel,
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
  const view = interventionView(search);
  return {
    ...(view === "planned" ? { view: "planned" as const } : {}),
    ...(search.group === undefined || search.group === "recent" ? {} : { group: search.group }),
    ...(search.studied === true || search.status === "evaluated" ? { studied: true as const } : {}),
    ...(search.status === "source-gap" ? { status: search.status } : {}),
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
    search.view ?? null,
    search.group ?? null,
    search.studied ?? null,
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
