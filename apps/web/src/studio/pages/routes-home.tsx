import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips } from "@/components/FilterChips";
import { RouteBadge } from "@/components/RouteBadge";
import { type AutocompleteSuggestion, SearchAutocomplete } from "@/components/SearchAutocomplete";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecentRoutes } from "@/lib/recent-routes";
import type {
  StudioRoute,
  StudioRouteSection,
  StudioRouteSectionId,
  StudioRouteSectionRow,
  StudioRouteSectionsResponse,
} from "../api-contract.js";
import { StudioPage } from "../page.js";

type FilterId = "all" | "sbs" | "no-lane";

const filters: readonly { id: FilterId; label: string }[] = [
  { id: "all", label: "All boroughs" },
  { id: "sbs", label: "SBS only" },
  { id: "no-lane", label: "No bus lane" },
];

const visibleSectionIds = [
  "needs_attention",
  "worsening_fast",
  "treatment_gaps",
  "data_coverage",
] as const satisfies readonly StudioRouteSectionId[];

const SECTION_ROW_LIMIT = 4;

function matchesFilter(route: StudioRoute, filter: FilterId): boolean {
  if (filter === "sbs") return route.sbs;
  if (filter === "no-lane") return route.laneCoverage < 30;
  return true;
}

function formatRiders(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

function routeRowSbs(row: StudioRouteSectionRow): boolean {
  return row.routeId.includes("+") || row.label.toLowerCase().includes("sbs");
}

function sectionStatusLabel(status: StudioRouteSection["status"]): string {
  if (status === "not_built") return "not built";
  return status;
}

function sectionRankRows(section: StudioRouteSection): readonly StudioRouteSectionRow[] {
  return section.rows.slice(0, SECTION_ROW_LIMIT);
}

function sectionById(
  sections: readonly StudioRouteSection[],
): ReadonlyMap<StudioRouteSectionId, StudioRouteSection> {
  return new Map(sections.map((section) => [section.sectionId, section]));
}

function RouteDiscoverySections({
  routeSections,
}: {
  routeSections: StudioRouteSectionsResponse | null;
}) {
  if (routeSections === null) {
    return null;
  }

  const byId = sectionById(routeSections.sections);
  const sections = visibleSectionIds.flatMap((id) => {
    const section = byId.get(id);
    return section === undefined ? [] : [section];
  });
  const notBuilt = routeSections.sections.filter((section) => section.status === "not_built");

  return (
    <section className="mt-10 border-y border-[var(--bp-color-rule)] py-5">
      <div className="mb-4 flex items-end justify-between gap-4 max-md:flex-col max-md:items-start">
        <div>
          <h2 className="m-0 text-[19px] font-semibold leading-tight tracking-[-0.015em]">
            Route discovery
          </h2>
          <p className="mt-1 max-w-[680px] text-[12.5px] leading-normal text-[var(--bp-color-ink-70)]">
            Data as of {routeSections.dataAsOf}: ranks from current route summaries, history, and
            coverage flags.
          </p>
        </div>
        <div className="whitespace-nowrap text-[11px] font-medium text-[var(--bp-color-ink-55)]">
          {routeSections.sections.length} sections
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 max-lg:grid-cols-1">
        {sections.map((section) => (
          <RouteDiscoverySection key={section.sectionId} section={section} />
        ))}
      </div>
      {notBuilt.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-[var(--bp-color-ink-55)]">
          <span className="font-medium text-[var(--bp-color-ink-70)]">Not yet ranked:</span>
          {notBuilt.map((section) => (
            <span
              key={section.sectionId}
              className="rounded-[3px] bg-[var(--bp-color-ink-06)] px-1.5 py-0.5"
              title={section.notBuiltReason ?? undefined}
            >
              {section.title}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RouteDiscoverySection({ section }: { section: StudioRouteSection }) {
  const rows = sectionRankRows(section);
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="m-0 truncate text-[13px] font-semibold leading-tight">
              {section.title}
            </h3>
            <span className="rounded-[3px] bg-[var(--bp-color-ink-06)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--bp-color-ink-55)]">
              {sectionStatusLabel(section.status)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-[var(--bp-color-ink-55)]">
            {section.productQuestion}
          </p>
        </div>
      </div>
      <div className="shadow-[inset_0_1px_0_var(--bp-color-rule)]">
        {rows.map((row) => (
          <RouteDiscoveryRow key={`${section.sectionId}:${row.routeId}`} row={row} />
        ))}
        {rows.length === 0 ? (
          <div className="py-3 text-[12px] text-[var(--bp-color-ink-55)]">
            No routes pass this section's coverage gate.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RouteDiscoveryRow({ row }: { row: StudioRouteSectionRow }) {
  const metric = row.metrics[0];
  return (
    <Link
      to="/routes/$routeId"
      params={{ routeId: row.slug }}
      viewTransition
      className="grid grid-cols-[70px_1fr_86px] items-center gap-3 py-2.5 text-[var(--bp-color-ink)] no-underline shadow-[inset_0_-1px_0_var(--bp-color-rule)] transition-colors hover:bg-[var(--bp-color-paper-deep)] max-sm:grid-cols-[64px_1fr] max-sm:gap-y-1"
    >
      <RouteBadge route={row.label} sbs={routeRowSbs(row)} size="sm" />
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium leading-tight">
          {row.reasons[0] ?? row.scoreLabel}
        </div>
        <div className="mt-0.5 truncate text-[10.5px] text-[var(--bp-color-ink-55)]">
          {row.reasons.slice(1, 3).join(" · ") || row.supportLevel.replaceAll("_", " ")}
        </div>
      </div>
      <div className="text-right max-sm:col-start-2 max-sm:text-left">
        <div className="font-mono text-[12px] font-semibold tabular-nums leading-none">
          {metric?.displayValue ?? row.score.toFixed(0)}
        </div>
        <div className="mt-1 truncate text-[9px] uppercase tracking-[0.04em] text-[var(--bp-color-ink-55)]">
          {metric?.label ?? row.scoreLabel}
        </div>
      </div>
    </Link>
  );
}

export function RoutesHomePage({
  routeSections,
  routes,
}: {
  routeSections: StudioRouteSectionsResponse | null;
  routes: readonly StudioRoute[];
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterId>("all");
  const recentSlugs = useRecentRoutes();
  const recent = recentSlugs.length > 0 ? recentSlugs : ["m15-sbs", "b41", "m14a-sbs", "bx12-sbs"];

  const suggestions = useMemo<AutocompleteSuggestion[]>(
    () =>
      routes.map((route) => ({
        id: route.slug,
        primary: (
          <span className="inline-flex items-center gap-2.5">
            <RouteBadge route={route.label} sbs={route.sbs} size="sm" />
            <span>{route.corridorFull}</span>
          </span>
        ),
        meta: `${formatRiders(route.dailyRiders)} daily riders${
          route.aceStatus === "active" ? " - ACE active" : ""
        }`,
        haystack: `${route.label} ${route.routeId} ${route.corridor} ${route.corridorFull} ${route.borough}`,
      })),
    [routes],
  );

  // Snapshot 2.0 expands the backend route universe; keep this prototype page's visual sort/filter
  // behavior stable until the release data is complete enough to redesign the public route index.
  const filtered = routes.filter((route) => matchesFilter(route, filter));

  return (
    <StudioPage>
      <header className="mb-9 max-w-[760px]">
        <div className="mb-3.5 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
          Route Evidence Brief Builder
        </div>
        <h1 className="m-0 max-w-[760px] text-[44px] font-semibold leading-[1.05] tracking-[-0.025em] max-sm:text-[32px]">
          Pick a route. See where it fails, who is affected, and whether the evidence supports
          action.
        </h1>
        <p className="mt-3.5 max-w-[620px] text-[14.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
          Built from public MTA bus speed, ridership, and schedule data; NYC DOT bus lane geometry;
          and the MTA Automated Camera Enforcement program record.{" "}
          <Link
            to="/docs/$page"
            params={{ page: "methodology" }}
            viewTransition
            className="text-[var(--bp-color-accent)] no-underline"
          >
            Methodology &rarr;
          </Link>
        </p>
      </header>
      <SearchAutocomplete
        className="max-w-[760px]"
        placeholder="Search by route number, street, or borough..."
        shortcut="⌘K"
        suggestions={suggestions}
        onSelect={(id) =>
          navigate({ to: "/routes/$routeId", params: { routeId: id }, viewTransition: true })
        }
        recent={
          <div className="flex items-center gap-2.5 text-[12px] text-[var(--bp-color-ink-55)]">
            <span>Recent:</span>
            {recent.map((slug) => {
              const r = routes.find((x) => x.slug === slug);
              if (!r) return null;
              return (
                <Link
                  key={slug}
                  to="/routes/$routeId"
                  params={{ routeId: slug }}
                  viewTransition
                  className="no-underline"
                >
                  <RouteBadge route={r.label} sbs={r.sbs} size="sm" />
                </Link>
              );
            })}
          </div>
        }
      />
      <RouteDiscoverySections routeSections={routeSections} />
      <section className="mt-14">
        <div className="mb-3 flex items-end justify-between gap-4 max-md:flex-col max-md:items-start">
          <div>
            <h2 className="m-0 text-[19px] font-semibold leading-tight tracking-[-0.015em]">
              Routes needing attention this month
            </h2>
            <p className="mt-1 max-w-[620px] text-[12.5px] leading-normal text-[var(--bp-color-ink-70)]">
              Surfaced by week-over-week speed decline weighted by daily riders. Not a
              recommendation - a triage list.
            </p>
          </div>
          <FilterChips
            ariaLabel="Filter routes needing attention"
            value={filter}
            onChange={setFilter}
            options={filters}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-8 max-lg:grid-cols-1">
          {filtered.map((route) => {
            const delta = route.speedMph - route.scheduledMph;
            return (
              <Link
                key={route.slug}
                to="/routes/$routeId"
                params={{ routeId: route.slug }}
                viewTransition
                className="grid grid-cols-[90px_1fr_76px_60px_100px] items-center gap-3.5 py-3.5 text-[var(--bp-color-ink)] no-underline shadow-[inset_0_-1px_0_var(--bp-color-rule)] transition-colors hover:bg-[var(--bp-color-paper-deep)]"
              >
                <RouteBadge route={route.label} sbs={route.sbs} size="md" />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium leading-tight">
                    {route.corridor}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--bp-color-ink-55)]">
                    {route.flags.join(" · ")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[16px] font-semibold tabular-nums leading-none">
                    {route.speedMph.toFixed(1)}
                  </div>
                  <div className="mt-0.5 text-[9px] uppercase tracking-[0.04em] text-[var(--bp-color-ink-55)]">
                    mph
                  </div>
                </div>
                <div
                  className="text-right font-mono text-[12px] font-semibold tabular-nums"
                  style={{
                    color: delta < 0 ? "var(--bp-color-bad)" : "var(--bp-color-good)",
                  }}
                >
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(1)}
                </div>
                <div className="text-right font-mono text-[11px] tabular-nums text-[var(--bp-color-ink-55)]">
                  {formatRiders(route.dailyRiders)}/day
                </div>
              </Link>
            );
          })}
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            className="mt-4 bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]"
            title="No routes match this filter"
            body="The route list is still loaded. Clear the current filter or choose another operating pattern to keep scanning."
          />
        ) : null}
      </section>
    </StudioPage>
  );
}

export function RoutesHomeLoadingPage() {
  return (
    <StudioPage>
      <header className="mb-9 max-w-[760px]">
        <Skeleton className="mb-3.5 h-[13px] w-[180px]" />
        <div className="space-y-2">
          <Skeleton className="h-[42px] w-full max-w-[720px]" />
          <Skeleton className="h-[42px] w-[68%]" />
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-[14px] w-full max-w-[620px]" />
          <Skeleton className="h-[14px] w-[74%] max-w-[520px]" />
        </div>
      </header>
      <Skeleton className="h-[52px] max-w-[760px] rounded-[3px]" />
      <section className="mt-10 border-y border-[var(--bp-color-rule)] py-5">
        <div className="mb-4 flex items-end justify-between gap-4 max-md:flex-col max-md:items-start">
          <div>
            <Skeleton className="h-[22px] w-[190px]" />
            <Skeleton className="mt-2 h-[13px] w-[560px] max-w-full" />
          </div>
          <Skeleton className="h-[13px] w-[70px]" />
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 max-lg:grid-cols-1">
          {Array.from({ length: 4 }).map((_, sectionIndex) => (
            <div key={sectionIndex}>
              <div className="mb-2">
                <Skeleton className="h-[15px] w-[150px]" />
                <Skeleton className="mt-2 h-[12px] w-[78%]" />
              </div>
              <div className="shadow-[inset_0_1px_0_var(--bp-color-rule)]">
                {Array.from({ length: 3 }).map((__, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="grid grid-cols-[70px_1fr_86px] items-center gap-3 py-2.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)]"
                  >
                    <Skeleton className="h-[18px] w-[46px] rounded-[3px]" />
                    <div className="min-w-0">
                      <Skeleton className="h-[12px] w-[70%]" />
                      <Skeleton className="mt-2 h-[10px] w-[54%]" />
                    </div>
                    <Skeleton className="ml-auto h-[12px] w-[52px]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-14">
        <div className="mb-4 flex items-end justify-between gap-4 max-md:flex-col max-md:items-start">
          <div>
            <Skeleton className="h-[22px] w-[320px]" />
            <Skeleton className="mt-2 h-[13px] w-[520px] max-w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-[28px] w-[92px] rounded-full" />
            <Skeleton className="h-[28px] w-[74px] rounded-full" />
            <Skeleton className="h-[28px] w-[80px] rounded-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-8 max-lg:grid-cols-1">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-[90px_1fr_76px_60px_100px] items-center gap-3.5 py-3.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)]"
            >
              <Skeleton className="h-[36px] w-[70px] rounded-[3px]" />
              <div className="min-w-0">
                <Skeleton className="h-[14px] w-[70%]" />
                <Skeleton className="mt-2 h-[11px] w-[46%]" />
              </div>
              <Skeleton className="ml-auto h-[18px] w-[48px]" />
              <Skeleton className="ml-auto h-[13px] w-[42px]" />
              <Skeleton className="ml-auto h-[12px] w-[72px]" />
            </div>
          ))}
        </div>
      </section>
    </StudioPage>
  );
}
