/**
 * The route change chronology: order, duration and overlap.
 *
 * A route History tab only earns its place by showing what no metric tab can —
 * that changes have an order, a duration, and that some of them landed on top
 * of each other and can no longer be told apart. This module is the pure model
 * behind that claim. It never renders, never fetches, and never looks at the
 * magnitude, sign or significance of an estimate when deciding what evidence a
 * change carries.
 *
 * `buildRouteHistoryLedger` stays the single merger of every documented record.
 * This module only *partitions* that merged set into changes (things with a
 * treatment identity) and milestones (community boards, contract awards,
 * construction phases), then reads each change's date once through
 * `@/studio/change-date`.
 */

import {
  buildRouteHistoryLedger,
  type HistoryLedgerRow,
} from "@/components/route/route-history-ledger";
import {
  interventionLabelForKind,
  routeInterventionViewModel,
  treatmentRecordAnchorId,
} from "@/components/route/route-intervention-model";
import { studiesByEventId } from "@/components/study/study-display";
import type {
  RouteStudiesArtifact,
  StudioIntervention,
  StudioInterventionLifecycleState,
  StudioInterventionTreatmentKind,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteInterventionInventoryBundle,
  StudyArtifact,
} from "@/studio/api-contract";
import {
  type ChangeDate,
  changeDatesOverlap,
  compareChangeDatesNewestFirst,
} from "@/studio/change-date";

/** The peer-adjusted cohort a serving intervention may carry. */
type ComparisonCohort = NonNullable<StudioIntervention["comparisonCohort"]>;

/** Why we hold no measurement for a change. Every reason has display copy. */
export type NoProductReason =
  | "intersection_grain"
  | "stop_grain"
  | "no_speed_record"
  | "route_scope_mismatch"
  | "not_yet_specified";

export type AgencyClaim = {
  metricName: string;
  rawValue: string;
  period: string | null;
  citationKeys: readonly string[];
};

/**
 * Exactly one evidence state per change, chosen value-blind in a fixed order:
 * `study` > `peer_adjusted` > `confounded` > `too_early` > `no_product`.
 */
export type ChangeEvidence =
  | { kind: "study"; tier: "matched" | "descriptive"; study: StudyArtifact }
  | { kind: "peer_adjusted"; cohort: ComparisonCohort }
  | { kind: "confounded"; overlappingTitles: readonly string[] }
  | { kind: "no_product"; reason: NoProductReason }
  | { kind: "too_early"; monthsSince: number };

export type RouteChange = {
  key: string;
  /** Reuses the ledger anchor mint, so `?record=` deep links keep resolving. */
  anchorId: string;
  recordId: string;
  relatedRecordIds: readonly string[];
  date: ChangeDate;
  title: string;
  summary: string;
  treatmentLabels: readonly string[];
  citationKeys: readonly string[];
  sourceLabels: readonly string[];
  agencyClaims: readonly AgencyClaim[];
  evidence: ChangeEvidence;
};

export type ChronologyBand = {
  changeKey: string;
  /** Packing row, 0-based; bands share a row only when they cannot touch. */
  row: number;
  /** Fraction of the axis domain, 0 at the domain start and 1 at its end. */
  start: number;
  end: number;
  /** A day or month reads as a moment; anything coarser reads as a span. */
  shape: "point" | "bar";
  label: string;
  color: string;
};

export type ChronologyOverlap = {
  /** Inclusive ISO day the shared span opens on. */
  start: string;
  /** Inclusive ISO day the shared span closes on. */
  end: string;
  changeKeys: readonly string[];
};

export type ChronologyAxis = {
  startYear: number;
  endYear: number;
  ticks: readonly string[];
};

export type StandingChip = { label: string; year: string; anchorId: string; color: string };

export type RouteChangeChronology = {
  standing: { sentence: string; chips: readonly StandingChip[] };
  changes: readonly RouteChange[];
  undatedChanges: readonly RouteChange[];
  bands: readonly ChronologyBand[];
  /** Dated changes past the band-row cap. They still get a full entry below. */
  hiddenBandCount: number;
  overlaps: readonly ChronologyOverlap[];
  axis: ChronologyAxis;
  collapsed: { recordCount: number; projectCount: number; rows: readonly HistoryLedgerRow[] };
};

