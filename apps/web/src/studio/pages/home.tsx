import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { RouteBadge } from "@/components/RouteBadge";
import { type AutocompleteSuggestion, SearchAutocomplete } from "@/components/SearchAutocomplete";
import { Spark } from "@/components/Spark";
import { Skeleton } from "@/components/ui/skeleton";
import type { StudioRoute } from "../api-contract.js";

// home.tsx - the studio's public front door: hero -> big stats -> narrative
// route cards -> route index -> trust strip.
//
// Editorial copy and the citywide topline numbers are static civic framing;
// the "Browse the full index" table, its borough filter, the featured-story
// links, and the hero suggestion chips are driven by the live route listing
// (the same /api/v1/studio/routes feed the loader already provides), shown as
// a preview of the full 327-route directory.

const LAST_REFRESH = "May 12, 2026";
const CITYWIDE_ROUTE_COUNT = 327;
// The homepage index is a preview of the full directory (the design shows ~10
// rows with a "browse all" affordance), sorted by daily ridership.
const INDEX_PREVIEW_LIMIT = 10;

type Tone = "bad" | "good" | "warn" | "neutral";

const toneColor: Record<Tone, string> = {
  bad: "var(--bp-color-bad)",
  good: "var(--bp-color-good)",
  warn: "var(--bp-color-warn)",
  neutral: "var(--bp-color-ink-70)",
};

const toneBg: Record<Tone, string> = {
  bad: "var(--bp-color-bad-bg)",
  good: "var(--bp-color-good-bg)",
  warn: "var(--bp-color-warn-bg)",
  neutral: "var(--bp-color-ink-06)",
};

const boroughStripe: Record<string, string> = {
  Manhattan: "var(--bp-route-manhattan)",
  Bronx: "var(--bp-route-bronx)",
  Brooklyn: "var(--bp-route-brooklyn)",
  Queens: "var(--bp-route-queens)",
  "Staten Island": "var(--bp-route-si)",
};

