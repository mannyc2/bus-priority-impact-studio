import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { RouteHistoryOutcomes } from "@/components/route/RouteHistoryOutcomes";
import {
  buildRouteHistoryLedger,
  filterRouteHistoryLedger,
  groupRouteHistoryLedger,
  HISTORY_CONTROL_THRESHOLD,
  HISTORY_PAGE_SIZE,
  type HistoryLedgerKind,
  type HistoryLedgerRow,
  historyYearLabel,
} from "@/components/route/route-history-ledger";
import {
  interventionLabelForKind,
  type RouteInterventionViewModel,
  routeInterventionViewModel,
  treatmentLifecycleLabel,
  treatmentRecordAnchorId,
} from "@/components/route/route-intervention-model";
import { SectionCard } from "@/components/SectionCard";
import { citationEntries, SourceNote } from "@/components/SourceNote";
import type {
  RouteStudiesArtifact,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteInterventionCurrentState,
  StudioRouteInterventionInventoryBundle,
} from "@/studio/api-contract";

export { interventionComparisonCards } from "@/components/route/RouteHistoryOutcomes";

export function TreatmentsHistorySection({
  data,
  evidence,
  inventory = null,
  studies = null,
  studyKey,
  recordKey,
}: {
  data: StudioRouteDetailResponse;
  evidence: StudioRouteEvidenceBundle | null;
  inventory?: StudioRouteInterventionInventoryBundle | null;
  studies?: RouteStudiesArtifact | null;
  studyKey?: string | undefined;
  recordKey?: string | undefined;
}) {
  const { route } = data;
  const model = routeInterventionViewModel(inventory);
  const ledger = buildRouteHistoryLedger({
    interventions: route.interventions,
    evidence,
    model,
  });
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const targetAnchor =
    studyKey !== undefined
      ? treatmentRecordAnchorId(`study:${studyKey}`)
      : recordKey === undefined
        ? undefined
        : treatmentRecordAnchorId(recordKey);
  useHistoryTarget(targetAnchor, sectionRef);

  const routeSummary = `${ledger.length} documented ${ledger.length === 1 ? "record" : "records"} for ${route.routeId}.`;

  return (
    <div
      ref={sectionRef}
      tabIndex={-1}
      className="flex flex-col gap-6 outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)]"
    >
      <header className="border-b border-[var(--bp-color-rule)] pb-4">
        <h2 className="text-[25px] font-semibold leading-[1.05] tracking-[-0.025em]">
          Treatments &amp; history
        </h2>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-[1.55] text-[var(--bp-color-ink-70)]">
          {routeSummary}
        </p>
        <nav
          aria-label="History sections"
          className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11.5px] font-semibold text-[var(--bp-color-accent)]"
        >
          <a href="#route-current-state">Current state</a>
          <a href="#route-history-ledger">History</a>
          <a href="#route-history-outcomes">Outcomes</a>
        </nav>
      </header>

      <div className="grid grid-cols-[238px_minmax(0,1fr)] items-start gap-6 max-lg:grid-cols-1">
        <CurrentStateSummary
          model={model}
          currentState={inventory?.currentState ?? []}
          exactRouteSlug={route.slug}
        />
        <div className="min-w-0 space-y-6">
          <HistoryLedger rows={ledger} evidence={evidence} recordKey={recordKey} />
          <RouteHistoryOutcomes
            interventions={route.interventions}
            studies={studies}
            studyKey={studyKey}
          />
        </div>
      </div>
    </div>
  );
}

function CurrentStateSummary({
  model,
  currentState,
  exactRouteSlug,
}: {
  model: RouteInterventionViewModel;
  currentState: readonly StudioRouteInterventionCurrentState[];
  exactRouteSlug: string;
}) {
  const status = currentStateStatus(model, currentState.length);
  return (
    <section
      id="route-current-state"
      className="scroll-mt-20 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)] lg:sticky lg:top-4"
    >
      <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.09em] text-[var(--bp-color-ink-55)]">
        Current state
      </div>
      <h3 className="mt-1 text-[15px] font-semibold leading-tight">{status.title}</h3>
      {status.detail === null ? null : (
        <p className="mt-2 text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
          {status.detail}
        </p>
      )}
      {currentState.length === 0 ? null : (
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 border-t border-[var(--bp-color-rule)] pt-3">
          {currentState.map((row) => (
            <CurrentStateRow key={row.treatmentIds.join(":")} row={row} />
          ))}
        </ul>
      )}
      <Link
        to="/interventions"
        search={{ route: exactRouteSlug }}
        className="mt-4 inline-flex text-[11.5px] font-semibold text-[var(--bp-color-accent)]"
      >
        Browse this exact route in all interventions →
      </Link>
    </section>
  );
}

