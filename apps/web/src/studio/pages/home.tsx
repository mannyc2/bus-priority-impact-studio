import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { RouteBadge } from "@/components/RouteBadge";
import { type AutocompleteSuggestion, SearchAutocomplete } from "@/components/SearchAutocomplete";
import { Skeleton } from "@/components/ui/skeleton";
import type { StudioRoute } from "../api-contract.js";
import { orderRoutesForIndex } from "../home-route-index.js";
import { formatRiders, RouteIndexRow } from "./routes-directory.js";

// home.tsx - the studio's public front door: a short, neutral, search-first
// page. Hero (search + top-5 chips) -> static citywide topline -> top-15 route
// preview -> footer. The full grouped/filterable index lives at /routes.
//
// The citywide topline numbers ("88", "11.4M", borough mph) are static
// editorial copy by decision; only routeCount is data-driven.

type Tone = "bad" | "good" | "warn" | "neutral";

const toneColor: Record<Tone, string> = {
  bad: "var(--bp-color-bad)",
  good: "var(--bp-color-good)",
  warn: "var(--bp-color-warn)",
  neutral: "var(--bp-color-ink-70)",
};

function BigStat({
  value,
  unit,
  label,
  sub,
  tone = "neutral",
}: {
  value: string;
  unit?: string;
  label: string;
  sub: string;
  tone?: Tone;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5 leading-none">
        <span
          className="font-mono text-[62px] font-semibold tabular-nums tracking-[-0.035em]"
          style={{ color: tone === "neutral" ? "var(--bp-color-ink)" : toneColor[tone] }}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-[22px] font-medium tracking-[-0.01em] text-[var(--bp-color-ink-55)]">
            {unit}
          </span>
        ) : null}
      </div>
      <div className="mt-3.5 max-w-[280px] text-[14px] font-semibold leading-[1.3] tracking-[-0.005em]">
        {label}
      </div>
      <div className="mt-1.5 max-w-[280px] text-[12.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
        {sub}
      </div>
    </div>
  );
}

