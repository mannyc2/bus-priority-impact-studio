import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RouteBadge } from "@/components/RouteBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/ui/badge";
import type { StudioIntervention, StudioRoute } from "../api-contract.js";
import { StudioHero, StudioPage } from "../page.js";

type InterventionFilter = "all" | "evaluated" | "future" | "source-gap";

type InterventionRow = {
  key: string;
  route: StudioRoute;
  event: StudioIntervention;
};

const filters: readonly { id: InterventionFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "evaluated", label: "Evaluated" },
  { id: "future", label: "Future" },
  { id: "source-gap", label: "Needs source" },
];

export function InterventionsPage({ routes }: { routes: readonly StudioRoute[] }) {
  const [filter, setFilter] = useState<InterventionFilter>("all");
  const rows = useMemo(() => interventionRows(routes), [routes]);
  const filteredRows = rows.filter((row) => matchesFilter(row.event, filter));
  const routesWithEvents = new Set(rows.map((row) => row.route.slug)).size;
  const evaluatedCount = rows.filter((row) => row.event.comparisonCohort !== undefined).length;
  const futureCount = rows.filter((row) => isFutureEvent(row.event)).length;

  return (
    <StudioPage>
      <StudioHero
        label="Interventions"
        title="What changed on the street, and what happened next."
        body="A route-by-route inventory of bus lanes, enforcement, signal priority, redesigns, and dated program changes visible in the current public release."
      />
      <section className="mb-7 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <InterventionStat label="Routes with records" value={routesWithEvents} sub="route pages" />
        <InterventionStat label="Interventions" value={rows.length} sub="dated records" />
        <InterventionStat label="Evaluated" value={evaluatedCount} sub="before/after windows" />
        <InterventionStat label="Future" value={futureCount} sub="awaiting post data" />
      </section>

      <section>
        <SectionHeader
          title="Timeline"
          sub="Sorted newest first. Open a route for segment maps, speed history, ridership, caveats, and citations."
          right={
            <div className="flex flex-wrap justify-end gap-1.5">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={
                    filter === item.id
                      ? "rounded-[3px] border-0 bg-[var(--bp-color-ink)] px-3 py-1.5 text-[12px] font-semibold text-[var(--bp-color-paper)]"
                      : "rounded-[3px] border border-[var(--bp-color-ink-20)] bg-transparent px-3 py-1.5 text-[12px] font-semibold text-[var(--bp-color-ink-70)] hover:bg-[var(--bp-color-card)]"
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
          }
        />
        <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
          {filteredRows.length > 0 ? (
            filteredRows.map((row) => <InterventionListRow key={row.key} row={row} />)
          ) : (
            <div className="px-4 py-5 text-[13px] text-[var(--bp-color-ink-55)]">
              No intervention records match this filter.
            </div>
          )}
        </div>
      </section>
    </StudioPage>
  );
}

export function InterventionsLoadingPage() {
  return (
    <StudioPage>
      <div className="mb-6 h-[118px] max-w-[760px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
      <div className="mb-7 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-[86px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]"
          />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
    </StudioPage>
  );
}

function interventionRows(routes: readonly StudioRoute[]): InterventionRow[] {
  return routes
    .flatMap((route) =>
      route.interventions.map((event, index) => ({
        key: `${route.slug}:${event.year}:${index}`,
        route,
        event,
      })),
    )
    .sort((left, right) => right.event.year.localeCompare(left.event.year));
}

function matchesFilter(event: StudioIntervention, filter: InterventionFilter): boolean {
  if (filter === "evaluated") return event.comparisonCohort !== undefined;
  if (filter === "future") return isFutureEvent(event);
  if (filter === "source-gap") return event.tone === "warn" && event.sourceLabel === undefined;
  return true;
}

function isFutureEvent(event: StudioIntervention): boolean {
  const text = `${event.title} ${event.detail}`.toLowerCase();
  return text.includes("future") || text.includes("scheduled") || text.includes("await");
}

function InterventionListRow({ row }: { row: InterventionRow }) {
  const cohort = row.event.comparisonCohort;
  return (
    <Link
      to="/routes/$routeId"
      params={{ routeId: row.route.slug }}
      viewTransition
      className="grid grid-cols-[92px_96px_minmax(0,1fr)_160px] items-start gap-4 px-4 py-4 text-[var(--bp-color-ink)] no-underline shadow-[inset_0_-1px_0_var(--bp-color-rule)] transition-colors last:shadow-none hover:bg-[var(--bp-color-paper-deep)] max-lg:grid-cols-[82px_minmax(0,1fr)] max-lg:gap-y-2"
    >
      <RouteBadge route={row.route.label} sbs={row.route.sbs} size="md" />
      <div className="font-mono text-[11.5px] font-semibold text-[var(--bp-color-accent)]">
        {row.event.year}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-[14px] font-semibold leading-tight">{row.event.title}</h3>
          <Badge variant={toneVariant(row.event)}>{toneLabel(row.event)}</Badge>
        </div>
        <p className="m-0 mt-1 max-w-[780px] text-[12.5px] leading-[1.5] text-[var(--bp-color-ink-70)]">
          {row.event.detail}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--bp-color-ink-55)]">
          <span>{row.route.corridor}</span>
          {row.event.sourceLabel ? <span>source: {row.event.sourceLabel}</span> : null}
          {cohort ? <span>{cohort.routeCount} comparison routes</span> : null}
        </div>
      </div>
      <div className="text-right text-[11.5px] text-[var(--bp-color-ink-55)] max-lg:col-start-2 max-lg:text-left">
        {cohort ? (
          <>
            <div className="font-mono text-[15px] font-semibold text-[var(--bp-color-ink)]">
              {formatDelta(cohort.adjustedSpeedDeltaMph ?? cohort.routeSpeedDeltaMph)}
            </div>
            <div className="mt-1">{cohort.causalInterpretation.replaceAll("_", " ")}</div>
          </>
        ) : (
          "Open route for context"
        )}
      </div>
    </Link>
  );
}

function InterventionStat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
      <div className="mt-1 font-mono text-[28px] font-semibold leading-none">{value}</div>
      <div className="mt-1 text-[11.5px] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}

function toneVariant(event: StudioIntervention): "accent" | "good" | "warn" | "bad" | "neutral" {
  if (event.tone !== undefined) return event.tone;
  return event.comparisonCohort === undefined ? "neutral" : "accent";
}

function toneLabel(event: StudioIntervention): string {
  if (event.comparisonCohort !== undefined) return "evaluated";
  if (isFutureEvent(event)) return "future";
  if (event.tone === "warn") return "caveated";
  return "record";
}

function formatDelta(value: number | null): string {
  if (value === null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} mph`;
}