export function currentStateStatus(
  model: RouteInterventionViewModel,
  currentStateCount: number,
): {
  title: string;
  detail: string | null;
} {
  if (model.coverage.status === "unavailable") {
    return {
      title: "Treatment inventory unavailable",
      detail: "No current state is inferred from historical or implemented records.",
    };
  }
  if (model.coverage.status === "checked_empty") {
    return {
      title: "Checked, with no positive evidence",
      detail: model.coverage.message,
    };
  }
  if (currentStateCount === 0) {
    return {
      title: "No current-confirmed state",
      detail: model.coverage.status === "partial" ? model.coverage.message : null,
    };
  }
  return {
    title: `${currentStateCount} documented current ${currentStateCount === 1 ? "state" : "states"}`,
    detail: model.coverage.status === "partial" ? model.coverage.message : null,
  };
}

function CurrentStateRow({ row }: { row: StudioRouteInterventionCurrentState }) {
  return (
    <li className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] font-semibold leading-tight">
          {interventionLabelForKind(row.treatmentKind)}
        </span>
        <span className="text-[10px] text-[var(--bp-color-ink-55)]">
          {treatmentLifecycleLabel(row.lifecycleState)}
        </span>
      </div>
    </li>
  );
}

function HistoryLedger({
  rows,
  evidence,
  recordKey,
}: {
  rows: readonly HistoryLedgerRow[];
  evidence: StudioRouteEvidenceBundle | null;
  recordKey?: string | undefined;
}) {
  const [limit, setLimit] = useState(HISTORY_PAGE_SIZE);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyKind, setHistoryKind] = useState<HistoryLedgerKind>();
  const filteredRows = filterRouteHistoryLedger(rows, {
    query: historyQuery,
    kind: historyKind,
  });
  useEffect(() => setLimit(HISTORY_PAGE_SIZE), [historyQuery, historyKind]);
  const targetIndex =
    recordKey === undefined
      ? -1
      : filteredRows.findIndex(
          (row) => row.recordId === recordKey || row.relatedRecordIds.includes(recordKey),
        );
  const effectiveLimit = Math.max(limit, targetIndex + 1);
  const visibleRows = filteredRows.slice(0, effectiveLimit);
  const groups = groupRouteHistoryLedger(visibleRows);
  const remaining = filteredRows.length - visibleRows.length;
  const controlsVisible = rows.length > HISTORY_CONTROL_THRESHOLD;

  return (
    <section id="route-history-ledger" className="scroll-mt-20">
      <SectionCard
        title="History"
        sub={`${rows.length} ${rows.length === 1 ? "record" : "records"}; newest first, undated last.`}
      >
        {controlsVisible ? (
          <HistoryControls
            historyQuery={historyQuery}
            historyKind={historyKind}
            setHistoryQuery={setHistoryQuery}
            setHistoryKind={setHistoryKind}
          />
        ) : null}
        {rows.length === 0 ? (
          <HistoryEmptyState>
            No documented History records are available for this exact route.
          </HistoryEmptyState>
        ) : filteredRows.length === 0 ? (
          <HistoryEmptyState>No History records match these filters.</HistoryEmptyState>
        ) : (
          <>
            <p role="status" className="sr-only">
              {`${filteredRows.length} matching History ${filteredRows.length === 1 ? "record" : "records"}.`}
            </p>
            <div className={controlsVisible ? "mt-4" : ""}>
              {groups.map((group) => {
                return (
                  <div
                    key={group.year}
                    className="grid grid-cols-[72px_minmax(0,1fr)] border-t-2 border-[var(--bp-color-ink)] max-sm:grid-cols-[56px_minmax(0,1fr)]"
                  >
                    <div className="px-0 py-2.5 font-mono text-[12px] font-semibold tabular-nums">
                      {group.year}
                    </div>
                    <div className="min-w-0 border-l border-[var(--bp-color-rule)] pl-3">
                      {group.rows.map((row) => (
                        <HistoryLedgerRowView key={row.key} row={row} evidence={evidence} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {remaining > 0 ? (
              <div className="border-t border-[var(--bp-color-rule)] pt-3 text-center">
                <button
                  type="button"
                  onClick={() => setLimit((value) => value + HISTORY_PAGE_SIZE)}
                  className="rounded-[3px] px-3 py-2 text-[12px] font-semibold text-[var(--bp-color-ink-55)] hover:text-[var(--bp-color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bp-color-accent)]"
                >
                  {`Show ${Math.min(HISTORY_PAGE_SIZE, remaining)} more (${remaining} left)`}
                </button>
              </div>
            ) : null}
          </>
        )}
      </SectionCard>
    </section>
  );
}

function HistoryControls({
  historyQuery,
  historyKind,
  setHistoryQuery,
  setHistoryKind,
}: {
  historyQuery: string;
  historyKind?: HistoryLedgerKind | undefined;
  setHistoryQuery: (query: string) => void;
  setHistoryKind: (kind: HistoryLedgerKind | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-[var(--bp-color-rule)] pt-3">
      <div className="min-w-[210px] flex-[1_1_260px]">
        <label htmlFor="route-history-search" className="sr-only">
          Search History records
        </label>
        <input
          id="route-history-search"
          type="search"
          placeholder="Search documented records…"
          value={historyQuery ?? ""}
          onChange={(event) => setHistoryQuery(event.currentTarget.value)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-[12px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="min-w-[148px] max-sm:flex-1">
        <label htmlFor="route-history-kind" className="sr-only">
          Filter History by record type
        </label>
        <select
          id="route-history-kind"
          value={historyKind ?? "all"}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setHistoryKind(value === "all" ? undefined : (value as HistoryLedgerKind));
          }}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-[12px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="all">Type: All records</option>
          <option value="event">Type: Events</option>
          <option value="treatment">Type: Treatments</option>
          <option value="project">Type: Projects</option>
          <option value="source_gap">Type: Source gaps</option>
        </select>
      </div>
    </div>
  );
}

function HistoryEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4 text-[12.5px] text-[var(--bp-color-ink-55)]">
      {children}
    </div>
  );
}

function HistoryLedgerRowView({
  row,
  evidence,
}: {
  row: HistoryLedgerRow;
  evidence: StudioRouteEvidenceBundle | null;
}) {
  const entries = [
    ...citationEntries(evidence, row.citationKeys),
    ...row.sourceLabels.map((label) => ({ label })),
  ];
  return (
    <article
      id={treatmentRecordAnchorId(row.recordId)}
      tabIndex={-1}
      className="relative scroll-mt-20 py-3 outline-none shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)]"
    >
      {row.relatedRecordIds
        .filter((recordId) => recordId !== row.recordId)
        .map((recordId) => (
          <span key={recordId} id={treatmentRecordAnchorId(recordId)} className="absolute top-0" />
        ))}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
          {row.kind === "source_gap" ? "Source gap" : row.kind}
        </span>
        <span className="font-mono text-[10px] text-[var(--bp-color-ink-55)]">
          {historyYearLabel(row.dateLabel) === "Undated" ? "Date unavailable" : row.dateLabel}
        </span>
        {row.statusLabel === null ? null : (
          <span className="text-[10px] text-[var(--bp-color-ink-55)]">{row.statusLabel}</span>
        )}
      </div>
      <h4 className="mt-1 text-[13px] font-semibold leading-tight">{row.title}</h4>
      <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">{row.detail}</p>
      {entries.length === 0 ? (
        <small>Source link unavailable</small>
      ) : (
        <div className="mt-1">
          <SourceNote entries={entries} />
        </div>
      )}
    </article>
  );
}

export function historyTargetScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? "auto" : "smooth";
}

function useHistoryTarget(
  targetAnchor: string | undefined,
  sectionRef: { readonly current: HTMLDivElement | null },
) {
  useEffect(() => {
    if (targetAnchor === undefined || typeof document === "undefined") return;
    const target = document.getElementById(targetAnchor) ?? sectionRef.current;
    if (target === null) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.focus({ preventScroll: true });
    target.scrollIntoView({
      block: target === sectionRef.current ? "start" : "center",
      behavior: historyTargetScrollBehavior(prefersReducedMotion),
    });
  }, [sectionRef, targetAnchor]);
}