/** Months of speed record after a change below which no before/after is honest. */
const TOO_EARLY_MONTHS = 6;
const STANDING_LABEL_CAP = 4;
/** Overlapping changes named in the `confounded` sentence before "and n more". */
const CONFOUNDED_TITLE_CAP = 3;
/**
 * Band rows drawn before the chronology defers to the entries below. Source
 * records outnumber real changes on redesign routes, where one implementation
 * date can carry sixty records; a wall of bands stops being a timeline.
 */
const MAX_BAND_ROWS = 8;
/** The ledger's generic fallback when a typed occurrence names nothing. */
const LEDGER_OCCURRENCE_FALLBACK_TITLE = "Treatment occurrence";
const LEDGER_DETAIL_FALLBACK = "No structured description provided.";

/**
 * What a route-wide monthly speed average can and cannot see, by treatment
 * kind. Exhaustive over the typed kind union on purpose: a new kind must be
 * given a verdict here before it can render an evidence state.
 */
const KIND_MEASURABILITY = {
  bus_lane: "measurable",
  busway: "measurable",
  red_paint: "measurable",
  route_redesign: "measurable",
  frequency_change: "measurable",
  select_bus_service: "measurable",
  automated_bus_lane_enforcement: "measurable",
  all_door_boarding: "measurable",
  off_board_fare_collection: "measurable",
  transit_signal_priority: "intersection_grain",
  signal_retiming: "intersection_grain",
  queue_jump: "intersection_grain",
  turn_restriction: "intersection_grain",
  left_turn_bay: "intersection_grain",
  high_visibility_crosswalk: "intersection_grain",
  pedestrian_island: "intersection_grain",
  pedestrian_improvement: "intersection_grain",
  curb_extension: "intersection_grain",
  neckdown: "intersection_grain",
  stop_consolidation: "stop_grain",
  stop_relocation: "stop_grain",
  stop_change: "stop_grain",
  bus_stop_adjustment: "stop_grain",
  bus_bulb: "stop_grain",
  bus_shelter: "stop_grain",
  bench: "stop_grain",
  fare_machine_installation: "stop_grain",
  real_time_passenger_information: "stop_grain",
  wayfinding_sign: "stop_grain",
  capital_project_milestone: "not_yet_specified",
  resurfacing: "not_yet_specified",
  planting: "not_yet_specified",
  curb_regulation: "not_yet_specified",
  truck_loading_zone: "not_yet_specified",
  other_documented: "not_yet_specified",
} as const satisfies Record<
  StudioInterventionTreatmentKind,
  "measurable" | Exclude<NoProductReason, "no_speed_record" | "route_scope_mismatch">
>;

/**
 * Serving intervention types are a separate, narrower vocabulary than the typed
 * treatment kinds. Only the two the exporter actually mints are mapped.
 */
const SERVING_TYPE_TO_KIND: Record<string, StudioInterventionTreatmentKind> = {
  automated_bus_lane_enforcement: "automated_bus_lane_enforcement",
  bus_lane_infrastructure: "bus_lane",
};

/** Wiki timeline records only count as changes when they mark a real onset. */
const CHANGE_EVENT_FAMILIES = new Set(["implementation", "launch"]);

/** Band colours, assigned in first-appearance order so a route reads stably. */
const BAND_COLORS = [
  "var(--bp-route-si)",
  "var(--bp-color-accent)",
  "var(--bp-route-queens)",
  "var(--bp-route-express)",
  "var(--bp-route-bronx)",
  "var(--bp-route-brooklyn)",
] as const;

type ChangeSeed = {
  row: HistoryLedgerRow;
  date: ChangeDate;
  treatmentKinds: readonly StudioInterventionTreatmentKind[];
  treatmentLabels: readonly string[];
  lifecycleStates: readonly StudioInterventionLifecycleState[];
  /** True when a typed treatment states a scope narrower than the route. */
  belowRouteScope: boolean;
  study: StudyArtifact | undefined;
  cohort: ComparisonCohort | undefined;
};

