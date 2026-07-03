import { useMemo, useState } from "react";
import { RouteBadge } from "@/components/RouteBadge";
import { RPubInterventionCard } from "@/components/route/RoutePublicAtoms";
import { SectionHeader } from "@/components/SectionHeader";
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
import { StudioHero, StudioPage } from "../page.js";

type InterventionEvidenceBundle = StudioInterventionsEvidenceBundle | StudioRouteEvidenceBundle;

type InterventionFilter = "all" | "evaluated" | "future" | "source-gap";

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

export function InterventionsPage({
  routes,
  evidence,
}: {
  routes: readonly StudioRoute[];
  evidence: readonly (InterventionEvidenceBundle | null)[];
}) {
  const [filter, setFilter] = useState<InterventionFilter>("all");
  const rows = useMemo(() => interventionRows(routes, evidence), [routes, evidence]);
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
      year: project.status ?? "undated",
      sortKey: "0000",
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
      year: "needs source",
      sortKey: "0000",
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

export function InterventionListRow({ row }: { row: InterventionRow }) {
  const cohort = row.event.comparisonCohort;
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)_150px] items-start gap-4 px-4 py-4 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-lg:grid-cols-[minmax(0,1fr)]">
      <a
        href={`/routes/${row.route.slug}`}
        className="flex flex-col items-start gap-2 text-[var(--bp-color-ink)] no-underline"
      >
        <RouteBadge route={row.route.label} sbs={row.route.sbs} size="md" />
        <span className="text-[11px] leading-[1.35] text-[var(--bp-color-ink-55)]">
          {row.route.corridor}
        </span>
      </a>
      <RPubInterventionCard
        dateLabel={row.event.year}
        yearLabel={interventionYearLabel(row.event)}
        kind={interventionKind(row.event)}
        title={row.event.title}
        detail={row.event.detail}
        tone={interventionTone(row.event)}
        sourceLabel={row.event.sourceLabel ?? sourceLabel(row.event)}
        citationKeys={row.event.citationKeys}
        evidence={row.evidence}
      />
      <div className="text-right text-[11.5px] text-[var(--bp-color-ink-55)] max-lg:text-left">
        {cohort ? (
          <>
            <div className="font-mono text-[15px] font-semibold text-[var(--bp-color-ink)]">
              {formatDelta(cohort.adjustedSpeedDeltaMph ?? cohort.routeSpeedDeltaMph)}
            </div>
            <div className="mt-1">{cohort.causalInterpretation.replaceAll("_", " ")}</div>
            <div className="mt-1">{cohort.routeCount} comparison routes</div>
          </>
        ) : (
          <a
            href={`/routes/${row.route.slug}`}
            className="font-semibold text-[var(--bp-color-accent)] no-underline"
          >
            Open route for context
          </a>
        )}
      </div>
    </div>
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

export function interventionTone(
  event: InterventionDisplayEvent,
): "accent" | "good" | "warn" | "bad" {
  if (event.tone === "good" || event.tone === "warn" || event.tone === "bad") return event.tone;
  if (event.source === "source_gap" || isFutureEvent(event)) return "warn";
  return "accent";
}

function interventionKind(event: InterventionDisplayEvent): string {
  if (event.comparisonCohort !== undefined) return "evaluated";
  if (event.source === "source_gap") return "source_gap";
  if (event.source === "wiki") return "wiki_evidence";
  return event.tone === "warn" ? "caveated" : "serving";
}

function sourceLabel(event: InterventionDisplayEvent): string {
  if (event.source === "source_gap") return "MTA-wiki";
  if (event.source === "wiki") return "MTA-wiki";
  return "Serving record";
}

function interventionYearLabel(event: InterventionDisplayEvent): string {
  const match = event.year.match(/\d{4}/);
  if (match !== null) return match[0];
  if (event.source === "source_gap") return "gap";
  return "date";
}

function formatDelta(value: number | null): string {
  if (value === null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} mph`;
}
