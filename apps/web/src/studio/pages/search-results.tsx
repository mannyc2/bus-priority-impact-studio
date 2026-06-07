import { Link, useNavigate } from "@tanstack/react-router";
import { Briefcase, Hash } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { DirIndicator } from "@/components/DirIndicator";
import { EmptyState } from "@/components/EmptyState";
import { RouteBadge } from "@/components/RouteBadge";
import { type AutocompleteSuggestion, SearchAutocomplete } from "@/components/SearchAutocomplete";
import { TreatmentRow } from "@/components/TreatmentRow";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  StudioRoute,
  StudioSearchNote,
  StudioSearchResponse,
  StudioSearchSegmentCard,
} from "../api-contract.js";
import { StudioHero, StudioPage } from "../page.js";

// ── Treatment / facet model ──────────────────────────────────────────────
// One "unit" abstraction over routes and segments so facet counts, filtering,
// and the per-row "matches" tags all share a single source of truth.

type Lane = "yes" | "partial" | "minimal" | "none";

type Unit = {
  borough: string;
  sbs: boolean;
  ace: boolean;
  lane: Lane;
  tsp: boolean;
  belowSched: boolean;
  topDecile: boolean;
};

function routeLane(coverage: number): Lane {
  if (coverage >= 0.9) return "yes";
  if (coverage >= 0.5) return "partial";
  if (coverage > 0) return "minimal";
  return "none";
}

function routeUnit(route: StudioRoute): Unit {
  return {
    borough: route.borough,
    sbs: route.sbs,
    ace: route.aceStatus === "active",
    lane: routeLane(route.laneCoverage),
    tsp: route.tspCoverage === "yes",
    belowSched: route.speedMph < route.scheduledMph,
    topDecile: route.speedPercentile <= 10,
  };
}

function segmentUnit({ segment, route }: StudioSearchSegmentCard): Unit {
  return {
    borough: route.borough,
    sbs: route.sbs,
    ace: segment.ace,
    lane: segment.lane,
    tsp: segment.tsp,
    belowSched: segment.speedMph < segment.scheduledMph,
    topDecile: route.speedPercentile <= 10,
  };
}

const BOROUGH_ORDER = ["Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"];
const SERVICE_GROUP = "Service type";
const TREATMENT_GROUP = "Treatment";
const PERFORMANCE_GROUP = "Performance";
const BOROUGH_GROUP = "Borough";

function unitMatchesLabel(unit: Unit, group: string, label: string): boolean {
  switch (group) {
    case BOROUGH_GROUP:
      return unit.borough.includes(label);
    case SERVICE_GROUP:
      return label === "Select Bus" ? unit.sbs : !unit.sbs;
    case TREATMENT_GROUP:
      if (label === "ACE active") return unit.ace;
      if (label === "Bus lane (full)") return unit.lane === "yes";
      if (label === "Bus lane (partial)") return unit.lane === "partial" || unit.lane === "minimal";
      if (label === "TSP installed") return unit.tsp;
      return false;
    case PERFORMANCE_GROUP:
      if (label === "Below scheduled pace") return unit.belowSched;
      if (label === "Top decile delay") return unit.topDecile;
      return false;
    default:
      return false;
  }
}

// The facet tags shown inline on each result row ("Manhattan · ACE active · …").
function unitTags(unit: Unit): string[] {
  const tags = [unit.borough];
  if (unit.ace) tags.push("ACE active");
  if (unit.lane === "yes") tags.push("Bus lane");
  else if (unit.lane === "partial" || unit.lane === "minimal") tags.push("Bus lane (partial)");
  if (unit.tsp) tags.push("TSP");
  if (unit.sbs) tags.push("SBS");
  return tags;
}

function facetKey(group: string, label: string): string {
  return `${group}|${label}`;
}

function unitPasses(unit: Unit, selectedByGroup: Map<string, string[]>): boolean {
  for (const [group, labels] of selectedByGroup) {
    if (!labels.some((label) => unitMatchesLabel(unit, group, label))) return false;
  }
  return true;
}