export function routeChangeChronology(input: {
  route: StudioRouteDetailResponse["route"];
  evidence: StudioRouteEvidenceBundle | null;
  inventory: StudioRouteInterventionInventoryBundle | null;
  studies: RouteStudiesArtifact | null;
  trendMonths: readonly string[];
}): RouteChangeChronology {
  const { route, evidence, inventory, trendMonths } = input;
  const model = routeInterventionViewModel(inventory);
  const rows = buildRouteHistoryLedger({ interventions: route.interventions, evidence, model });

  const facts = collectRecordFacts(input, model);
  const seeds: ChangeSeed[] = [];
  const collapsedRows: HistoryLedgerRow[] = [];
  for (const row of rows) {
    const identity = recordIdentity(row, facts);
    if (identity === null) collapsedRows.push(row);
    else seeds.push(identity);
  }

  const dated = seeds
    .filter((seed) => seed.date.precision !== "unknown")
    .sort((left, right) => compareSeeds(left, right));
  const undated = seeds
    .filter((seed) => seed.date.precision === "unknown")
    .sort(
      (left, right) => left.row.title.localeCompare(right.row.title) || compareKeys(left, right),
    );

  const clusters = overlapClusters(dated);
  const trend = trendWindow(trendMonths);
  const claims = agencyClaimsByCitation(evidence);

  const changes = dated.map((seed) =>
    toChange(seed, {
      evidenceState: selectEvidence(seed, clusters.get(seed.row.key) ?? [], trend),
      claims,
    }),
  );
  const undatedChanges = undated.map((seed) =>
    toChange(seed, { evidenceState: selectEvidence(seed, [], trend), claims }),
  );

  const axis = chronologyAxis(dated, trendMonths);
  const colors = chronologyColors(seeds);
  const bands = packBands(dated, axis, colors);
  const overlaps = overlapRegions(dated);

  return {
    standing: standing(route.label, seeds, model.coverage.status, colors),
    changes,
    undatedChanges,
    bands,
    hiddenBandCount: dated.length - bands.length,
    overlaps,
    axis,
    collapsed: {
      recordCount: collapsedRows.length,
      projectCount: collapsedRows.filter((row) => row.kind === "project").length,
      rows: collapsedRows,
    },
  };
}

// ---------------------------------------------------------------------------
// Record identity: which merged rows are changes
// ---------------------------------------------------------------------------

type RecordFacts = {
  /** Record ids whose source carries a treatment identity. */
  changeIds: ReadonlySet<string>;
  kindsById: ReadonlyMap<string, readonly StudioInterventionTreatmentKind[]>;
  labelsById: ReadonlyMap<string, readonly string[]>;
  lifecyclesById: ReadonlyMap<string, readonly StudioInterventionLifecycleState[]>;
  belowRouteScopeIds: ReadonlySet<string>;
  studyById: ReadonlyMap<string, StudyArtifact>;
  cohortById: ReadonlyMap<string, ComparisonCohort>;
};