function formatRiders(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

// Direction of travel, read off the route's 12-month speed trend.
function trendStatus(spark: readonly number[]): { status: string; tone: Tone } {
  if (spark.length < 2) return { status: "Steady", tone: "warn" };
  const delta = (spark.at(-1) ?? 0) - (spark[0] ?? 0);
  if (delta > 0.1) return { status: "Improving", tone: "good" };
  if (delta < -0.1) return { status: "Declining", tone: "bad" };
  return { status: "Steady", tone: "warn" };
}

// ─────────────────────────────────────────────────────────────
// Atoms — kept local to match the design's editorial styling.
// ─────────────────────────────────────────────────────────────

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

function SectionHeader({
  kicker,
  title,
  sub,
  right,
}: {
  kicker: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5.5 flex items-end justify-between gap-6 max-md:flex-col max-md:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--bp-color-ink-55)]">
          {kicker}
        </div>
        <div className="max-w-[820px] text-balance text-[26px] font-semibold leading-[1.15] tracking-[-0.022em]">
          {title}
        </div>
        {sub ? (
          <div className="mt-2.5 max-w-[720px] text-pretty text-[15px] leading-[1.55] text-[var(--bp-color-ink-70)]">
            {sub}
          </div>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

type Featured = {
  label: string;
  sbs: boolean;
  borough: keyof typeof boroughStripe;
  kicker: string;
  status: string;
  statusTone: Tone;
  headline: string;
  body: string;
  mph: string;
  delta14mo: string;
  riders: string;
};

const FEATURED: readonly Featured[] = [
  {
    label: "M15",
    sbs: true,
    borough: "Manhattan",
    kicker: "THE OUTLIER",
    status: "Declining",
    statusTone: "bad",
    headline: "The slowest Select Bus in Manhattan, and it's still getting slower.",
    body: "The M15 has every tool the city uses to speed up buses — concrete and painted lanes on 72% of its route, all-day camera enforcement, signal priority at four in ten intersections. Six of eight comparable routes sped up after enforcement turned on. This one didn't. Madison Avenue is the reason.",
    mph: "6.3",
    delta14mo: "−1.6",
    riders: "42.1K",
  },
  {
    label: "Bx12",
    sbs: true,
    borough: "Bronx",
    kicker: "THE COUNTER-EXAMPLE",
    status: "Improving",
    statusTone: "good",
    headline: "The route that figured it out — and stayed faster three years later.",
    body: "The Bx12 SBS got concrete-buffered lanes on Fordham Road in 2022, all-day enforcement in 2024, and signal priority at every major intersection by mid-2025. Speed rose 0.8 mph and hasn't backslid since. The closest thing the city has to a controlled experiment in stacked bus priority.",
    mph: "6.9",
    delta14mo: "+0.4",
    riders: "41.0K",
  },
  {
    label: "B41",
    sbs: false,
    borough: "Brooklyn",
    kicker: "THE UNTOUCHED CORRIDOR",
    status: "Declining",
    statusTone: "bad",
    headline: "Flatbush Avenue has lost a mile per hour, and nothing has been tried.",
    body: "Twenty-five thousand riders a day, no bus lane, no enforcement program, no signal priority. The B41 is what the studio's data looks like in absence of any intervention at all. The slowdown is the steadiest of any corridor we track.",
    mph: "5.1",
    delta14mo: "−1.0",
    riders: "24.8K",
  },
];

function FeaturedCard({ item, slug }: { item: Featured; slug: string | undefined }) {
  const deltaNegative = item.delta14mo.startsWith("−") || item.delta14mo.startsWith("-");
  return (
    <div className="grid grid-cols-[6px_1fr] overflow-hidden rounded-[4px] bg-[var(--bp-color-card)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
      <div style={{ background: boroughStripe[item.borough] }} />
      <div className="flex flex-col gap-3.5 px-6 pb-5.5 pt-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <RouteBadge route={item.label} sbs={item.sbs} size="md" />
          <span className="font-mono text-[10.5px] font-bold tracking-[0.06em] text-[var(--bp-color-ink-55)]">
            {item.kicker}
          </span>
          <span className="flex-1" />
          <span
            className="rounded-[2px] px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.06em]"
            style={{ color: toneColor[item.statusTone], background: toneBg[item.statusTone] }}
          >
            {item.status}
          </span>
        </div>
        <div className="text-pretty text-[19px] font-semibold leading-[1.25] tracking-[-0.015em]">
          {item.headline}
        </div>
        <div className="min-h-[80px] flex-1 text-pretty text-[13px] leading-[1.6] text-[var(--bp-color-ink-70)]">
          {item.body}
        </div>
        <div className="grid grid-cols-3 gap-3.5 pt-3.5 shadow-[inset_0_1px_0_var(--bp-color-rule)]">
          <FeaturedStat label="Current">
            <span className="font-mono text-[18px] font-semibold tabular-nums leading-none tracking-[-0.02em]">
              {item.mph}
              <span className="ml-0.5 text-[10.5px] text-[var(--bp-color-ink-55)]">mph</span>
            </span>
          </FeaturedStat>
          <FeaturedStat label="14-mo Δ">
            <span
              className="font-mono text-[18px] font-semibold tabular-nums leading-none tracking-[-0.02em]"
              style={{ color: deltaNegative ? "var(--bp-color-bad)" : "var(--bp-color-good)" }}
            >
              {item.delta14mo}
              <span className="ml-0.5 text-[10.5px] text-[var(--bp-color-ink-55)]">mph</span>
            </span>
          </FeaturedStat>
          <FeaturedStat label="Riders / day">
            <span className="font-mono text-[18px] font-semibold tabular-nums leading-none tracking-[-0.02em]">
              {item.riders}
            </span>
          </FeaturedStat>
        </div>
        {slug ? (
          <Link
            to="/routes/$routeId"
            params={{ routeId: slug }}
            viewTransition
            className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-[var(--bp-color-accent)] no-underline"
          >
            Read the full story →
          </Link>
        ) : (
          <a
            href="#route-index"
            className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-[var(--bp-color-accent)] no-underline"
          >
            Find it in the index &rarr;
          </a>
        )}
      </div>
    </div>
  );
}

function FeaturedStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-[3px] text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]">
        {label}
      </div>
      <div className="leading-none">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HomePage
// ─────────────────────────────────────────────────────────────

export function HomePage({ routes }: { routes: readonly StudioRoute[] }) {
  const navigate = useNavigate();
  const [borough, setBorough] = useState("All boroughs");

  const slugByLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of routes) {
      const key = r.label.toLowerCase();
      if (!map.has(key)) map.set(key, r.slug);
    }
    return map;
  }, [routes]);

  const byRidership = useMemo(
    () => [...routes].sort((a, b) => b.dailyRiders - a.dailyRiders),
    [routes],
  );

  const heroSuggestions = useMemo<AutocompleteSuggestion[]>(
    () =>
      byRidership.map((route) => ({
        id: route.slug,
        primary: (
          <span className="inline-flex items-center gap-2.5">
            <RouteBadge route={route.label} sbs={route.sbs} size="sm" />
            <span>{route.corridorFull}</span>
          </span>
        ),
        meta: `${formatRiders(route.dailyRiders)} daily riders`,
        haystack: `${route.label} ${route.corridor} ${route.corridorFull} ${route.borough}`,
      })),
    [byRidership],
  );

  const boroughs = [
    "All boroughs",
    "Manhattan",
    "Brooklyn",
    "Bronx",
    "Queens",
    "Staten Island",
  ] as const;

  const filteredRoutes =
    borough === "All boroughs"
      ? byRidership
      : byRidership.filter((r) => r.borough.includes(borough));
  const previewRoutes = filteredRoutes.slice(0, INDEX_PREVIEW_LIMIT);

  const heroChips = byRidership.slice(0, 5);

  return (
    <main className="min-h-full bg-[var(--bp-color-paper)]">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="bg-[var(--bp-color-card)] shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
        <div className="mx-auto grid max-w-[1180px] grid-cols-[1.6fr_1fr] items-end gap-14 px-9 pb-16 pt-[72px] max-lg:grid-cols-1 max-lg:gap-10 max-sm:px-4 max-sm:pb-10 max-sm:pt-12">
          <div>
            <div className="mb-4.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--bp-color-accent)]">
              Bus Priority Impact Studio · A civic data project
            </div>
            <h1 className="m-0 max-w-[900px] text-balance text-[52px] font-semibold leading-[1.05] tracking-[-0.03em] max-sm:text-[36px]">
              We track every bus route in New York that should be moving faster than it is.
            </h1>
            <p className="mt-5.5 max-w-[720px] text-pretty text-[18px] leading-[1.55] text-[var(--bp-color-ink-70)]">
              The city has spent the last fifteen years building tools to speed up its slowest buses
              — bus lanes, automated camera enforcement, signal priority. Some routes have moved
              faster because of it. Others have kept slowing down. This site tells the story of
              every route the program has touched, route by route, in plain numbers, from public
              data.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <a
                href="#route-index"
                className="inline-flex h-11 items-center justify-center rounded-[3px] border border-[var(--bp-color-ink)] bg-[var(--bp-color-ink)] px-4.5 text-[13.5px] font-medium text-[var(--bp-color-paper)] no-underline transition-colors hover:bg-[var(--bp-color-ink)]/90"
              >
                Browse all {CITYWIDE_ROUTE_COUNT} routes &rarr;
              </a>
              <Link
                to="/interventions"
                viewTransition
                className="inline-flex h-11 items-center justify-center rounded-[3px] border border-[var(--bp-color-ink-20)] bg-transparent px-4.5 text-[13.5px] font-medium text-[var(--bp-color-ink)] no-underline transition-colors hover:bg-[var(--bp-color-ink-06)]"
              >
                Browse interventions
              </Link>
              <span className="flex-1" />
              <span className="font-mono text-[12px] text-[var(--bp-color-ink-55)]">
                updated weekly · last refresh {LAST_REFRESH}
              </span>
            </div>
          </div>

          {/* Right rail: find a route */}
          <div className="rounded-[4px] bg-[var(--bp-color-paper-deep)] px-6 pb-5.5 pt-6 shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
            <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--bp-color-ink-55)]">
              Find a route
            </div>
            <SearchAutocomplete
              placeholder="Route number, street, or borough…"
              suggestions={heroSuggestions}
              onSelect={(slug) => navigate({ to: "/routes/$routeId", params: { routeId: slug } })}
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
                  <RouteBadge route={r.label} sbs={r.sbs} size="sm" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CITYWIDE TOPLINE ─────────────────────────────────── */}
      <section className="mx-auto max-w-[1180px] px-9 pb-3 pt-14 max-sm:px-4">
        <SectionHeader
          kicker="The picture today"
          title="What the data says about New York's buses right now."
          sub="Numbers below cover all 327 local and Select Bus routes citywide, measured against their own scheduled timepoints across the past fourteen months."
        />
        <div className="mt-6 grid grid-cols-4 gap-9 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <BigStat
            value="327"
            label="Routes tracked across all five boroughs"
            sub="Every local and Select Bus route the MTA operates, including weekend-only and rush-only services."
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
            sub="Manhattan: 6.4 mph · Brooklyn: 6.6 · Queens: 7.2 · Staten Island: 9.8."
          />
        </div>
      </section>

      {/* ── IN FOCUS THIS MONTH ──────────────────────────────── */}
      <section className="mx-auto max-w-[1180px] px-9 pb-5 pt-[72px] max-sm:px-4 max-sm:pt-12">
        <SectionHeader
          kicker="In focus this month"
          title="Three routes telling three different stories."
          sub="Each links to a route page with charts, segments, intervention history, and methodology."
          right={
            <Link
              to="/interventions"
              viewTransition
              className="whitespace-nowrap text-[12px] font-semibold text-[var(--bp-color-accent)] no-underline"
            >
              See intervention timeline &rarr;
            </Link>
          }
        />
        <div className="grid grid-cols-3 gap-4.5 max-lg:grid-cols-1">
          {FEATURED.map((item) => (
            <FeaturedCard
              key={item.label}
              item={item}
              slug={slugByLabel.get(item.label.toLowerCase())}
            />
          ))}
        </div>
      </section>

      {/* ── BROWSE THE FULL INDEX ────────────────────────────── */}
      <section
        id="route-index"
        className="mx-auto max-w-[1180px] scroll-mt-20 px-9 pb-3 pt-[72px] max-sm:px-4 max-sm:pt-12"
      >
        <SectionHeader
          kicker="Every route"
          title="Browse the full index."
          sub="Sorted by daily ridership. Sparkline shows the route's 12-month speed trend; the status column groups routes by direction of travel."
          right={
            <div className="flex flex-wrap gap-1.5">
              {boroughs.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBorough(b)}
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
          }
        />
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
          {previewRoutes.map((r) => {
            const { status, tone } = trendStatus(r.spark);
            return (
              <Link
                key={r.slug}
                to="/routes/$routeId"
                params={{ routeId: r.slug }}
                viewTransition
                className="grid grid-cols-[90px_1fr_90px_110px_120px_90px_16px] items-center gap-4 px-4.5 py-3.5 text-[var(--bp-color-ink)] no-underline shadow-[inset_0_-1px_0_var(--bp-color-rule)] transition-colors hover:bg-[var(--bp-color-paper-deep)] max-md:grid-cols-[auto_1fr_auto]"
              >
                <RouteBadge route={r.label} sbs={r.sbs} size="md" />
                <div className="min-w-0 truncate text-[13.5px] font-medium">{r.corridorFull}</div>
                <div className="text-right max-md:hidden">
                  <div className="font-mono text-[15px] font-semibold tabular-nums leading-none">
                    {r.speedMph.toFixed(1)}
                  </div>
                  <div className="mt-[3px] text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--bp-color-ink-40)]">
                    mph today
                  </div>
                </div>
                <div className="max-md:hidden">
                  <Spark data={r.spark} width={104} height={22} color={toneColor[tone]} fill />
                </div>
                <div className="text-right font-mono text-[12px] tabular-nums text-[var(--bp-color-ink-70)] max-md:hidden">
                  {formatRiders(r.dailyRiders)}
                </div>
                <div
                  className="text-right text-[10px] font-bold uppercase tracking-[0.06em] max-md:hidden"
                  style={{ color: toneColor[tone] }}
                >
                  {status}
                </div>
                <div className="text-right text-[14px] text-[var(--bp-color-ink-40)] max-md:hidden">
                  →
                </div>
              </Link>
            );
          })}
          <div className="flex items-center gap-2.5 px-4.5 py-3.5 text-[12px] text-[var(--bp-color-ink-55)]">
            <span>
              Showing {previewRoutes.length} of{" "}
              {borough === "All boroughs" ? CITYWIDE_ROUTE_COUNT : filteredRoutes.length}{" "}
              {borough === "All boroughs" ? "" : `${borough} `}routes
            </span>
            <span className="flex-1" />
            <Link
              to="/methods"
              className="font-semibold text-[var(--bp-color-accent)] no-underline"
            >
              How this index is built &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 px-9 pb-7 pt-5 text-[11.5px] text-[var(--bp-color-ink-55)] max-sm:px-4">
        <span>Bus Priority Impact Studio · A civic data project</span>
        <span className="text-[var(--bp-color-ink-20)]">·</span>
        <span>Public-domain data, MIT-licensed code</span>
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
            <Skeleton className="h-[13px] w-[320px]" />
            <Skeleton className="h-[52px] w-full max-w-[820px]" />
            <Skeleton className="h-[52px] w-[70%]" />
            <Skeleton className="mt-2 h-[18px] w-full max-w-[680px]" />
            <Skeleton className="h-[18px] w-[80%] max-w-[560px]" />
            <div className="flex gap-3.5 pt-4">
              <Skeleton className="h-11 w-[200px] rounded-[3px]" />
              <Skeleton className="h-11 w-[200px] rounded-[3px]" />
            </div>
          </div>
          <Skeleton className="h-[180px] w-full rounded-[4px]" />
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
    </main>
  );
}
