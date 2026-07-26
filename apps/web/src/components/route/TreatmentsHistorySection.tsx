import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { RouteChangeChronology } from "@/components/route/RouteChangeChronology";
import { ChangeStudyCard, signedMph } from "@/components/route/RouteHistoryOutcomes";
import {
  type ChangeEvidence,
  confoundedSentence,
  noProductSentence,
  type RouteChange,
  routeChangeChronology,
  type StandingChip,
  tooEarlySentence,
} from "@/components/route/route-change-chronology";
import { dossierSpeedPoints } from "@/components/route/route-derived";
import {
  filterRouteHistoryLedger,
  groupRouteHistoryLedger,
  HISTORY_CONTROL_THRESHOLD,
  HISTORY_PAGE_SIZE,
  type HistoryLedgerRow,
} from "@/components/route/route-history-ledger";
import { treatmentRecordAnchorId } from "@/components/route/route-intervention-model";
import { citationByKey } from "@/components/route/WikiEvidence";
import { citationEntries, citationHref, SourceNote } from "@/components/SourceNote";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type {
  RouteStudiesArtifact,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteInterventionInventoryBundle,
} from "@/studio/api-contract";

export { interventionComparisonCards } from "@/components/route/RouteHistoryOutcomes";

/** Status label the ledger mints for gap rows; the tab does not speak that way. */
const LEDGER_SOURCE_GAP_STATUS = "Source gap";