function collectRecordFacts(
  input: {
    route: StudioRouteDetailResponse["route"];
    evidence: StudioRouteEvidenceBundle | null;
    studies: RouteStudiesArtifact | null;
  },
  model: ReturnType<typeof routeInterventionViewModel>,
): RecordFacts {
  const changeIds = new Set<string>();
  const kindsById = new Map<string, StudioInterventionTreatmentKind[]>();
  const labelsById = new Map<string, string[]>();
  const lifecyclesById = new Map<string, StudioInterventionLifecycleState[]>();
  const belowRouteScopeIds = new Set<string>();
  const studyById = new Map<string, StudyArtifact>();
  const cohortById = new Map<string, ComparisonCohort>();

  const addKind = (id: string, kind: StudioInterventionTreatmentKind, label: string) => {
    pushUnique(kindsById, id, kind);
    pushUnique(labelsById, id, label);
  };

  for (const treatmentRow of model.treatments) {
    const { treatment } = treatmentRow;
    for (const id of [treatment.treatmentId, treatment.sourceRecordId]) {
      changeIds.add(id);
      addKind(id, treatment.treatmentKind, treatmentRow.presentation.label);
      pushUnique(lifecyclesById, id, treatment.lifecycleState);
      if (treatment.geographyScope !== "route") belowRouteScopeIds.add(id);
    }
  }
  for (const timelineRow of model.timeline) {
    const { occurrence } = timelineRow;
    const ids = [
      occurrence.occurrenceId,
      occurrence.sourceOccurrenceId,
      occurrence.wikiOccurrenceId,
      occurrence.registryLineage?.eventId,
    ].filter((id): id is string => typeof id === "string" && id.length > 0);
    for (const id of ids) {
      changeIds.add(id);
      pushUnique(lifecyclesById, id, occurrence.lifecycleState);
      if (occurrence.geographyScope !== "route") belowRouteScopeIds.add(id);
      for (const treatmentRow of timelineRow.treatmentRows) {
        addKind(id, treatmentRow.treatment.treatmentKind, treatmentRow.presentation.label);
      }
    }
  }

  // Studies are admitted only from this route's published rollup, joined on the
  // registry event id the study's provenance names. B44 never reaches B44+.
  const studies =
    input.studies === null || input.studies.routeId !== input.route.routeId ? null : input.studies;
  const studyByEventId = studiesByEventId(studies);

  for (const [index, intervention] of input.route.interventions.entries()) {
    const recordId = intervention.eventId ?? `serving:${intervention.year}:${index}`;
    changeIds.add(recordId);
    const kind =
      intervention.interventionType === undefined
        ? undefined
        : SERVING_TYPE_TO_KIND[intervention.interventionType];
    if (kind !== undefined) addKind(recordId, kind, interventionLabelForKind(kind));
    if (intervention.comparisonCohort !== undefined) {
      cohortById.set(recordId, intervention.comparisonCohort);
    }
    if (intervention.eventId !== undefined) {
      const study = studyByEventId.get(intervention.eventId);
      if (study !== undefined && study.routeId === input.route.routeId) {
        studyById.set(recordId, study);
      }
    }
  }

  for (const event of input.evidence?.timeline ?? []) {
    if (event.eventFamily !== null && CHANGE_EVENT_FAMILIES.has(event.eventFamily)) {
      changeIds.add(event.recordId);
    }
  }
  for (const treatment of input.evidence?.interventions ?? []) {
    changeIds.add(treatment.recordId);
    const kind = treatment.treatmentKind;
    if (kind !== null && kind in KIND_MEASURABILITY) {
      const typed = kind as StudioInterventionTreatmentKind;
      addKind(treatment.recordId, typed, interventionLabelForKind(typed));
    }
  }

  return {
    changeIds,
    kindsById,
    labelsById,
    lifecyclesById,
    belowRouteScopeIds,
    studyById,
    cohortById,
  };
}

function recordIdentity(row: HistoryLedgerRow, facts: RecordFacts): ChangeSeed | null {
  const ids = [row.recordId, ...row.relatedRecordIds];
  // A merged row inherits the treatment identity of any record folded into it.
  const isChange = row.kind === "treatment" || ids.some((id) => facts.changeIds.has(id));
  if (!isChange || row.kind === "project" || row.kind === "source_gap") return null;

  const treatmentKinds = uniqueFrom(ids, facts.kindsById);
  const treatmentLabels = uniqueFrom(ids, facts.labelsById);
  const lifecycleStates = uniqueFrom(ids, facts.lifecyclesById);
  const study = ids.map((id) => facts.studyById.get(id)).find((value) => value !== undefined);
  const cohort = ids.map((id) => facts.cohortById.get(id)).find((value) => value !== undefined);

  return {
    row,
    date: row.date,
    treatmentKinds,
    treatmentLabels,
    lifecycleStates,
    belowRouteScope: ids.some((id) => facts.belowRouteScopeIds.has(id)),
    study,
    cohort,
  };
}

// ---------------------------------------------------------------------------
// Overlap
// ---------------------------------------------------------------------------

/** Maximal clusters of changes that cannot be told apart, keyed by change key. */
function overlapClusters(dated: readonly ChangeSeed[]): ReadonlyMap<string, readonly ChangeSeed[]> {
  const parent = new Map<string, string>();
  for (const seed of dated) parent.set(seed.row.key, seed.row.key);
  const find = (key: string): string => {
    let current = key;
    while (parent.get(current) !== current) {
      const next = parent.get(current);
      if (next === undefined) break;
      parent.set(current, parent.get(next) ?? next);
      current = next;
    }
    return current;
  };
  for (const [index, left] of dated.entries()) {
    for (const right of dated.slice(index + 1)) {
      if (!changeDatesOverlap(left.date, right.date)) continue;
      const a = find(left.row.key);
      const b = find(right.row.key);
      if (a !== b) parent.set(a, b);
    }
  }
  const groups = new Map<string, ChangeSeed[]>();
  for (const seed of dated) {
    const root = find(seed.row.key);
    const group = groups.get(root) ?? [];
    group.push(seed);
    groups.set(root, group);
  }
  const byKey = new Map<string, readonly ChangeSeed[]>();
  for (const group of groups.values()) {
    for (const seed of group) byKey.set(seed.row.key, group);
  }
  return byKey;
}

