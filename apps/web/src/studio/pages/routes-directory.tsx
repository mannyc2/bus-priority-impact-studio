import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BoroughBadge } from "@/components/BoroughBadge";
import { RouteBadge } from "@/components/RouteBadge";
import { SearchField } from "@/components/SearchField";
import { Spark } from "@/components/Spark";
import { Skeleton } from "@/components/ui/skeleton";
import type { StudioRoute } from "../api-contract.js";
import {
  filterRoutesForIndex,
  groupRoutesForIndex,
  orderRoutesForIndex,
  ROUTE_INDEX_ALL_BOROUGHS,
  ROUTE_INDEX_BOROUGHS,
  type RouteIndexBorough,
} from "../home-route-index.js";

// routes-directory.tsx - the /routes page: the full grouped, filterable route
// index sorted by daily ridership. The row markup (RouteIndexRow) and rider
// formatter are shared with the homepage's top-15 preview.

type Tone = "bad" | "good" | "warn" | "neutral";

const toneColor: Record<Tone, string> = {
  bad: "var(--bp-color-bad)",
  good: "var(--bp-color-good)",
  warn: "var(--bp-color-warn)",
  neutral: "var(--bp-color-ink-70)",
};

const boroughs = [ROUTE_INDEX_ALL_BOROUGHS, ...ROUTE_INDEX_BOROUGHS] as const;

