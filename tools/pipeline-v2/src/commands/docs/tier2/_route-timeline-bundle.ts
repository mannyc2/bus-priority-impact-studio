import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { fromCliPath } from "../../../lib/paths.ts";
import { validateRouteTimelineCuration } from "./_route-timeline-curation.ts";
import type { Tier2RouteTimelineCurationPackArtifact } from "./_route-timeline-curation-pack.ts";

const ARTIFACT_KIND = "bp.tier2_route_timeline_bundle.v1";
const SUMMARY_KIND = "bp.tier2_route_timeline_bundle_summary.v1";

type JsonRecord = Record<string, unknown>;

type CurationEvent = {
  eventId: string;
  title: string;
  date?: string | null;
  month?: string | null;
  datePrecision?: "day" | "month" | "season" | "year" | "range" | "unknown";
  eventStatus:
    | "proposed"
    | "planned"
    | "approved"
    | "implemented"
    | "historical_context"
    | "needs_review";
  timelineLayer:
    | "project_milestone"
    | "service_change"
    | "treatment_change"
    | "evaluation"
    | "context";
  routeScope: "direct_route" | "route_family" | "corridor" | "uncertain";
  summary: string;
  whyItMatters: string;
  candidateRefs?: string[];
  candidateIds?: string[];
  dateAssertionRefs?: string[];
  dateAssertionIds?: string[];
  confidence: "high" | "medium" | "low";
  reviewNotes: string[];
};

type CurationToolCall = {
  schemaVersion: 1;
  routeId: string;
  events: CurationEvent[];
  excludedCandidates: Array<{
    candidateRef?: string;
    candidateId?: string;
    reason: string;
    notes: string;
  }>;
};

type DatePrecision = "day" | "month" | "season" | "year" | "range" | "unknown";

type DateAssertion =
  Tier2RouteTimelineCurationPackArtifact["candidates"][number]["dateAssertions"][number];
type Candidate = Tier2RouteTimelineCurationPackArtifact["candidates"][number];

type SourceChip = {
  sourceRef: string;
  sourceId: string;
  title: string | null;
  sourceGroup: string | null;
  pages: number[];
  candidateRefs: string[];
};

type CitationRef = {
  citationRef: string;
  candidateRef: string;
  sourceRef: string;
  pages: number[];
  excerpt: string | null;
};

type SuggestedAnalysisWindow = {
  status: "available" | "not_applicable";
  grain: "day" | "month" | null;
  beforeStart: string | null;
  beforeEnd: string | null;
  afterStart: string | null;
  afterEnd: string | null;
  notes: string;
};

type HydratedTimelineEvent = {
  eventId: string;
  routeId: string;
  title: string;
  summary: string;
  whyItMatters: string;
  date: string | null;
  month: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  datePrecision: DatePrecision;
  displayDate: string;
  dateSource:
    | "date_assertion_ref"
    | "date_assertion_backfill"
    | "legacy_model_output"
    | "unresolved";
  layer: CurationEvent["timelineLayer"];
  status: CurationEvent["eventStatus"];
  routeScope: CurationEvent["routeScope"];
  confidence: CurationEvent["confidence"];
  displayLayer: "default" | "secondary" | "review_only";
  candidateRefs: string[];
  candidateIds: string[];
  dateAssertionRefs: string[];
  dateAssertionIds: string[];
  sourceChips: SourceChip[];
  citationRefs: CitationRef[];
  affectedRouteIds: string[];
  affectedSegments: never[];
  relatedTreatmentFamilies: string[];
  relatedEventFamilies: string[];
  suggestedAnalysisWindow: SuggestedAnalysisWindow;
  qualityFlags: string[];
  reviewNotes: string[];
};

type HydratedExcludedCandidate = {
  candidateRef: string | null;
  candidateId: string | null;
  reason: string;
  notes: string;
  sourceRef: string | null;
  title: string | null;
};