/** Spans where two or more bands are simultaneously live, merged and ordered. */
function overlapRegions(dated: readonly ChangeSeed[]): ChronologyOverlap[] {
  const spans: { start: string; end: string; changeKeys: Set<string> }[] = [];
  for (const [index, left] of dated.entries()) {
    for (const right of dated.slice(index + 1)) {
      if (!changeDatesOverlap(left.date, right.date)) continue;
      if (left.date.precision === "unknown" || right.date.precision === "unknown") continue;
      spans.push({
        start: maxString(left.date.start, right.date.start),
        end: minString(left.date.end, right.date.end),
        changeKeys: new Set([left.row.key, right.row.key]),
      });
    }
  }
  spans.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const merged: typeof spans = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last !== undefined && span.start <= last.end) {
      last.end = maxString(last.end, span.end);
      for (const key of span.changeKeys) last.changeKeys.add(key);
      continue;
    }
    merged.push({ ...span, changeKeys: new Set(span.changeKeys) });
  }
  return merged.map((span) => ({
    start: span.start,
    end: span.end,
    changeKeys: [...span.changeKeys].sort(),
  }));
}

// ---------------------------------------------------------------------------
// Evidence selection — fixed order, never reads an estimate's value
// ---------------------------------------------------------------------------

type TrendWindow = { firstMonth: string | null; months: readonly string[] };

function trendWindow(trendMonths: readonly string[]): TrendWindow {
  const months = [...trendMonths].sort();
  return { firstMonth: months[0] ?? null, months };
}

function selectEvidence(
  seed: ChangeSeed,
  cluster: readonly ChangeSeed[],
  trend: TrendWindow,
): ChangeEvidence {
  if (seed.study !== undefined) {
    return {
      kind: "study",
      tier: seed.study.claimTier === "gated_estimate" ? "matched" : "descriptive",
      study: seed.study,
    };
  }
  if (seed.cohort !== undefined) return { kind: "peer_adjusted", cohort: seed.cohort };
  if (cluster.length > 1) {
    return {
      kind: "confounded",
      overlappingTitles: cluster
        .filter((other) => other.row.key !== seed.row.key)
        .map((other) => changeTitle(other))
        .sort(),
    };
  }
  const early = tooEarly(seed, trend);
  if (early !== null) return early;
  return { kind: "no_product", reason: noProductReason(seed, trend) };
}

function tooEarly(seed: ChangeSeed, trend: TrendWindow): ChangeEvidence | null {
  if (seed.date.precision === "unknown" || trend.firstMonth === null) return null;
  const endMonth = seed.date.end.slice(0, 7);
  // The record has to reach the change at all before "too early" can be honest.
  if (endMonth < trend.firstMonth) return null;
  const monthsSince = trend.months.filter((month) => month > endMonth).length;
  if (monthsSince >= TOO_EARLY_MONTHS) return null;
  return { kind: "too_early", monthsSince };
}

function noProductReason(seed: ChangeSeed, trend: TrendWindow): NoProductReason {
  if (
    seed.date.precision !== "unknown" &&
    trend.firstMonth !== null &&
    seed.date.end.slice(0, 7) < trend.firstMonth
  ) {
    return "no_speed_record";
  }
  for (const kind of seed.treatmentKinds) {
    const verdict = KIND_MEASURABILITY[kind];
    if (verdict === "intersection_grain" || verdict === "stop_grain") return verdict;
  }
  if (seed.belowRouteScope) return "route_scope_mismatch";
  return "not_yet_specified";
}

// ---------------------------------------------------------------------------
// Agency claims
// ---------------------------------------------------------------------------

/** Agency-stated figures indexed by citation key. Values are never converted. */
function agencyClaimsByCitation(
  evidence: StudioRouteEvidenceBundle | null,
): ReadonlyMap<string, readonly AgencyClaim[]> {
  const byKey = new Map<string, AgencyClaim[]>();
  for (const claim of evidence?.metricClaims ?? []) {
    if (claim.metricName === null || claim.rawValue === null) continue;
    const entry: AgencyClaim = {
      metricName: claim.metricName,
      rawValue: String(claim.rawValue),
      period: claim.period,
      citationKeys: claim.citationKeys,
    };
    for (const key of claim.citationKeys) {
      const list = byKey.get(key) ?? [];
      list.push(entry);
      byKey.set(key, list);
    }
  }
  return byKey;
}