/**
 * The route History tab: Standing, the chronology, and one entry per change.
 *
 * Current state is a condition and belongs to the metric tabs and the map, so
 * it is not repeated here. What this tab owns is order, duration and overlap.
 */
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
  const speedPoints = dossierSpeedPoints(data.dossier);
  const chronology = routeChangeChronology({
    route,
    evidence,
    inventory,
    studies,
    trendMonths: speedPoints.flatMap((point) => (point.value === null ? [] : [point.month])),
  });
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const targetAnchor =
    studyKey !== undefined
      ? treatmentRecordAnchorId(`study:${studyKey}`)
      : recordKey === undefined
        ? undefined
        : treatmentRecordAnchorId(recordKey);
  useHistoryTarget(targetAnchor, sectionRef);

  return (
    <div
      ref={sectionRef}
      tabIndex={-1}
      className="flex flex-col gap-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)]"
    >
      <StandingCard
        sentence={chronology.standing.sentence}
        chips={chronology.standing.chips}
        routeSlug={route.slug}
      />

      <RouteChangeChronology
        chronology={chronology}
        routeLabel={route.label}
        speedPoints={speedPoints}
      >
        <CollapsedMilestones
          collapsed={chronology.collapsed}
          evidence={evidence}
          recordKey={recordKey}
        />
        {chronology.changes.map((change) => (
          <ChangeEntry
            key={change.key}
            change={change}
            evidence={evidence}
            studyKey={studyKey}
            recordKey={recordKey}
          />
        ))}
        <UndatedChanges changes={chronology.undatedChanges} />
      </RouteChangeChronology>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Part 1 — Standing
// ---------------------------------------------------------------------------

function StandingCard({
  sentence,
  chips,
  routeSlug,
}: {
  sentence: string;
  chips: readonly StandingChip[];
  routeSlug: string;
}) {
  return (
    <section className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="px-[17px] pt-4 pb-[17px]">
        <p className="m-0 max-w-[74ch] text-[15px] leading-[1.6]">{sentence}</p>
        <div className="mt-3 flex flex-wrap gap-[7px]">
          {chips.map((chip) => (
            <a
              key={chip.label}
              href={`#${chip.anchorId}`}
              className="inline-flex h-[27px] items-center gap-[7px] rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)] px-2.5 text-[12px] text-[var(--bp-color-ink)] no-underline"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-[1px]"
                style={{ background: chip.color }}
              />
              {chip.label}
              {chip.year === "" ? null : (
                <span className="text-[var(--bp-color-ink-55)]">{chip.year}</span>
              )}
            </a>
          ))}
          <Link
            to="/routes/$routeId"
            params={{ routeId: routeSlug }}
            search={{ tab: "segments" as const }}
            className="inline-flex h-[27px] items-center rounded-[3px] border border-[var(--bp-color-accent)] px-2.5 text-[12px] text-[var(--bp-color-accent)] no-underline"
          >
            See where these run on the map
          </Link>
          <Link
            to="/interventions"
            search={{ route: routeSlug }}
            className="inline-flex h-[27px] items-center rounded-[3px] border border-[var(--bp-color-accent)] px-2.5 text-[12px] text-[var(--bp-color-accent)] no-underline"
          >
            Browse this exact route in all interventions →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Part 2 — everything that is not a change
// ---------------------------------------------------------------------------

function CollapsedMilestones({
  collapsed,
  evidence,
  recordKey,
}: {
  collapsed: { recordCount: number; projectCount: number; rows: readonly HistoryLedgerRow[] };
  evidence: StudioRouteEvidenceBundle | null;
  recordKey?: string | undefined;
}) {
  const targeted =
    recordKey !== undefined &&
    collapsed.rows.some(
      (row) => row.recordId === recordKey || row.relatedRecordIds.includes(recordKey),
    );
  const [open, setOpen] = useState(targeted);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(HISTORY_PAGE_SIZE);
  useEffect(() => setLimit(HISTORY_PAGE_SIZE), [query]);

  if (collapsed.recordCount === 0) return null;

  const filtered = filterRouteHistoryLedger(collapsed.rows, { query });
  const targetIndex =
    recordKey === undefined
      ? -1
      : filtered.findIndex(
          (row) => row.recordId === recordKey || row.relatedRecordIds.includes(recordKey),
        );
  const visible = filtered.slice(0, Math.max(limit, targetIndex + 1));
  const remaining = filtered.length - visible.length;
  const searchVisible = collapsed.rows.length > HISTORY_CONTROL_THRESHOLD;

  return (
    <div className="px-[17px] pb-3.5">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center gap-3 rounded-[3px] bg-[var(--bp-color-paper-deep)] px-[11px] py-[9px] text-[12px] text-[var(--bp-color-ink-55)]">
          <span className="font-semibold text-[var(--bp-color-ink-70)]">
            {`${collapsed.recordCount} further ${collapsed.recordCount === 1 ? "record" : "records"}`}
          </span>
          <span>{milestoneSummary(collapsed.projectCount)}</span>
          <CollapsibleTrigger className="ml-auto cursor-pointer text-[11.5px] font-semibold text-[var(--bp-color-accent)]">
            {open ? "Hide project activity" : "Show project activity"}
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          {searchVisible ? (
            <div className="mt-3">
              <label htmlFor="route-history-search" className="sr-only">
                Search project activity
              </label>
              <input
                id="route-history-search"
                type="search"
                placeholder="Search project activity…"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                className="h-8 w-full max-w-[320px] rounded-lg border border-input bg-transparent px-2.5 text-[12px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          ) : null}
          {filtered.length === 0 ? (
            <p className="mt-3 rounded-[3px] bg-[var(--bp-color-paper-deep)] p-3 text-[12.5px] text-[var(--bp-color-ink-55)]">
              Nothing here matches that search.
            </p>
          ) : (
            <>
              <p role="status" className="sr-only">
                {`${filtered.length} matching ${filtered.length === 1 ? "entry" : "entries"}.`}
              </p>
              <div className="mt-3">
                {groupRouteHistoryLedger(visible).map((group) => (
                  <div
                    key={group.year}
                    className="grid grid-cols-[72px_minmax(0,1fr)] border-t-2 border-[var(--bp-color-ink)] max-sm:grid-cols-[56px_minmax(0,1fr)]"
                  >
                    <div className="px-0 py-2.5 font-mono text-[12px] font-semibold tabular-nums">
                      {group.year}
                    </div>
                    <div className="min-w-0 border-l border-[var(--bp-color-rule)] pl-3">
                      {group.rows.map((row) => (
                        <MilestoneRow key={row.key} row={row} evidence={evidence} />
                      ))}
                    </div>
                  </div>
                ))}
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
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function milestoneSummary(projectCount: number): string {
  const across =
    projectCount === 0
      ? ""
      : ` across ${projectCount} ${projectCount === 1 ? "project" : "projects"}`;
  return `community board meetings, contract awards and construction phases${across}`;
}

function MilestoneRow({
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
  const status = row.statusLabel === LEDGER_SOURCE_GAP_STATUS ? null : row.statusLabel;
  return (
    <article
      id={treatmentRecordAnchorId(row.recordId)}
      tabIndex={-1}
      className="relative scroll-mt-20 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] outline-none last:shadow-none focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)]"
    >
      {row.relatedRecordIds
        .filter((recordId) => recordId !== row.recordId)
        .map((recordId) => (
          <span key={recordId} id={treatmentRecordAnchorId(recordId)} className="absolute top-0" />
        ))}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-[10px] text-[var(--bp-color-ink-55)]">
          {row.date.precision === "unknown" ? "Date not stated" : row.date.display}
        </span>
        {status === null ? null : (
          <span className="text-[10px] text-[var(--bp-color-ink-55)]">{status}</span>
        )}
      </div>
      <h4 className="mt-1 text-[13px] font-semibold leading-tight">{row.title}</h4>
      <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">{row.detail}</p>
      {entries.length === 0 ? null : (
        <div className="mt-1">
          <SourceNote entries={entries} />
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Part 3 — the changes
// ---------------------------------------------------------------------------

function ChangeEntry({
  change,
  evidence,
  studyKey,
  recordKey,
}: {
  change: RouteChange;
  evidence: StudioRouteEvidenceBundle | null;
  studyKey?: string | undefined;
  recordKey?: string | undefined;
}) {
  const study = change.evidence.kind === "study" ? change.evidence.study : null;
  const highlighted =
    (study !== null && study.eventKey === studyKey) ||
    (recordKey !== undefined &&
      (change.recordId === recordKey || change.relatedRecordIds.includes(recordKey)));

  return (
    <article
      id={change.anchorId}
      tabIndex={-1}
      className={`relative grid scroll-mt-20 grid-cols-[104px_minmax(0,1fr)] gap-4 border-t border-[var(--bp-color-rule)] px-[17px] pt-4 pb-[17px] outline-none max-md:grid-cols-1 max-md:gap-2 focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)] ${
        highlighted ? "bg-[var(--bp-color-accent-bg)]" : ""
      }`}
    >
      {change.relatedRecordIds
        .filter((recordId) => recordId !== change.recordId)
        .map((recordId) => (
          <span key={recordId} id={treatmentRecordAnchorId(recordId)} className="absolute top-0" />
        ))}
      {study === null ? null : (
        <span
          id={treatmentRecordAnchorId(`study:${study.eventKey}`)}
          tabIndex={-1}
          className="absolute top-0 outline-none"
        />
      )}
      <div className="text-[12.5px] tabular-nums text-[var(--bp-color-ink-55)]">
        <b className="block text-[14.5px] font-semibold text-[var(--bp-color-ink)]">
          {change.date.display}
        </b>
      </div>
      <div className="min-w-0">
        <h3 className="text-[15.5px] font-semibold tracking-[-0.01em]">{change.title}</h3>
        {change.summary === "" ? null : (
          <p className="mt-1.5 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
            {change.summary}
          </p>
        )}
        <EvidenceSlot change={change} studyKey={studyKey} />
        <SourceLine change={change} evidence={evidence} />
      </div>
    </article>
  );
}

function EvidenceSlot({
  change,
  studyKey,
}: {
  change: RouteChange;
  studyKey?: string | undefined;
}) {
  const state = change.evidence;
  return (
    <div className="mt-3.5 border-t border-[var(--bp-color-rule)] pt-3">
      {state.kind === "study" ? (
        <div className="flex flex-col gap-2">
          <ChangeStudyCard
            title={change.title}
            study={state.study}
            highlighted={state.study.eventKey === studyKey}
          />
          <p className="m-0 text-[12px] leading-[1.5] text-[var(--bp-color-ink-55)]">
            {studyTierSentence(state.tier)}
          </p>
        </div>
      ) : state.kind === "peer_adjusted" ? (
        <Verdict
          headline={signedMph(state.cohort.adjustedSpeedDeltaMph)}
          headlineClassName="text-[21px] text-[var(--bp-color-ink-70)]"
          body="Compared with similar routes. Not a controlled result."
        />
      ) : state.kind === "confounded" ? (
        <Verdict
          headline="Cannot be separated"
          body={confoundedSentence(state.overlappingTitles)}
        />
      ) : state.kind === "too_early" ? (
        <Verdict headline="Too early to say" body={tooEarlySentence(state.monthsSince)} />
      ) : (
        <Verdict
          headline="Nothing to measure it with"
          body={noProductSentence(state.reason, speedRecordStartYear(change))}
          inline
        />
      )}
    </div>
  );
}

function Verdict({
  headline,
  body,
  headlineClassName = "text-[17px] text-[var(--bp-color-ink-55)]",
  inline = false,
}: {
  headline: string;
  body: string;
  headlineClassName?: string;
  inline?: boolean;
}) {
  return (
    <div
      className={
        inline ? "flex flex-wrap items-baseline gap-x-[22px] gap-y-1.5" : "flex flex-col gap-1.5"
      }
    >
      <h4
        className={`m-0 font-semibold leading-[1.1] tracking-[-0.02em] ${inline ? "text-[16px] text-[var(--bp-color-ink-55)]" : headlineClassName}`}
      >
        {headline}
      </h4>
      <p className="m-0 max-w-[58ch] text-[12px] leading-[1.5] text-[var(--bp-color-ink-55)]">
        {body}
      </p>
    </div>
  );
}

function studyTierSentence(tier: Extract<ChangeEvidence, { kind: "study" }>["tier"]): string {
  return tier === "matched"
    ? "Compared with matched control segments."
    : "Before and after this change, without a control comparison.";
}

/**
 * The `no_speed_record` sentence needs the year the record opens. It is only
 * read when that reason was already selected, so an absent record cannot make
 * this fabricate a year.
 */
function speedRecordStartYear(change: RouteChange): string {
  return change.date.precision === "unknown" ? "" : change.date.end.slice(0, 4);
}

function SourceLine({
  change,
  evidence,
}: {
  change: RouteChange;
  evidence: StudioRouteEvidenceBundle | null;
}) {
  const citations = citationByKey(evidence);
  const cited = change.citationKeys.flatMap((key) => {
    const citation = citations.get(key);
    return citation === undefined ? [] : [{ key, citation }];
  });
  const labels: { key: string; node: ReactNode }[] =
    cited.length > 0
      ? cited.map(({ key, citation }) => ({
          key,
          node: (
            <a
              href={citationHref(citation)}
              target="_blank"
              rel="noreferrer"
              className="border-b border-[var(--bp-color-ink-20)] text-[var(--bp-color-accent)] no-underline"
            >
              {citationSentenceLabel(citation)}
            </a>
          ),
        }))
      : change.sourceLabels.map((label) => ({ key: label, node: label }));
  if (labels.length === 0 && change.agencyClaims.length === 0) return null;

  return (
    <p className="mt-3 max-w-[80ch] text-[12px] leading-[1.65] text-[var(--bp-color-ink-55)]">
      {labels.length === 0 ? null : <>Recorded in {joinNodes(labels)}. </>}
      {change.agencyClaims.map((claim) => (
        <span key={`${claim.metricName}:${claim.rawValue}`}>
          {agencyClaimSentence(
            claim.metricName,
            claim.rawValue,
            claim.period,
            claimAttribution(claim.citationKeys, citations),
          )}{" "}
        </span>
      ))}
    </p>
  );
}

function citationSentenceLabel(citation: {
  sourceTitle?: string | undefined;
  sourceId: string;
  publishedDate?: string | undefined;
  pageNumber?: number | undefined;
}): string {
  const title = citation.sourceTitle ?? citation.sourceId;
  const page = citation.pageNumber === undefined ? "" : `, page ${citation.pageNumber}`;
  const when = citation.publishedDate === undefined ? "" : ` (${citation.publishedDate})`;
  return `${title}${when}${page}`;
}

function claimAttribution(
  citationKeys: readonly string[],
  citations: ReadonlyMap<
    string,
    { publisher?: string | undefined; sourceTitle?: string | undefined }
  >,
): string {
  for (const key of citationKeys) {
    const citation = citations.get(key);
    const attribution = citation?.publisher ?? citation?.sourceTitle;
    if (attribution !== undefined) return attribution;
  }
  return "The source";
}

/** Agency figures are quoted, attributed and never converted or compared. */
function agencyClaimSentence(
  metricName: string,
  rawValue: string,
  period: string | null,
  attribution: string,
): string {
  const window = period === null ? "" : ` over ${period}`;
  return `${attribution} reported ${metricName.replaceAll("_", " ")} of ${rawValue}${window}.`;
}

/** Comma list with a final "and", keyed on each item's own identity. */
function joinNodes(items: readonly { key: string; node: ReactNode }[]): ReactNode {
  return items.map((item, index) => (
    <span key={item.key}>
      {index === 0 ? null : index === items.length - 1 ? " and " : ", "}
      {item.node}
    </span>
  ));
}

function UndatedChanges({ changes }: { changes: readonly RouteChange[] }) {
  if (changes.length === 0) {
    return (
      <p className="border-t border-[var(--bp-color-rule)] px-[17px] py-3.5 text-[12.5px] text-[var(--bp-color-ink-55)]">
        No further changes are recorded without a date.
      </p>
    );
  }
  return (
    <div className="border-t border-[var(--bp-color-rule)] px-[17px] py-3.5 text-[12.5px] text-[var(--bp-color-ink-55)]">
      <p className="m-0 font-semibold text-[var(--bp-color-ink-70)]">
        {`${changes.length} further ${changes.length === 1 ? "change is" : "changes are"} recorded without a date.`}
      </p>
      <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
        {changes.map((change) => (
          <li
            key={change.key}
            id={change.anchorId}
            tabIndex={-1}
            className="scroll-mt-20 outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-color-accent)]"
          >
            <span className="text-[var(--bp-color-ink)]">{change.title}</span>
          </li>
        ))}
      </ul>
    </div>
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