export type Tier2RouteTimelineBundleArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  routeId: string;
  sourcePackPath: string;
  sourceToolCallPath: string;
  sourceRunPath: string | null;
  validation: ReturnType<typeof validateRouteTimelineCuration>;
  summary: {
    eventCount: number;
    excludedCandidateCount: number;
    defaultEventCount: number;
    secondaryEventCount: number;
    reviewOnlyEventCount: number;
    sourceBackedEventCount: number;
    dateAssertionBackedEventCount: number;
    resolvedDateEventCount: number;
    legacyDateEventCount: number;
    unresolvedDateEventCount: number;
    lowConfidenceEventCount: number;
    unaccountedCandidateCount: number;
    validationErrorCount: number;
    validationWarningCount: number;
    usage: unknown | null;
  };
  frontendContract: {
    defaultDisplayLayer: "default";
    secondaryLayers: string[];
    detailAffordances: string[];
    notes: string[];
  };
  events: HydratedTimelineEvent[];
  excludedCandidates: HydratedExcludedCandidate[];
};

export type BuildRouteTimelineBundleArgs = {
  packPath: string;
  toolCallPath: string;
  runPath?: string;
  outputPath?: string;
  markdownPath?: string;
  summaryPath?: string;
  generatedAt?: string;
};

type CliArgs = Partial<BuildRouteTimelineBundleArgs>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" && item.length > 0 ? [item] : []))
    : [];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function truncate(value: string | null, max: number): string | null {
  if (value === null) return null;
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}...`;
}

function candidateRefValue(candidate: Candidate): string | null {
  return typeof candidate.candidateRef === "string" && candidate.candidateRef.length > 0
    ? candidate.candidateRef
    : null;
}

function sourceRefValue(candidate: Candidate): string | null {
  return typeof candidate.sourceRef === "string" && candidate.sourceRef.length > 0
    ? candidate.sourceRef
    : null;
}

function dateAssertionRefValue(assertion: DateAssertion): string | null {
  return typeof assertion.dateAssertionRef === "string" && assertion.dateAssertionRef.length > 0
    ? assertion.dateAssertionRef
    : null;
}

function dateValueKey(assertion: {
  displayDate?: string | null;
  date: string | null;
  month: string | null;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  datePrecision: string;
}): string {
  return [
    assertion.displayDate ?? "",
    assertion.date ?? "",
    assertion.month ?? "",
    assertion.rangeStart ?? "",
    assertion.rangeEnd ?? "",
    assertion.datePrecision,
  ].join("|");
}

function resolveDateFromAssertions(assertions: DateAssertion[]) {
  const eventDateAssertions = assertions.filter(
    (assertion) => assertion.dateRole === "event_date_candidate",
  );
  const source = eventDateAssertions.length > 0 ? eventDateAssertions : assertions;
  const byPrecision = ["day", "month", "season", "year", "range", "unknown"].map((precision) =>
    source.filter((assertion) => assertion.datePrecision === precision),
  );
  const best = byPrecision.find((items) => items.length > 0) ?? [];
  const groups = new Map<string, DateAssertion[]>();
  for (const assertion of best) {
    const key = dateValueKey(assertion);
    const items = groups.get(key) ?? [];
    items.push(assertion);
    groups.set(key, items);
  }
  if (groups.size !== 1) {
    return {
      status: assertions.length === 0 ? ("none" as const) : ("ambiguous" as const),
      assertions: [] as DateAssertion[],
      date: null,
      month: null,
      rangeStart: null,
      rangeEnd: null,
      datePrecision: "unknown" as DatePrecision,
    };
  }
  const only = [...groups.values()][0] ?? [];
  const assertion = only[0];
  if (assertion === undefined) {
    return {
      status: "none" as const,
      assertions: [] as DateAssertion[],
      date: null,
      month: null,
      rangeStart: null,
      rangeEnd: null,
      datePrecision: "unknown" as DatePrecision,
    };
  }
  return {
    status: "resolved" as const,
    assertions: only,
    date: assertion.date,
    month: assertion.month,
    rangeStart: assertion.rangeStart ?? null,
    rangeEnd: assertion.rangeEnd ?? null,
    datePrecision: assertion.datePrecision,
  };
}

function displayDate(input: {
  displayDate?: string | null;
  date: string | null;
  month: string | null;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  datePrecision: DatePrecision;
}): string {
  if (input.displayDate !== undefined && input.displayDate !== null) return input.displayDate;
  if (input.datePrecision === "day" && input.date !== null) return input.date;
  if (input.datePrecision === "month" && input.month !== null) return input.month;
  if (input.datePrecision === "year") {
    if (input.date !== null) return input.date.slice(0, 4);
    if (input.month !== null) return input.month.slice(0, 4);
  }
  if (input.datePrecision === "season" || input.datePrecision === "range") {
    if (input.rangeStart !== undefined && input.rangeEnd !== undefined) {
      return `${input.rangeStart ?? "?"} to ${input.rangeEnd ?? "?"}`;
    }
    return "date range";
  }
  return "date unresolved";
}

function sortDateKey(event: HydratedTimelineEvent): string {
  if (event.date !== null) return event.date;
  if (event.month !== null) return event.month;
  if (event.rangeStart !== null) return event.rangeStart;
  return "9999-99-99";
}

function addMonths(month: string, offset: number): string {
  const [yearText, monthText] = month.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addDays(dateText: string, offset: number): string {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function suggestedAnalysisWindow(input: {
  date: string | null;
  month: string | null;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  datePrecision: DatePrecision;
  status: CurationEvent["eventStatus"];
}): SuggestedAnalysisWindow {
  if (input.status !== "implemented" && input.status !== "approved") {
    return {
      status: "not_applicable",
      grain: null,
      beforeStart: null,
      beforeEnd: null,
      afterStart: null,
      afterEnd: null,
      notes: "No before/after window: event is not an implemented or approved operational change.",
    };
  }
  if (input.datePrecision === "day" && input.date !== null) {
    return {
      status: "available",
      grain: "day",
      beforeStart: addDays(input.date, -90),
      beforeEnd: addDays(input.date, -1),
      afterStart: addDays(input.date, 1),
      afterEnd: addDays(input.date, 90),
      notes: "Deterministic 90-day pre/post suggestion around the resolved event date.",
    };
  }
  if (input.datePrecision === "month" && input.month !== null) {
    return {
      status: "available",
      grain: "month",
      beforeStart: addMonths(input.month, -3),
      beforeEnd: addMonths(input.month, -1),
      afterStart: addMonths(input.month, 1),
      afterEnd: addMonths(input.month, 3),
      notes: "Deterministic 3-month pre/post suggestion around the resolved event month.",
    };
  }
  if (
    (input.datePrecision === "season" || input.datePrecision === "range") &&
    input.rangeStart !== undefined &&
    input.rangeStart !== null &&
    input.rangeEnd !== undefined &&
    input.rangeEnd !== null &&
    /^\d{4}-\d{2}$/.test(input.rangeStart) &&
    /^\d{4}-\d{2}$/.test(input.rangeEnd)
  ) {
    return {
      status: "available",
      grain: "month",
      beforeStart: addMonths(input.rangeStart, -3),
      beforeEnd: addMonths(input.rangeStart, -1),
      afterStart: addMonths(input.rangeEnd, 1),
      afterEnd: addMonths(input.rangeEnd, 3),
      notes: "Deterministic 3-month pre/post suggestion around the resolved event date range.",
    };
  }
  return {
    status: "not_applicable",
    grain: null,
    beforeStart: null,
    beforeEnd: null,
    afterStart: null,
    afterEnd: null,
    notes: "No before/after window: event date precision is too coarse or unresolved.",
  };
}

function defaultOutputPath(toolCallPath: string): string {
  return join(dirname(fromCliPath(toolCallPath)), "route-timeline-bundle.json");
}

function defaultPath(outputPath: string, suffix: string): string {
  return outputPath.replace(/\.json$/, suffix);
}

function usageFromRun(value: unknown): unknown | null {
  if (!isRecord(value)) return null;
  const summary = value["summary"];
  return isRecord(summary) ? (summary["usage"] ?? null) : null;
}

function sourceChipsFor(candidates: Candidate[]): SourceChip[] {
  const bySource = new Map<
    string,
    {
      sourceRef: string;
      sourceId: string;
      title: string | null;
      sourceGroup: string | null;
      pages: Set<number>;
      candidateRefs: Set<string>;
    }
  >();
  for (const candidate of candidates) {
    const sourceRef = sourceRefValue(candidate) ?? candidate.sourceId ?? "unknown_source";
    const sourceId = candidate.sourceId ?? "unknown_source";
    const current = bySource.get(sourceRef) ?? {
      sourceRef,
      sourceId,
      title: candidate.sourceTitle,
      sourceGroup: candidate.sourceGroup,
      pages: new Set<number>(),
      candidateRefs: new Set<string>(),
    };
    current.title = current.title ?? candidate.sourceTitle;
    current.sourceGroup = current.sourceGroup ?? candidate.sourceGroup;
    for (const page of candidate.pageNumbers) current.pages.add(page);
    const candidateRef = candidateRefValue(candidate);
    if (candidateRef !== null) current.candidateRefs.add(candidateRef);
    bySource.set(sourceRef, current);
  }
  return [...bySource.values()]
    .map((source) => ({
      sourceRef: source.sourceRef,
      sourceId: source.sourceId,
      title: source.title,
      sourceGroup: source.sourceGroup,
      pages: uniqueSortedNumbers([...source.pages]),
      candidateRefs: uniqueSorted([...source.candidateRefs]),
    }))
    .sort((left, right) => left.sourceRef.localeCompare(right.sourceRef));
}

function citationRefsFor(candidates: Candidate[]): CitationRef[] {
  return candidates.slice(0, 12).flatMap((candidate) => {
    const candidateRef = candidateRefValue(candidate);
    const sourceRef = sourceRefValue(candidate);
    if (candidateRef === null || sourceRef === null) return [];
    const pages = uniqueSortedNumbers(candidate.pageNumbers);
    return [
      {
        citationRef: `${candidateRef}:${sourceRef}:${pages.join(",") || "p?"}`,
        candidateRef,
        sourceRef,
        pages,
        excerpt: truncate(candidate.rawText ?? candidate.displayLabel, 280),
      },
    ];
  });
}

function relatedFamilies(candidates: Candidate[], keyPattern: RegExp): string[] {
  return uniqueSorted(
    candidates.flatMap((candidate) => [
      ...candidate.fieldRows
        .filter((row) => keyPattern.test(row.keyId))
        .map((row) => row.canonicalLeafLabel ?? row.canonicalLeafId),
      ...candidate.unresolvedRows
        .filter((row) => keyPattern.test(row.keyId))
        .map((row) => row.coarseFamily ?? row.rawValue),
    ]),
  );
}

function qualityFlags(input: {
  event: CurationEvent;
  candidateRefs: string[];
  sourceChips: SourceChip[];
  dateAssertionRefs: string[];
  datePrecision: DatePrecision;
  dateSource: HydratedTimelineEvent["dateSource"];
}): string[] {
  const flags: string[] = [];
  if (input.candidateRefs.length === 0) flags.push("missing_candidate_ref");
  if (input.sourceChips.length === 0) flags.push("missing_source_chip");
  if (input.datePrecision === "unknown") flags.push("unresolved_date");
  if (input.dateSource === "legacy_model_output") flags.push("legacy_model_date");
  if (input.dateAssertionRefs.length === 0 && input.datePrecision !== "unknown")
    flags.push("date_not_assertion_backed");
  if (input.event.routeScope === "uncertain") flags.push("uncertain_route_scope");
  if (input.event.confidence === "low") flags.push("low_confidence");
  if (input.event.eventStatus === "planned" || input.event.eventStatus === "proposed")
    flags.push("planned_or_proposed");
  if (input.event.eventStatus === "needs_review") flags.push("needs_review_status");
  if (input.event.timelineLayer === "context") flags.push("context_layer");
  if (/%|\bmph\b|\bfaster\b|\bslower\b|\bimprov/i.test(input.event.summary))
    flags.push("source_reported_metric_language");
  return uniqueSorted(flags);
}

function displayLayerFor(input: {
  event: CurationEvent;
  qualityFlags: string[];
}): HydratedTimelineEvent["displayLayer"] {
  const blocking = new Set([
    "missing_candidate_ref",
    "missing_source_chip",
    "unresolved_date",
    "legacy_model_date",
    "date_not_assertion_backed",
    "uncertain_route_scope",
    "low_confidence",
    "needs_review_status",
  ]);
  if (input.qualityFlags.some((flag) => blocking.has(flag))) return "review_only";
  if (
    input.event.eventStatus === "implemented" &&
    input.event.timelineLayer !== "context" &&
    input.event.timelineLayer !== "evaluation"
  ) {
    return "default";
  }
  return "secondary";
}

function hydrateEvent(input: {
  routeId: string;
  event: CurationEvent;
  candidateById: Map<string, Candidate>;
  candidateIdByRef: Map<string, string>;
  dateAssertionById: Map<string, DateAssertion>;
  dateAssertionIdByRef: Map<string, string>;
}): HydratedTimelineEvent {
  const candidateIds = uniqueSorted([
    ...stringArray(input.event.candidateIds),
    ...stringArray(input.event.candidateRefs).flatMap((candidateRef) => {
      const candidateId = input.candidateIdByRef.get(candidateRef);
      return candidateId === undefined ? [] : [candidateId];
    }),
  ]);
  const candidates = candidateIds.flatMap((candidateId) => {
    const candidate = input.candidateById.get(candidateId);
    return candidate === undefined ? [] : [candidate];
  });
  const candidateRefs = uniqueSorted(
    candidates.flatMap((candidate) => {
      const candidateRef = candidateRefValue(candidate);
      return candidateRef === null ? [] : [candidateRef];
    }),
  );
  const explicitAssertionIds = uniqueSorted([
    ...stringArray(input.event.dateAssertionIds),
    ...stringArray(input.event.dateAssertionRefs).flatMap((assertionRef) => {
      const assertionId = input.dateAssertionIdByRef.get(assertionRef);
      return assertionId === undefined ? [] : [assertionId];
    }),
  ]);
  const explicitAssertions = explicitAssertionIds.flatMap((assertionId) => {
    const assertion = input.dateAssertionById.get(assertionId);
    return assertion === undefined ? [] : [assertion];
  });
  const allCandidateAssertions = candidates.flatMap((candidate) => candidate.dateAssertions ?? []);
  const legacyDate = typeof input.event.date === "string" ? input.event.date : null;
  const legacyMonth = typeof input.event.month === "string" ? input.event.month : null;
  const matchingCandidateAssertions =
    legacyDate !== null
      ? allCandidateAssertions.filter((assertion) => assertion.date === legacyDate)
      : legacyMonth !== null
        ? allCandidateAssertions.filter((assertion) => assertion.month === legacyMonth)
        : allCandidateAssertions;
  const resolved =
    explicitAssertions.length > 0
      ? resolveDateFromAssertions(explicitAssertions)
      : resolveDateFromAssertions(
          matchingCandidateAssertions.length > 0
            ? matchingCandidateAssertions
            : allCandidateAssertions,
        );
  const dateSource: HydratedTimelineEvent["dateSource"] =
    explicitAssertions.length > 0 && resolved.status === "resolved"
      ? "date_assertion_ref"
      : resolved.status === "resolved"
        ? "date_assertion_backfill"
        : legacyDate !== null || legacyMonth !== null
          ? "legacy_model_output"
          : "unresolved";
  const date =
    resolved.status === "resolved"
      ? resolved.date
      : dateSource === "legacy_model_output"
        ? legacyDate
        : null;
  const month =
    resolved.status === "resolved"
      ? resolved.month
      : dateSource === "legacy_model_output"
        ? legacyMonth
        : null;
  const rangeStart = resolved.status === "resolved" ? resolved.rangeStart : null;
  const rangeEnd = resolved.status === "resolved" ? resolved.rangeEnd : null;
  const datePrecision =
    resolved.status === "resolved"
      ? resolved.datePrecision
      : dateSource === "legacy_model_output"
        ? (input.event.datePrecision ?? "unknown")
        : "unknown";
  const resolvedDisplayDate =
    resolved.status === "resolved" ? (resolved.assertions[0]?.displayDate ?? null) : null;
  const dateAssertionIds = uniqueSorted(
    resolved.assertions.map((assertion) => assertion.dateAssertionId),
  );
  const dateAssertionRefs = uniqueSorted(
    resolved.assertions.flatMap((assertion) => {
      const assertionRef = dateAssertionRefValue(assertion);
      return assertionRef === null ? [] : [assertionRef];
    }),
  );
  const sourceChips = sourceChipsFor(candidates);
  const flags = qualityFlags({
    event: input.event,
    candidateRefs,
    sourceChips,
    dateAssertionRefs,
    datePrecision,
    dateSource,
  });
  return {
    eventId: input.event.eventId,
    routeId: input.routeId,
    title: input.event.title,
    summary: input.event.summary,
    whyItMatters: input.event.whyItMatters,
    date,
    month,
    rangeStart,
    rangeEnd,
    datePrecision,
    displayDate: displayDate({
      displayDate: resolvedDisplayDate,
      date,
      month,
      rangeStart,
      rangeEnd,
      datePrecision,
    }),
    dateSource,
    layer: input.event.timelineLayer,
    status: input.event.eventStatus,
    routeScope: input.event.routeScope,
    confidence: input.event.confidence,
    displayLayer: displayLayerFor({ event: input.event, qualityFlags: flags }),
    candidateRefs,
    candidateIds,
    dateAssertionRefs,
    dateAssertionIds,
    sourceChips,
    citationRefs: citationRefsFor(candidates),
    affectedRouteIds: uniqueSorted(candidates.flatMap((candidate) => candidate.routeIds)),
    affectedSegments: [],
    relatedTreatmentFamilies: relatedFamilies(candidates, /treatment/i),
    relatedEventFamilies: relatedFamilies(candidates, /event/i),
    suggestedAnalysisWindow: suggestedAnalysisWindow({
      date,
      month,
      rangeStart,
      rangeEnd,
      datePrecision,
      status: input.event.eventStatus,
    }),
    qualityFlags: flags,
    reviewNotes: input.event.reviewNotes,
  };
}

function hydrateExcluded(input: {
  excluded: CurationToolCall["excludedCandidates"][number];
  candidateById: Map<string, Candidate>;
  candidateIdByRef: Map<string, string>;
}): HydratedExcludedCandidate {
  const candidateId =
    input.excluded.candidateId ??
    (input.excluded.candidateRef === undefined
      ? undefined
      : input.candidateIdByRef.get(input.excluded.candidateRef));
  const candidate = candidateId === undefined ? undefined : input.candidateById.get(candidateId);
  return {
    candidateRef:
      candidate === undefined
        ? (input.excluded.candidateRef ?? null)
        : candidateRefValue(candidate),
    candidateId: candidateId ?? null,
    reason: input.excluded.reason,
    notes: input.excluded.notes,
    sourceRef: candidate === undefined ? null : sourceRefValue(candidate),
    title: candidate?.displayLabel ?? null,
  };
}

function buildBundle(input: {
  pack: Tier2RouteTimelineCurationPackArtifact;
  toolCall: CurationToolCall;
  run: unknown | null;
  packPath: string;
  toolCallPath: string;
  runPath: string | null;
  generatedAt: string;
}): Tier2RouteTimelineBundleArtifact {
  const candidateById = new Map(
    input.pack.candidates.map((candidate) => [candidate.candidateId, candidate] as const),
  );
  const candidateIdByRef = new Map(
    input.pack.candidates.flatMap((candidate) => {
      const candidateRef = candidateRefValue(candidate);
      return candidateRef === null ? [] : [[candidateRef, candidate.candidateId] as const];
    }),
  );
  const dateAssertionById = new Map(
    input.pack.candidates.flatMap((candidate) =>
      candidate.dateAssertions.map((assertion) => [assertion.dateAssertionId, assertion] as const),
    ),
  );
  const dateAssertionIdByRef = new Map(
    input.pack.candidates.flatMap((candidate) =>
      candidate.dateAssertions.flatMap((assertion) => {
        const assertionRef = dateAssertionRefValue(assertion);
        return assertionRef === null ? [] : [[assertionRef, assertion.dateAssertionId] as const];
      }),
    ),
  );
  const validation = validateRouteTimelineCuration({
    pack: input.pack,
    toolCall: input.toolCall as never,
    generatedAt: input.generatedAt,
  });
  const events = input.toolCall.events
    .map((event) =>
      hydrateEvent({
        routeId: input.pack.routeId,
        event,
        candidateById,
        candidateIdByRef,
        dateAssertionById,
        dateAssertionIdByRef,
      }),
    )
    .sort(
      (left, right) =>
        sortDateKey(left).localeCompare(sortDateKey(right)) ||
        left.title.localeCompare(right.title),
    );
  const excludedCandidates = input.toolCall.excludedCandidates.map((excluded) =>
    hydrateExcluded({ excluded, candidateById, candidateIdByRef }),
  );
  const validationErrorCount = validation.issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const validationWarningCount = validation.issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  return {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    routeId: input.pack.routeId,
    sourcePackPath: input.packPath,
    sourceToolCallPath: input.toolCallPath,
    sourceRunPath: input.runPath,
    validation,
    summary: {
      eventCount: events.length,
      excludedCandidateCount: excludedCandidates.length,
      defaultEventCount: events.filter((event) => event.displayLayer === "default").length,
      secondaryEventCount: events.filter((event) => event.displayLayer === "secondary").length,
      reviewOnlyEventCount: events.filter((event) => event.displayLayer === "review_only").length,
      sourceBackedEventCount: events.filter((event) => event.sourceChips.length > 0).length,
      dateAssertionBackedEventCount: events.filter((event) => event.dateAssertionRefs.length > 0)
        .length,
      resolvedDateEventCount: events.filter((event) => event.datePrecision !== "unknown").length,
      legacyDateEventCount: events.filter((event) => event.dateSource === "legacy_model_output")
        .length,
      unresolvedDateEventCount: events.filter((event) => event.datePrecision === "unknown").length,
      lowConfidenceEventCount: events.filter((event) => event.confidence === "low").length,
      unaccountedCandidateCount: validation.unaccountedCandidateCount ?? 0,
      validationErrorCount,
      validationWarningCount,
      usage: usageFromRun(input.run),
    },
    frontendContract: {
      defaultDisplayLayer: "default",
      secondaryLayers: ["planned/proposed events", "evaluations", "historical context"],
      detailAffordances: ["source chips", "page/source drawer", "review notes", "quality flags"],
      notes: [
        "Default timeline should show default events only.",
        "Secondary and review-only events are useful for analyst controls and Data Notes.",
        "Date, source, and citation fields are runner-hydrated from refs; the model-authored text is summary/whyItMatters/reviewNotes.",
      ],
    },
    events,
    excludedCandidates,
  };
}

function renderMarkdown(artifact: Tier2RouteTimelineBundleArtifact): string {
  const lines: string[] = [];
  lines.push(`# Route Timeline Bundle Preview: ${artifact.routeId}`);
  lines.push("");
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push(`Source tool call: ${artifact.sourceToolCallPath}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Events: ${artifact.summary.eventCount}`);
  lines.push(`- Default display events: ${artifact.summary.defaultEventCount}`);
  lines.push(`- Secondary events: ${artifact.summary.secondaryEventCount}`);
  lines.push(`- Review-only events: ${artifact.summary.reviewOnlyEventCount}`);
  lines.push(`- Source-backed events: ${artifact.summary.sourceBackedEventCount}`);
  lines.push(`- Date-assertion-backed events: ${artifact.summary.dateAssertionBackedEventCount}`);
  lines.push(`- Legacy model-date events: ${artifact.summary.legacyDateEventCount}`);
  lines.push(`- Unresolved-date events: ${artifact.summary.unresolvedDateEventCount}`);
  lines.push(`- Unaccounted pack candidates: ${artifact.summary.unaccountedCandidateCount}`);
  lines.push(
    `- Validation: ${artifact.summary.validationErrorCount} errors, ${artifact.summary.validationWarningCount} warnings`,
  );
  lines.push("");
  lines.push("## Frontend Table");
  lines.push("");
  lines.push("| Layer | Date | Type | Status | Confidence | Title | Sources | Flags |");
  lines.push("|---|---|---|---|---|---|---:|---|");
  for (const event of artifact.events) {
    lines.push(
      `| ${event.displayLayer} | ${event.displayDate} | ${event.layer} | ${event.status} | ${event.confidence} | ${event.title.replaceAll("|", "\\|")} | ${event.sourceChips.length} | ${event.qualityFlags.join(", ")} |`,
    );
  }
  lines.push("");
  lines.push("## Event Details");
  for (const event of artifact.events) {
    lines.push("");
    lines.push(`### ${event.displayDate} - ${event.title}`);
    lines.push("");
    lines.push(`displayLayer: ${event.displayLayer}`);
    lines.push(`eventId: ${event.eventId}`);
    lines.push(`candidateRefs: ${event.candidateRefs.join(", ")}`);
    lines.push(`dateAssertionRefs: ${event.dateAssertionRefs.join(", ") || "none"}`);
    lines.push(`dateSource: ${event.dateSource}`);
    lines.push(`qualityFlags: ${event.qualityFlags.join(", ") || "none"}`);
    lines.push("");
    lines.push(event.summary);
    lines.push("");
    lines.push(`Why it matters: ${event.whyItMatters}`);
    if (event.sourceChips.length > 0) {
      lines.push("");
      lines.push("Sources:");
      for (const source of event.sourceChips) {
        lines.push(
          `- ${source.sourceRef}: ${source.title ?? source.sourceId} (pages ${source.pages.join(", ") || "unknown"})`,
        );
      }
    }
    if (event.citationRefs.length > 0) {
      lines.push("");
      lines.push("Citations:");
      for (const citation of event.citationRefs.slice(0, 6)) {
        lines.push(`- ${citation.citationRef}: ${JSON.stringify(citation.excerpt ?? "")}`);
      }
    }
    if (event.suggestedAnalysisWindow.status === "available") {
      lines.push("");
      lines.push(
        `Suggested window: before ${event.suggestedAnalysisWindow.beforeStart} to ${event.suggestedAnalysisWindow.beforeEnd}; after ${event.suggestedAnalysisWindow.afterStart} to ${event.suggestedAnalysisWindow.afterEnd}`,
      );
    }
    if (event.reviewNotes.length > 0) {
      lines.push("");
      lines.push("Review notes:");
      for (const note of event.reviewNotes) lines.push(`- ${note}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function buildRouteTimelineBundle(args: BuildRouteTimelineBundleArgs): Promise<{
  artifact: Tier2RouteTimelineBundleArtifact;
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
}> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const packPath = fromCliPath(args.packPath);
  const toolCallPath = fromCliPath(args.toolCallPath);
  const runPath = args.runPath === undefined ? null : fromCliPath(args.runPath);
  const pack = (await Bun.file(packPath).json()) as Tier2RouteTimelineCurationPackArtifact;
  const toolCall = (await Bun.file(toolCallPath).json()) as CurationToolCall;
  const run = runPath === null ? null : await Bun.file(runPath).json();
  const outputPath = fromCliPath(args.outputPath ?? defaultOutputPath(args.toolCallPath));
  const markdownPath =
    args.markdownPath === undefined
      ? defaultPath(outputPath, ".md")
      : fromCliPath(args.markdownPath);
  const summaryPath =
    args.summaryPath === undefined
      ? defaultPath(outputPath, "-summary.json")
      : fromCliPath(args.summaryPath);
  const artifact = buildBundle({
    pack,
    toolCall,
    run,
    packPath,
    toolCallPath,
    runPath,
    generatedAt,
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  await Bun.write(markdownPath, renderMarkdown(artifact));
  await writeJson(summaryPath, {
    artifactKind: SUMMARY_KIND,
    schemaVersion: 1,
    generatedAt,
    sourceArtifactPath: outputPath,
    summary: artifact.summary,
  });
  return { artifact, outputPath, markdownPath, summaryPath };
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--pack") {
      if (value === undefined) throw new Error("--pack requires a value.");
      args.packPath = value;
      index += 1;
    } else if (arg === "--tool-call") {
      if (value === undefined) throw new Error("--tool-call requires a value.");
      args.toolCallPath = value;
      index += 1;
    } else if (arg === "--run") {
      if (value === undefined) throw new Error("--run requires a value.");
      args.runPath = value;
      index += 1;
    } else if (arg === "--output") {
      if (value === undefined) throw new Error("--output requires a value.");
      args.outputPath = value;
      index += 1;
    } else if (arg === "--markdown") {
      if (value === undefined) throw new Error("--markdown requires a value.");
      args.markdownPath = value;
      index += 1;
    } else if (arg === "--summary") {
      if (value === undefined) throw new Error("--summary requires a value.");
      args.summaryPath = value;
      index += 1;
    } else if (arg === "--generated-at") {
      if (value === undefined) throw new Error("--generated-at requires a value.");
      args.generatedAt = value;
      index += 1;
    } else {
      throw new Error(`Unknown docs tier2 route-timeline-bundle option: ${arg}`);
    }
  }
  return args;
}

export async function runRouteTimelineBundleFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.packPath === undefined) throw new Error("Provide --pack.");
  if (args.toolCallPath === undefined) throw new Error("Provide --tool-call.");
  const result = await buildRouteTimelineBundle({
    packPath: args.packPath,
    toolCallPath: args.toolCallPath,
    ...(args.runPath === undefined ? {} : { runPath: args.runPath }),
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
  });
  console.log(
    `route-timeline-bundle: route=${result.artifact.routeId} events=${result.artifact.summary.eventCount} default=${result.artifact.summary.defaultEventCount} review_only=${result.artifact.summary.reviewOnlyEventCount}`,
  );
  return {
    artifactKind: result.artifact.artifactKind,
    schemaVersion: result.artifact.schemaVersion,
    generatedAt: result.artifact.generatedAt,
    outputPath: result.outputPath,
    markdownPath: result.markdownPath,
    summaryPath: result.summaryPath,
    summary: result.artifact.summary,
  };
}