function agencyClaimsFor(
  citationKeys: readonly string[],
  claims: ReadonlyMap<string, readonly AgencyClaim[]>,
): AgencyClaim[] {
  const seen = new Set<string>();
  const matched: AgencyClaim[] = [];
  for (const key of citationKeys) {
    for (const claim of claims.get(key) ?? []) {
      const identity = `${claim.metricName}|${claim.rawValue}|${claim.period ?? ""}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      matched.push(claim);
    }
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Bands and axis
// ---------------------------------------------------------------------------

/** Minimum band footprint so a point marker still reserves packing space. */
const MIN_BAND_FRACTION = 0.03;
/** Bands in one row must not touch. */
const BAND_GUTTER_FRACTION = 0.012;

function chronologyAxis(
  dated: readonly ChangeSeed[],
  trendMonths: readonly string[],
): ChronologyAxis {
  const years: number[] = [];
  for (const seed of dated) {
    if (seed.date.precision === "unknown") continue;
    years.push(Number(seed.date.start.slice(0, 4)), Number(seed.date.end.slice(0, 4)));
  }
  for (const month of trendMonths) years.push(Number(month.slice(0, 4)));
  const finite = years.filter((year) => Number.isFinite(year));
  const startYear = finite.length === 0 ? 0 : Math.min(...finite);
  const rawEndYear = finite.length === 0 ? 0 : Math.max(...finite);
  if (finite.length === 0) return { startYear, endYear: rawEndYear, ticks: [] };
  // Evenly spaced ticks, as the approved comp draws them: six where the span
  // divides cleanly, fewer when that would strand years of empty axis past the
  // last change.
  const span = rawEndYear - startYear;
  let best: { intervals: number; step: number; endYear: number } | null = null;
  for (const intervals of [3, 4, 5]) {
    const step = Math.max(1, Math.ceil(span / intervals));
    const endYear = startYear + step * intervals;
    if (best === null || endYear < best.endYear) best = { intervals, step, endYear };
    else if (endYear === best.endYear && intervals > best.intervals) {
      best = { intervals, step, endYear };
    }
  }
  if (best === null) return { startYear, endYear: rawEndYear, ticks: [] };
  const ticks = Array.from({ length: best.intervals + 1 }, (_, index) =>
    String(startYear + best.step * index),
  );
  return { startYear, endYear: best.endYear, ticks };
}

/** Where an ISO day sits in the axis domain, as a 0..1 fraction. */
export function axisFraction(isoDay: string, axis: ChronologyAxis): number {
  const span = axis.endYear + 1 - axis.startYear;
  if (span <= 0) return 0;
  const year = Number(isoDay.slice(0, 4));
  const month = Number(isoDay.slice(5, 7));
  const day = Number(isoDay.slice(8, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return 0;
  const value = year + (month - 1) / 12 + (day - 1) / 372;
  return clamp((value - axis.startYear) / span, 0, 1);
}

/** Where an ISO month sits in the axis domain, as a 0..1 fraction. */
export function axisMonthFraction(isoMonth: string, axis: ChronologyAxis): number {
  return axisFraction(`${isoMonth}-01`, axis);
}

/**
 * One colour per treatment label, assigned oldest change first, so a chip and
 * the band it jumps to always agree. Changes with no typed treatment label get
 * a colour keyed on their own identity.
 */
function chronologyColors(seeds: readonly ChangeSeed[]): ReadonlyMap<string, string> {
  const colors = new Map<string, string>();
  const assign = (key: string) => {
    if (colors.has(key)) return;
    colors.set(key, BAND_COLORS[colors.size % BAND_COLORS.length] as string);
  };
  const ordered = [...seeds].sort(compareSeedsOldestFirst);
  for (const seed of ordered) for (const label of seed.treatmentLabels) assign(label);
  for (const seed of ordered) if (seed.treatmentLabels.length === 0) assign(seed.row.key);
  return colors;
}

function bandColorKey(seed: ChangeSeed): string {
  return seed.treatmentLabels[0] ?? seed.row.key;
}

function packBands(
  dated: readonly ChangeSeed[],
  axis: ChronologyAxis,
  colors: ReadonlyMap<string, string>,
): ChronologyBand[] {
  const ordered = [...dated].sort(
    (left, right) =>
      startOf(left).localeCompare(startOf(right)) ||
      endOf(left).localeCompare(endOf(right)) ||
      left.row.key.localeCompare(right.row.key),
  );
  const rowEnds: number[] = [];
  const bands: ChronologyBand[] = [];
  for (const seed of ordered) {
    if (seed.date.precision === "unknown") continue;
    const start = axisFraction(seed.date.start, axis);
    const end = axisFraction(seed.date.end, axis);
    const shape =
      seed.date.precision === "day" || seed.date.precision === "month" ? "point" : "bar";
    const packEnd = Math.max(end, start + MIN_BAND_FRACTION);
    let row = rowEnds.findIndex((rowEnd) => start >= rowEnd + BAND_GUTTER_FRACTION);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = packEnd;
    bands.push({
      changeKey: seed.row.key,
      row,
      start,
      end,
      shape,
      label: changeTitle(seed),
      color: colors.get(bandColorKey(seed)) ?? BAND_COLORS[0],
    });
  }
  const drawn = bands.filter((band) => band.row < MAX_BAND_ROWS);
  return drawn.sort(
    (left, right) =>
      left.row - right.row ||
      left.start - right.start ||
      left.changeKey.localeCompare(right.changeKey),
  );
}

// ---------------------------------------------------------------------------
// Standing
// ---------------------------------------------------------------------------

function standing(
  routeLabel: string,
  seeds: readonly ChangeSeed[],
  coverageStatus: "unavailable" | "partial" | "checked_empty" | "available",
  colors: ReadonlyMap<string, string>,
): { sentence: string; chips: readonly StandingChip[] } {
  const chips = standingChips(seeds, colors);
  if (chips.length === 0) {
    return {
      sentence:
        coverageStatus === "checked_empty"
          ? "We checked the sources we hold and found no documented change on this route."
          : "We have no documented change on this route.",
      chips: [],
    };
  }
  const labels = chips.map((chip) => chip.label);
  const list = joinLabels(labels.map(lowercaseKeepingAcronyms));
  const newestYear = chips
    .map((chip) => chip.year)
    .filter((year) => year !== "")
    .sort()
    .at(-1);
  const proposedCount = seeds.filter((seed) => seed.lifecycleStates.includes("proposed")).length;
  const arrival = newestYear === undefined ? "" : ` The most recent arrived in ${newestYear}.`;
  const proposed =
    proposedCount === 0
      ? ""
      : ` ${proposedCount} further ${proposedCount === 1 ? "change is" : "changes are"} proposed.`;
  return { sentence: `The ${routeLabel} has ${list}.${arrival}${proposed}`, chips };
}

function standingChips(
  seeds: readonly ChangeSeed[],
  colors: ReadonlyMap<string, string>,
): StandingChip[] {
  const byLabel = new Map<string, { year: string; anchorId: string; sortKey: string }>();
  for (const seed of [...seeds].sort(compareSeedsOldestFirst)) {
    const year = seed.date.precision === "unknown" ? "" : seed.date.start.slice(0, 4);
    for (const label of seed.treatmentLabels) {
      if (byLabel.has(label)) continue;
      byLabel.set(label, {
        year,
        anchorId: treatmentRecordAnchorId(seed.row.recordId),
        sortKey: year === "" ? "9999" : year,
      });
    }
  }
  return [...byLabel.entries()]
    .sort(
      ([leftLabel, left], [rightLabel, right]) =>
        left.sortKey.localeCompare(right.sortKey) || leftLabel.localeCompare(rightLabel),
    )
    .map(([label, entry]) => ({
      label,
      year: entry.year,
      anchorId: entry.anchorId,
      color: colors.get(label) ?? BAND_COLORS[0],
    }));
}

/** Comma list with a final "and"; never more than four labels. */
function joinLabels(labels: readonly string[]): string {
  const shown =
    labels.length > STANDING_LABEL_CAP
      ? [...labels.slice(0, 3), `${labels.length - 3} more`]
      : [...labels];
  if (shown.length === 1) return shown[0] ?? "";
  const last = shown.at(-1) ?? "";
  return `${shown.slice(0, -1).join(", ")} and ${last}`;
}

/** Lowercase every word except an acronym the source already capitalised. */
function lowercaseKeepingAcronyms(label: string): string {
  return label
    .split(" ")
    .map((word) => (word.length > 1 && word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function toChange(
  seed: ChangeSeed,
  context: {
    evidenceState: ChangeEvidence;
    claims: ReadonlyMap<string, readonly AgencyClaim[]>;
  },
): RouteChange {
  const { row } = seed;
  return {
    key: row.key,
    anchorId: treatmentRecordAnchorId(row.recordId),
    recordId: row.recordId,
    relatedRecordIds: row.relatedRecordIds,
    date: seed.date,
    title: changeTitle(seed),
    summary: row.detail === LEDGER_DETAIL_FALLBACK ? "" : row.detail,
    treatmentLabels: seed.treatmentLabels,
    citationKeys: row.citationKeys,
    sourceLabels: row.sourceLabels,
    agencyClaims: agencyClaimsFor(row.citationKeys, context.claims),
    evidence: context.evidenceState,
  };
}

function changeTitle(seed: ChangeSeed): string {
  if (seed.row.title !== LEDGER_OCCURRENCE_FALLBACK_TITLE) return seed.row.title;
  return seed.treatmentLabels[0] ?? "Documented change";
}

function compareSeeds(left: ChangeSeed, right: ChangeSeed): number {
  return (
    compareChangeDatesNewestFirst(left.date, right.date) ||
    left.row.title.localeCompare(right.row.title) ||
    compareKeys(left, right)
  );
}

function compareSeedsOldestFirst(left: ChangeSeed, right: ChangeSeed): number {
  return -compareSeeds(left, right);
}

function compareKeys(left: ChangeSeed, right: ChangeSeed): number {
  return left.row.key.localeCompare(right.row.key);
}

function startOf(seed: ChangeSeed): string {
  return seed.date.precision === "unknown" ? "" : seed.date.start;
}

function endOf(seed: ChangeSeed): string {
  return seed.date.precision === "unknown" ? "" : seed.date.end;
}

function pushUnique<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key) ?? [];
  if (!list.includes(value)) list.push(value);
  map.set(key, list);
}

function uniqueFrom<V>(ids: readonly string[], map: ReadonlyMap<string, readonly V[]>): V[] {
  const values: V[] = [];
  for (const id of ids) {
    for (const value of map.get(id) ?? []) {
      if (!values.includes(value)) values.push(value);
    }
  }
  return values;
}

function maxString(left: string, right: string): string {
  return left >= right ? left : right;
}

function minString(left: string, right: string): string {
  return left <= right ? left : right;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

// ---------------------------------------------------------------------------
// Display copy
// ---------------------------------------------------------------------------

export function noProductSentence(reason: NoProductReason, speedRecordStartYear: string): string {
  switch (reason) {
    case "intersection_grain":
      return "We hold speeds by road segment and by route, not by intersection.";
    case "stop_grain":
      return "We hold speeds by road segment and by route, not by individual stop.";
    case "no_speed_record":
      return `Our speed record starts in ${speedRecordStartYear}, after this change.`;
    case "route_scope_mismatch":
      return "This change covers part of the route, so a route-wide average would not show it.";
    default:
      return "We have not yet defined how to measure this kind of change.";
  }
}

/**
 * The claim is the count; the titles are illustration. Dense routes carry many
 * source records for one real change, so naming all of them buries the sentence
 * without making it truer. The full set stays in `overlappingTitles`.
 */
export function confoundedSentence(overlappingTitles: readonly string[]): string {
  const count = overlappingTitles.length;
  const named =
    count > CONFOUNDED_TITLE_CAP
      ? [
          ...overlappingTitles.slice(0, CONFOUNDED_TITLE_CAP),
          `${count - CONFOUNDED_TITLE_CAP} more`,
        ]
      : overlappingTitles;
  return `${count} other ${count === 1 ? "change" : "changes"} landed on this route at the same time: ${joinPlain(named)}.`;
}

export function tooEarlySentence(monthsSince: number): string {
  return `${monthsSince} ${monthsSince === 1 ? "month" : "months"} of data since this change.`;
}

/** Anchor of the newest bus-lane change, or null when the chronology has none.
 * A read-only query over changes already minted here (plan 105); it matches the
 * treatment label vocabulary and never parses a title. */
export function busLaneChangeAnchor(chronology: RouteChangeChronology | null): string | null {
  if (chronology === null) return null;
  const label = interventionLabelForKind("bus_lane");
  // `changes` is sorted newest-first; undated changes carry no ordering claim.
  return (
    chronology.changes.find((change) => change.treatmentLabels.includes(label))?.anchorId ?? null
  );
}

function joinPlain(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1) ?? ""}`;
}