export function HomePage({ routes }: { routes: readonly StudioRoute[] }) {
  const navigate = useNavigate();
  const routeCount = routes.length;

  const byRidership = useMemo(() => orderRoutesForIndex(routes), [routes]);

  const heroSuggestions = useMemo<AutocompleteSuggestion[]>(
    () =>
      byRidership.map((route) => ({
        id: route.slug,
        primary: (
          <span className="inline-flex items-center gap-2.5">
            <RouteBadge
              route={route.label}
              displayLabel={route.displayLabel}
              sbs={route.sbs}
              size="sm"
            />
            <span>{route.corridorFull}</span>
          </span>
        ),
        meta: `${formatRiders(route.dailyRiders)} daily riders`,
        haystack: `${route.label} ${route.corridor} ${route.corridorFull} ${route.borough}`,
      })),
    [byRidership],
  );

  const heroChips = byRidership.slice(0, 5);
  const previewRoutes = byRidership.slice(0, 15);

  function submitHeroQuery(query: string) {
    navigate({ to: "/routes", search: { q: query } });
  }

  return (
    <main className="min-h-full bg-[var(--bp-color-paper)]">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="bg-[var(--bp-color-card)] shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
        <div className="mx-auto grid max-w-[1180px] grid-cols-[1.6fr_1fr] items-end gap-14 px-9 pb-16 pt-[72px] max-lg:grid-cols-1 max-lg:gap-10 max-sm:px-4 max-sm:pb-10 max-sm:pt-12">
          <div>
            <h1 className="m-0 max-w-[900px] text-balance text-[52px] font-semibold leading-[1.05] tracking-[-0.03em] max-sm:text-[36px]">
              Speed and reliability for every NYC bus route.
            </h1>
            <p className="mt-5.5 max-w-[720px] text-pretty text-[18px] leading-[1.55] text-[var(--bp-color-ink-70)]">
              Bus Priority Impact Studio tracks monthly speeds, slow segments, ridership, and
              documented street treatments for {routeCount} routes — built from public MTA and NYC
              DOT data.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <Link
                to="/routes"
                viewTransition
                className="inline-flex h-11 items-center justify-center rounded-[3px] border border-[var(--bp-color-ink)] bg-[var(--bp-color-ink)] px-4.5 text-[13.5px] font-medium text-[var(--bp-color-paper)] no-underline transition-colors hover:bg-[var(--bp-color-ink)]/90"
              >
                Browse all {routeCount} routes →
              </Link>
              <Link
                to="/interventions"
                viewTransition
                className="inline-flex h-11 items-center justify-center rounded-[3px] border border-[var(--bp-color-ink-20)] bg-transparent px-4.5 text-[13.5px] font-medium text-[var(--bp-color-ink)] no-underline transition-colors hover:bg-[var(--bp-color-ink-06)]"
              >
                Browse interventions
              </Link>
            </div>
          </div>

          {/* Right rail: find a route */}
          <div className="rounded-[4px] bg-[var(--bp-color-paper-deep)] px-6 pb-5.5 pt-6 shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
            <div className="mb-3.5 text-[15px] font-semibold tracking-[-0.005em]">Find a route</div>
            <SearchAutocomplete
              placeholder="Route number, street, or borough…"
              suggestions={heroSuggestions}
              onSelect={(slug) => navigate({ to: "/routes/$routeId", params: { routeId: slug } })}
              onSubmitQuery={submitHeroQuery}
            />
            <div className="mb-2 mt-3 text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
              Try one of these:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {heroChips.map((r) => (
                <Link
                  key={r.slug}
                  to="/routes/$routeId"
                  params={{ routeId: r.slug }}
                  viewTransition
                  className="no-underline"
                >
                  <RouteBadge route={r.label} displayLabel={r.displayLabel} sbs={r.sbs} size="sm" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CITYWIDE TOPLINE ─────────────────────────────────── */}
      <section className="mx-auto max-w-[1180px] px-9 pb-3 pt-14 max-sm:px-4">
        <h2 className="max-w-[820px] text-balance text-[26px] font-semibold leading-[1.15] tracking-[-0.022em]">
          The system today
        </h2>
        <div className="mt-6 grid grid-cols-4 gap-9 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <BigStat
            value={String(routeCount)}
            label="Routes in the public index"
            sub="Route pages are grouped by borough and sorted by daily riders."
          />
          <BigStat
            value="88"
            tone="bad"
            label="Routes slower than they were 14 months ago"
            sub="More than one in four. About a third of those have lost more than half a mile per hour."
          />
          <BigStat
            value="11.4M"
            unit="hrs"
            tone="warn"
            label="Rider-hours lost across the system, every year"
            sub="The collective time New Yorkers spend on buses beyond what the schedule promises."
          />
          <BigStat
            value="6.1"
            unit="mph"
            label="Median bus speed in the Bronx, the slowest borough"
            sub="Manhattan averages 6.4, Brooklyn 6.6, Queens 7.2, and Staten Island 9.8 mph."
          />
        </div>
      </section>

      {/* ── ROUTE PREVIEW ────────────────────────────────────── */}
      <section className="mx-auto max-w-[1180px] px-9 pb-3 pt-[72px] max-sm:px-4 max-sm:pt-12">
        <h2 className="max-w-[820px] text-balance text-[26px] font-semibold leading-[1.15] tracking-[-0.022em]">
          Find your route
        </h2>
        <div className="mt-6 overflow-hidden rounded-[4px] bg-[var(--bp-color-card)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
          <div className="grid grid-cols-[90px_1fr_90px_110px_120px_90px_16px] items-center gap-4 bg-[var(--bp-color-paper-deep)] px-4.5 py-3 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)] shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:hidden">
            <span>Route</span>
            <span>Corridor</span>
            <span className="text-right">Speed</span>
            <span>12-mo trend</span>
            <span className="text-right">Riders / day</span>
            <span className="text-right">Direction</span>
            <span />
          </div>
          {previewRoutes.map((route) => (
            <RouteIndexRow key={route.slug} route={route} />
          ))}
          <Link
            to="/routes"
            viewTransition
            className="flex items-center justify-center gap-1.5 px-4.5 py-3.5 text-[13px] font-semibold text-[var(--bp-color-accent)] no-underline transition-colors hover:bg-[var(--bp-color-paper-deep)]"
          >
            View all {routeCount} routes →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-1.5 px-9 pb-7 pt-8 text-[11.5px] text-[var(--bp-color-ink-55)] max-sm:px-4">
        <span>Built from public MTA and NYC DOT data. Code and data are open —</span>
        <a
          href="https://github.com/mannyc2/bus-priority-impact-studio"
          className="font-medium text-[var(--bp-color-accent)] no-underline"
        >
          GitHub
        </a>
      </div>
    </main>
  );
}

export function HomeLoadingPage() {
  return (
    <main className="min-h-full bg-[var(--bp-color-paper)]">
      <section className="bg-[var(--bp-color-card)] shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
        <div className="mx-auto grid max-w-[1180px] grid-cols-[1.6fr_1fr] items-end gap-14 px-9 pb-16 pt-[72px] max-lg:grid-cols-1 max-sm:px-4">
          <div className="space-y-4">
            <Skeleton className="h-[52px] w-full max-w-[820px]" />
            <Skeleton className="h-[52px] w-[70%]" />
            <Skeleton className="mt-2 h-[18px] w-full max-w-[680px]" />
            <Skeleton className="h-[18px] w-[80%] max-w-[560px]" />
            <div className="flex gap-3.5 pt-4">
              <Skeleton className="h-11 w-[200px] rounded-[3px]" />
              <Skeleton className="h-11 w-[200px] rounded-[3px]" />
            </div>
          </div>
          <Skeleton className="h-[220px] w-full rounded-[4px]" />
        </div>
      </section>
      <section className="mx-auto max-w-[1180px] px-9 pt-14 max-sm:px-4">
        <div className="grid grid-cols-4 gap-9 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-[62px] w-[120px]" />
              <Skeleton className="h-[14px] w-full max-w-[240px]" />
              <Skeleton className="h-[12px] w-[80%]" />
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-[1180px] px-9 pt-[72px] max-sm:px-4">
        <div className="space-y-3 rounded-[4px] bg-[var(--bp-color-card)] p-4.5 shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </section>
    </main>
  );
}