function formatRiders(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`;
}

function speedTone(mph: number): string {
  return mph < 5 ? "var(--bp-color-bad)" : mph < 6.5 ? "var(--bp-color-warn)" : "var(--bp-color-ink)";
}

// ── Page ─────────────────────────────────────────────────────────────────

type SortMode = "relevance" | "slowest";

export function SearchResultsPage({
  data,
  allRoutes,
}: {
  data: StudioSearchResponse;
  allRoutes: readonly StudioRoute[];
}) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [sort, setSort] = useState<SortMode>("relevance");
  const [showAll, setShowAll] = useState<ReadonlySet<string>>(new Set());

  const suggestions = useMemo<AutocompleteSuggestion[]>(
    () =>
      [...allRoutes]
        .sort((a, b) => b.dailyRiders - a.dailyRiders)
        .map((route) => ({
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
    [allRoutes],
  );

  const selectedByGroup = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const key of selected) {
      const [group, label] = key.split("|");
      if (group && label) map.set(group, [...(map.get(group) ?? []), label]);
    }
    return map;
  }, [selected]);

  // Route- and segment-shaped results carry the place/treatment facets.
  const routeUnits = useMemo(
    () => data.routes.map((route) => ({ route, unit: routeUnit(route) })),
    [data.routes],
  );
  const segmentUnits = useMemo(
    () => data.segments.map((card) => ({ card, unit: segmentUnit(card) })),
    [data.segments],
  );

  const facetGroups = useMemo(() => {
    const units = [...routeUnits.map((r) => r.unit), ...segmentUnits.map((s) => s.unit)];
    const count = (group: string, label: string) =>
      units.filter((unit) => unitMatchesLabel(unit, group, label)).length;
    const boroughs = [...new Set(units.map((u) => u.borough))].sort(
      (a, b) => BOROUGH_ORDER.indexOf(a) - BOROUGH_ORDER.indexOf(b),
    );
    return [
      { title: BOROUGH_GROUP, labels: boroughs },
      { title: SERVICE_GROUP, labels: ["Local", "Select Bus"] },
      {
        title: TREATMENT_GROUP,
        labels: ["ACE active", "Bus lane (full)", "Bus lane (partial)", "TSP installed"],
      },
      { title: PERFORMANCE_GROUP, labels: ["Below scheduled pace", "Top decile delay"] },
    ].map((group) => ({
      ...group,
      items: group.labels
        .map((label) => ({ label, count: count(group.title, label) }))
        .filter((item) => item.count > 0),
    }));
  }, [routeUnits, segmentUnits]);

  const visibleRoutes = useMemo(() => {
    const filtered = routeUnits.filter(({ unit }) => unitPasses(unit, selectedByGroup));
    return sort === "slowest"
      ? [...filtered].sort((a, b) => a.route.speedMph - b.route.speedMph)
      : filtered;
  }, [routeUnits, selectedByGroup, sort]);

  const visibleSegments = useMemo(() => {
    const filtered = segmentUnits.filter(({ unit }) => unitPasses(unit, selectedByGroup));
    return sort === "slowest"
      ? [...filtered].sort((a, b) => a.card.segment.speedMph - b.card.segment.speedMph)
      : filtered;
  }, [segmentUnits, selectedByGroup, sort]);

  const total =
    visibleRoutes.length +
    visibleSegments.length +
    data.findings.length +
    data.briefs.length +
    data.notes.length;

  function toggleFacet(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleShowAll(key: string) {
    setShowAll((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <StudioPage>
      <StudioHero
        label="Search"
        title={
          <>
            Results for <span className="text-[var(--bp-color-ink-55)]">"{data.query}"</span>
          </>
        }
      />

      {/* Header — re-query field + result tally + sort */}
      <div className="mb-6 max-w-[820px]">
        <SearchAutocomplete
          defaultValue={data.query}
          placeholder="Search route, segment, brief…"
          shortcut="/"
          suggestions={suggestions}
          onSelect={(slug) => navigate({ to: "/routes/$routeId", params: { routeId: slug } })}
          onSubmitQuery={(q) => navigate({ to: "/search", search: { q } })}
        />
        <div className="mt-3 flex items-center gap-3.5 text-[12px] text-[var(--bp-color-ink-70)]">
          <span>
            <b className="text-[var(--bp-color-ink)]">
              {total} {total === 1 ? "result" : "results"}
            </b>{" "}
            for "{data.query}"
          </span>
          <span className="flex-1" />
          <span className="font-mono text-[var(--bp-color-ink-55)]">
            sorted by {sort === "slowest" ? "slowest first" : "relevance"}
          </span>
          <button
            type="button"
            onClick={() => setSort((s) => (s === "relevance" ? "slowest" : "relevance"))}
            className="font-semibold text-[var(--bp-color-accent)]"
          >
            Change sort →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[240px_1fr] gap-6 max-lg:grid-cols-1">
        {/* Left rail — facets */}
        <aside className="max-lg:order-2">
          <div className="mb-4 flex items-baseline justify-between">
            <div className="text-[13.5px] font-semibold tracking-[-0.005em]">Filter results</div>
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[11.5px] font-medium text-[var(--bp-color-accent)]"
              >
                Reset
              </button>
            ) : null}
          </div>
          {facetGroups.map((group) =>
            group.items.length === 0 ? null : (
              <div key={group.title} className="mb-5">
                <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
                  {group.title}
                </div>
                <div className="flex flex-col gap-1">
                  {group.items.map((item) => {
                    const key = facetKey(group.title, item.label);
                    const on = selected.has(key);
                    return (
                      <label
                        key={item.label}
                        className="flex cursor-pointer items-center gap-2 py-0.5 text-[12px] text-[var(--bp-color-ink)]"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleFacet(key)}
                          className="size-[14px] shrink-0 accent-[var(--bp-color-ink)]"
                        />
                        <span className="flex-1">{item.label}</span>
                        <span className="font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">
                          {item.count}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ),
          )}
          <div className="my-4 h-px bg-[var(--bp-color-rule)]" />
          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            Save this search
          </div>
          <Link
            to="/account"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full")}
          >
            Save as alert →
          </Link>
          <p className="mt-1.5 text-[10.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
            Email or RSS digest when these results change week-over-week.
          </p>
        </aside>

        {/* Center — results */}
        <div className="min-w-0 space-y-7 max-lg:order-1">
          {total === 0 ? (
            <EmptyState
              className="px-4 py-12"
              icon="∅"
              title="No results"
              body="No routes, segments, findings, briefs, or methodology notes matched this query."
            />
          ) : null}

          <ResultGroup
            label="Routes"
            count={visibleRoutes.length}
            cols="110px 1fr 80px 110px 132px"
            headers={[
              { label: "" },
              { label: "Route" },
              { label: "Avg mph", align: "right" },
              { label: "Lost RH / day", align: "right" },
              { label: "Treatments" },
            ]}
            cap={4}
            expanded={showAll.has("Routes")}
            onShowAll={() => toggleShowAll("Routes")}
          >
            {visibleRoutes.map(({ route, unit }) => (
              <Link
                key={route.slug}
                to="/routes/$routeId"
                params={{ routeId: route.slug }}
                viewTransition
                className="grid grid-cols-[110px_1fr_80px_110px_132px] items-center gap-4 px-4 py-3.5 text-[var(--bp-color-ink)] no-underline shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-sm:grid-cols-1"
              >
                <RouteBadge route={route.label} sbs={route.sbs} size="md" />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium">
                    {route.corridor}{" "}
                    <span className="font-normal text-[var(--bp-color-ink-70)]">
                      · {route.borough}
                    </span>
                  </div>
                  <RowMeta riders={`${formatRiders(route.dailyRiders)} daily riders`} unit={unit} />
                </div>
                <NumCell value={route.speedMph.toFixed(1)} unit="mph" tone={speedTone(route.speedMph)} />
                <div className="text-right font-mono text-[11px] text-[var(--bp-color-ink-70)] max-sm:text-left">
                  {Math.round(route.riderHoursLost).toLocaleString()} RH/day
                </div>
                <div className="max-sm:hidden">
                  <TreatmentRow
                    lane={routeLane(route.laneCoverage)}
                    ace={route.aceStatus === "active"}
                    tsp={route.tspCoverage === "yes"}
                  />
                </div>
              </Link>
            ))}
          </ResultGroup>

          <ResultGroup
            label="Segments"
            count={visibleSegments.length}
            cols="28px 96px 1fr 80px 110px 132px"
            headers={[
              { label: "" },
              { label: "" },
              { label: "Segment" },
              { label: "mph", align: "right" },
              { label: "RH / day", align: "right" },
              { label: "Treatments" },
            ]}
            cap={6}
            expanded={showAll.has("Segments")}
            onShowAll={() => toggleShowAll("Segments")}
          >
            {visibleSegments.map(({ card, unit }) => {
              const { segment, route } = card;
              return (
                <Link
                  key={segment.id}
                  to="/routes/$routeId/ladder"
                  params={{ routeId: route.slug }}
                  viewTransition
                  className="grid grid-cols-[28px_96px_1fr_80px_110px_132px] items-center gap-3.5 px-4 py-3.5 text-[var(--bp-color-ink)] no-underline shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-sm:grid-cols-[28px_1fr]"
                >
                  <SeverityDot mph={segment.speedMph} />
                  <div className="max-sm:hidden">
                    <RouteBadge route={route.label} sbs={route.sbs} size="sm" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <DirIndicator dir={segment.direction} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {segment.from} <span className="text-[var(--bp-color-ink-40)]">→</span>{" "}
                        {segment.to}
                      </span>
                    </div>
                    <RowMeta unit={unit} className="ml-7" />
                  </div>
                  <NumCell
                    value={segment.speedMph.toFixed(1)}
                    unit="mph"
                    tone={speedTone(segment.speedMph)}
                  />
                  <div className="text-right font-mono text-[11px] text-[var(--bp-color-ink-70)] max-sm:hidden">
                    {Math.round(segment.riderHours).toLocaleString()} RH/day
                  </div>
                  <div className="max-sm:hidden">
                    <TreatmentRow lane={segment.lane} ace={segment.ace} tsp={segment.tsp} />
                  </div>
                </Link>
              );
            })}
          </ResultGroup>

          <ResultGroup label="Findings" count={data.findings.length} cap={4} expanded={showAll.has("Findings")} onShowAll={() => toggleShowAll("Findings")}>
            {data.findings.map(({ finding }) => (
              <Link
                key={finding.id}
                to="/findings/$findingId"
                params={{ findingId: finding.id }}
                viewTransition
                className="flex items-start gap-3 px-4 py-3.5 text-[var(--bp-color-ink)] no-underline shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none"
              >
                <Briefcase size={16} className="mt-0.5 shrink-0 text-[var(--bp-color-ink-55)]" />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold">{finding.title}</div>
                  <div className="mt-1 text-[12px] text-[var(--bp-color-ink-55)]">
                    {finding.category} · {finding.metric}
                  </div>
                </div>
              </Link>
            ))}
          </ResultGroup>

          <ResultGroup
            label="Briefs"
            count={data.briefs.length}
            cols="96px 80px 1fr 110px"
            headers={[
              { label: "Status" },
              { label: "" },
              { label: "Brief" },
              { label: "Updated", align: "right" },
            ]}
            cap={4}
            expanded={showAll.has("Briefs")}
            onShowAll={() => toggleShowAll("Briefs")}
          >
            {data.briefs.map(({ brief, route }) => (
              <Link
                key={brief.id}
                to="/briefs/$briefId"
                params={{ briefId: brief.id }}
                viewTransition
                className="grid grid-cols-[96px_80px_1fr_110px] items-center gap-3.5 px-4 py-3.5 text-[var(--bp-color-ink)] no-underline shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-sm:grid-cols-1"
              >
                <Badge variant={briefTone(brief.status)}>{brief.status}</Badge>
                <div className="max-sm:hidden">
                  <RouteBadge route={route.label} sbs={route.sbs} size="sm" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold">{brief.title}</div>
                  <div className="mt-1 truncate text-[11.5px] text-[var(--bp-color-ink-55)]">
                    {brief.authors.join(" · ") || "—"} · {brief.citationCount} citations
                  </div>
                </div>
                <div className="text-right font-mono text-[11px] text-[var(--bp-color-ink-55)] max-sm:text-left">
                  {brief.generated}
                </div>
              </Link>
            ))}
          </ResultGroup>

          <ResultGroup label="Methodology notes" count={data.notes.length} cap={4} expanded={showAll.has("Methodology notes")} onShowAll={() => toggleShowAll("Methodology notes")}>
            {data.notes.map((note) => (
              <NoteRow key={note.id} note={note} />
            ))}
          </ResultGroup>
        </div>
      </div>
    </StudioPage>
  );
}

// ── Small presentational helpers ─────────────────────────────────────────

function RowMeta({
  riders,
  unit,
  className,
}: {
  riders?: string;
  unit: Unit;
  className?: string;
}) {
  const tags = unitTags(unit).slice(0, 3);
  return (
    <div className={cn("mt-1 text-[11.5px] text-[var(--bp-color-ink-55)]", className)}>
      {riders ? <span>{riders} · </span> : null}
      matches: <span className="text-[var(--bp-color-accent)]">{tags.join(" · ")}</span>
    </div>
  );
}

function NumCell({ value, unit, tone }: { value: string; unit: string; tone: string }) {
  return (
    <div className="text-right max-sm:text-left">
      <div className="font-mono text-[15px] font-semibold leading-none" style={{ color: tone }}>
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[9.5px] text-[var(--bp-color-ink-55)]">{unit}</div>
    </div>
  );
}

function SeverityDot({ mph }: { mph: number }) {
  const bg =
    mph < 5 ? "var(--bp-color-bad)" : mph < 6.5 ? "var(--bp-color-warn)" : "var(--bp-color-ink-40)";
  return (
    <span
      className="flex size-[22px] items-center justify-center rounded-full font-mono text-[9.5px] font-bold text-white"
      style={{ background: bg }}
    >
      {mph.toFixed(1)}
    </span>
  );
}

function NoteRow({ note }: { note: StudioSearchNote }) {
  const className =
    "block px-4 py-3 text-[var(--bp-color-ink)] no-underline shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none";
  const body = (
    <>
      <div className="flex items-baseline gap-2">
        <Hash size={13} className="shrink-0 text-[var(--bp-color-ink-55)]" />
        <div className="flex-1 text-[13px] font-semibold">{note.title}</div>
        <div className="shrink-0 font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">
          {note.where}
        </div>
      </div>
      {note.preview ? (
        <div className="ml-[21px] mt-1 line-clamp-2 text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-70)]">
          {note.preview}
        </div>
      ) : null}
    </>
  );
  // note.href is one of the two methodology surfaces; branch so Link gets a typed route.
  return note.href === "/methods" ? (
    <Link to="/methods" viewTransition className={className}>
      {body}
    </Link>
  ) : (
    <Link to="/docs" viewTransition className={className}>
      {body}
    </Link>
  );
}

function briefTone(status: string): "good" | "warn" | "neutral" {
  if (status === "Published") return "good";
  if (status === "In review") return "warn";
  return "neutral";
}

function ResultGroup({
  label,
  count,
  cols,
  headers,
  cap,
  expanded,
  onShowAll,
  children,
}: {
  label: string;
  count: number;
  cols?: string;
  headers?: readonly { label: string; align?: "right" }[];
  cap: number;
  expanded: boolean;
  onShowAll: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  const items = Array.isArray(children) ? children.flat() : [children];
  const overflow = items.length > cap;
  const shown = expanded ? items : items.slice(0, cap);

  return (
    <section>
      <div className="flex items-baseline gap-3 px-4 pb-2">
        <h2 className="m-0 text-[13px] font-semibold tracking-[-0.005em]">{label}</h2>
        <span className="font-mono text-[11px] text-[var(--bp-color-ink-55)]">
          {count} {count === 1 ? "match" : "matches"}
        </span>
        <span className="flex-1" />
        {overflow ? (
          <button
            type="button"
            onClick={onShowAll}
            className="text-[11.5px] font-semibold text-[var(--bp-color-accent)]"
          >
            {expanded ? "Show fewer" : `Show all ${count} →`}
          </button>
        ) : null}
      </div>
      {cols && headers ? (
        <div
          className="grid gap-4 px-4 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--bp-color-ink-55)] shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-sm:hidden"
          style={{ gridTemplateColumns: cols }}
        >
          {headers.map((header, index) => (
            <span
              key={header.label || `col-${index}`}
              className={header.align === "right" ? "text-right" : undefined}
            >
              {header.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
        {shown}
      </div>
    </section>
  );
}