export function formatRiders(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

function trendStatus(movement6mPct: number | null): { status: string; tone: Tone } {
  if (movement6mPct === null) return { status: "No trend", tone: "neutral" };
  if (movement6mPct > 0.05) return { status: "Improving", tone: "good" };
  if (movement6mPct < -0.05) return { status: "Declining", tone: "bad" };
  return { status: "Steady", tone: "warn" };
}

// Shared route row: used by both the /routes directory and the homepage preview.
export function RouteIndexRow({ route }: { route: StudioRoute }) {
  const { status, tone } = trendStatus(route.movement6mPct);
  return (
    <Link
      to="/routes/$routeId"
      params={{ routeId: route.slug }}
      viewTransition
      className="grid grid-cols-[90px_1fr_90px_110px_120px_90px_16px] items-center gap-4 px-4.5 py-3.5 text-[var(--bp-color-ink)] no-underline shadow-[inset_0_-1px_0_var(--bp-color-rule)] transition-colors hover:bg-[var(--bp-color-paper-deep)] max-md:grid-cols-[auto_minmax(0,1fr)] max-md:gap-x-3 max-md:gap-y-2 max-md:px-3.5 max-md:py-3"
    >
      <RouteBadge route={route.label} displayLabel={route.displayLabel} sbs={route.sbs} size="md" />
      <div className="min-w-0 truncate text-[13.5px] font-medium">{route.corridorFull}</div>
      <div className="hidden text-[11.5px] leading-[1.45] text-[var(--bp-color-ink-55)] max-md:col-span-2 max-md:block">
        {`${route.speedMph.toFixed(1)} mph, ${status}, ${formatRiders(route.dailyRiders)} riders/day`}
      </div>
      <div className="text-right max-md:hidden">
        <div className="font-mono text-[15px] font-semibold tabular-nums leading-none">
          {route.speedMph.toFixed(1)}
        </div>
        <div className="mt-[3px] text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--bp-color-ink-40)]">
          mph today
        </div>
      </div>
      <div className="max-md:hidden">
        {route.spark === null ? null : (
          <Spark data={route.spark} width={104} height={22} color={toneColor[tone]} fill />
        )}
      </div>
      <div className="text-right font-mono text-[12px] tabular-nums text-[var(--bp-color-ink-70)] max-md:hidden">
        {formatRiders(route.dailyRiders)}
      </div>
      <div
        className="text-right text-[10px] font-bold uppercase tracking-[0.06em] max-md:hidden"
        style={{ color: toneColor[tone] }}
      >
        {status}
      </div>
      <div className="text-right text-[14px] text-[var(--bp-color-ink-40)] max-md:hidden">→</div>
    </Link>
  );
}

export function RoutesDirectoryPage({
  routes,
  initialQuery = "",
  initialBorough,
}: {
  routes: readonly StudioRoute[];
  initialQuery?: string | undefined;
  initialBorough?: string | undefined;
}) {
  const startBorough: typeof ROUTE_INDEX_ALL_BOROUGHS | RouteIndexBorough =
    ROUTE_INDEX_BOROUGHS.find((candidate) => candidate === initialBorough) ??
    ROUTE_INDEX_ALL_BOROUGHS;
  const [borough, setBorough] = useState<typeof ROUTE_INDEX_ALL_BOROUGHS | RouteIndexBorough>(
    startBorough,
  );
  const [routeFilter, setRouteFilter] = useState(initialQuery);
  const routeCount = routes.length;

  const byRidership = useMemo(() => orderRoutesForIndex(routes), [routes]);
  const filteredRoutes = useMemo(
    () => filterRoutesForIndex(byRidership, { borough, query: routeFilter }),
    [borough, byRidership, routeFilter],
  );
  const routeGroups = useMemo(() => groupRoutesForIndex(filteredRoutes), [filteredRoutes]);

  return (
    <main className="min-h-full bg-[var(--bp-color-paper)]">
      <section className="mx-auto max-w-[1180px] px-9 pb-16 pt-14 max-sm:px-4 max-sm:pt-10">
        <div className="mb-5.5 flex items-end justify-between gap-6 max-md:flex-col max-md:items-start">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[26px] font-semibold leading-[1.15] tracking-[-0.022em]">
              All routes
            </h1>
            <div className="mt-2.5 text-[15px] leading-[1.55] text-[var(--bp-color-ink-70)]">
              Grouped by borough, sorted by daily riders. Showing {filteredRoutes.length} of{" "}
              {routeCount} routes.
            </div>
          </div>
          <div className="flex w-[420px] max-w-full flex-col gap-2 max-md:w-full">
            <div className="flex flex-wrap justify-end gap-1.5 max-md:justify-start">
              {boroughs.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBorough(b)}
                  aria-pressed={borough === b}
                  aria-label={
                    b === ROUTE_INDEX_ALL_BOROUGHS ? "Show all boroughs" : `Filter to ${b}`
                  }
                  className="cursor-pointer rounded-[3px] px-3 py-1.5 text-[12px] font-semibold transition-colors"
                  style={
                    borough === b
                      ? { background: "var(--bp-color-ink)", color: "var(--bp-color-paper)" }
                      : {
                          background: "transparent",
                          color: "var(--bp-color-ink-70)",
                          boxShadow: "inset 0 0 0 1px var(--bp-color-ink-20)",
                        }
                  }
                >
                  {b}
                </button>
              ))}
            </div>
            <SearchField
              value={routeFilter}
              onChange={(event) => setRouteFilter(event.target.value)}
              placeholder="Filter by route, corridor, or borough"
              aria-label="Filter routes"
              className="w-full border-[1px] px-3.5 py-2 shadow-none"
            />
          </div>
        </div>
        <div className="overflow-hidden rounded-[4px] bg-[var(--bp-color-card)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
          <div className="grid grid-cols-[90px_1fr_90px_110px_120px_90px_16px] items-center gap-4 bg-[var(--bp-color-paper-deep)] px-4.5 py-3 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)] shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:hidden">
            <span>Route</span>
            <span>Corridor</span>
            <span className="text-right">Speed</span>
            <span>12-mo trend</span>
            <span className="text-right">Riders / day</span>
            <span className="text-right">Direction</span>
            <span />
          </div>
          {routeGroups.length > 0 ? (
            routeGroups.map((group) => (
              <div key={group.borough}>
                <div className="flex items-center gap-2.5 bg-[var(--bp-color-paper-deep)] px-4.5 py-2.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
                  <BoroughBadge borough={group.borough} />
                  <span className="font-mono text-[10px] tabular-nums text-[var(--bp-color-ink-40)]">
                    {group.routes.length}
                  </span>
                </div>
                {group.routes.map((route) => (
                  <RouteIndexRow key={route.slug} route={route} />
                ))}
              </div>
            ))
          ) : (
            <div className="px-4.5 py-8 text-[13px] text-[var(--bp-color-ink-55)]">
              No routes match the current filter.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export function RoutesDirectoryLoadingPage() {
  return (
    <main className="min-h-full bg-[var(--bp-color-paper)]">
      <section className="mx-auto max-w-[1180px] px-9 pb-16 pt-14 max-sm:px-4 max-sm:pt-10">
        <div className="mb-5.5 space-y-3">
          <Skeleton className="h-[26px] w-[180px]" />
          <Skeleton className="h-[15px] w-[340px] max-w-full" />
        </div>
        <div className="overflow-hidden rounded-[4px] bg-[var(--bp-color-card)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4.5 py-3.5 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
              <Skeleton className="h-6 w-full" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
