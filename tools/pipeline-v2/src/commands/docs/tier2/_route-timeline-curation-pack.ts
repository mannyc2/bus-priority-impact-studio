import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { normalizeRouteIdText } from "../../../lib/route-ids.ts";
import type { Tier2VocabConsumerIndexArtifact } from "./_vocab-consumer-index.ts";
import type { Tier2VocabMaterializedViewsArtifact } from "./_vocab-materialized-views.ts";

const ARTIFACT_KIND = "bp.tier2_route_timeline_curation_pack.v1";
const SUMMARY_KIND = "bp.tier2_route_timeline_curation_pack_summary.v1";

type JsonRecord = Record<string, unknown>;
type ConsumerSurfaceRow = Tier2VocabConsumerIndexArtifact["surfaceRows"][number];
type ConsumerFieldRow = Tier2VocabConsumerIndexArtifact["fieldRows"][number];
type ConsumerUnresolvedRow = Tier2VocabConsumerIndexArtifact["unresolvedRows"][number];

type CandidateRole =
  | "timeline_primary"
  | "timeline_context"
  | "supporting_treatment"
  | "supporting_metric"
  | "supporting_claim";

type TimelineOutputSchema = {
  schemaVersion: 1;
  routeId: string;
  events: Array<{
    eventId: string;
    title: string;
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
    candidateRefs: string[];
    dateAssertionRefs: string[];
    confidence: "high" | "medium" | "low";
    reviewNotes: string[];
  }>;
  excludedCandidates: Array<{
    candidateRef: string;
    reason:
      | "duplicate"
      | "too_vague"
      | "not_route_specific"
      | "process_only"
      | "missing_date"
      | "not_timeline_event"
      | "conflicting_sources"
      | "other";
    notes: string;
  }>;
};

type CurationFieldRow = {
  keyId: string;
  rawValue: string;
  canonicalLeafId: string;
  canonicalLeafLabel: string | null;
  coarseFamily: string;
  sourceFieldPath: string;
  targetPayloadPath: string;
  modifiers: Record<string, string[]>;
  supportIds: string[];
  evidencePointerIds: string[];
};

type CurationUnresolvedRow = {
  keyId: string;
  rawValue: string;
  decision: string;
  reason: string;
  coarseFamily: string | null;
  sourceFieldPath: string;
  targetPayloadPath: string;
  modifiers: Record<string, string[]> | null;
  supportIds: string[];
  evidencePointerIds: string[];
};

type PayloadHint = {
  path: string;
  value: string;
};

type DatePrecision = "day" | "month" | "season" | "year" | "range" | "unknown";

type CandidateDateAssertion = {
  dateAssertionRef: string;
  dateAssertionId: string;
  candidateId: string;
  sourcePath: string;
  rawText: string;
  displayDate: string | null;
  date: string | null;
  month: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  datePrecision: DatePrecision;
  dateRole: "event_date_candidate" | "source_document_date" | "mentioned_date";
  confidence: "high" | "medium" | "low";
};

type RouteTimelineCandidate = {
  candidateRef: string;
  candidateId: string;
  surfaceId: string;
  candidateRole: CandidateRole;
  score: number;
  surfaceKind: string;
  payloadSchemaId: string | null;
  displayLabel: string | null;
  rawText: string | null;
  sourceId: string | null;
  sourceRef: string;
  sourceTitle: string | null;
  sourceGroup: string | null;
  pageNumbers: number[];
  routeIds: string[];
  routeMatch: "direct_route" | "route_family" | "alias";
  intendedUses: string[];
  coarseFamilies: string[];
  mappedFieldCount: number;
  unresolvedFieldCount: number;
  evidencePointerIds: string[];
  supportIds: string[];
  artifactPath: string;
  auditPath: string | null;
  canonicalPayload: JsonRecord;
  payloadHints: PayloadHint[];
  dateAssertions: CandidateDateAssertion[];
  fieldRows: CurationFieldRow[];
  unresolvedRows: CurationUnresolvedRow[];
};

type RouteTimelineSourceRef = {
  sourceRef: string;
  sourceId: string;
  sourceTitle: string | null;
  sourceGroup: string | null;
  pageNumbers: number[];
  candidateCount: number;
  evidencePointerCount: number;
  artifactPaths: string[];
};

export type Tier2RouteTimelineCurationPackArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  routeId: string;
  routeAliases: string[];
  sourceConsumerIndexPath: string;
  sourceMaterializedViewsPath: string | null;
  summary: {
    candidateCount: number;
    timelinePrimaryCount: number;
    timelineContextCount: number;
    treatmentCandidateCount: number;
    metricCandidateCount: number;
    claimCandidateCount: number;
    eventCandidateCount: number;
    serviceChangeCandidateCount: number;
    sourceCount: number;
    evidencePointerCount: number;
    dateAssertionCount: number;
    candidatesWithDateAssertionCount: number;
    candidatesWithEvidencePointerCount: number;
    candidatesWithArtifactPathCount: number;
    routeBundleSurfaceCount: number | null;
    routeBundleTimelineCandidateSurfaceCount: number | null;
  };
  llmTask: {
    objective: "curate_route_timeline";
    policy: string[];
    filesystemGuidance: string[];
    outputSchema: TimelineOutputSchema;
  };
  sourceRefs: RouteTimelineSourceRef[];
  candidates: RouteTimelineCandidate[];
};

export type BuildRouteTimelineCurationPackArgs = {
  route: string;
  consumerIndexPath: string;
  materializedViewsPath?: string;
  outputPath?: string;
  markdownPath?: string;
  summaryPath?: string;
  generatedAt?: string;
  maxCandidates?: number;
  maxPayloadHints?: number;
};

type CliArgs = Partial<BuildRouteTimelineCurationPackArgs>;

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function compactRef(prefix: string, index: number): string {
  return `${prefix}${String(index + 1).padStart(3, "0")}`;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizeForRouteMatch(value: unknown): string | null {
  const normalized = normalizeRouteIdText(value);
  if (normalized === null) return null;
  const compact = normalized.replace(/\s+/g, "").replace(/-SBS$/, "+");
  const selectBusService = compact.match(/^([A-Z]+\d{1,3}[A-Z]?)(?:SBS|SELECTBUSSERVICE)$/);
  if (selectBusService?.[1]) return `${selectBusService[1]}+`;
  return compact;
}

function routeBase(routeId: string): string {
  return routeId.endsWith("+") ? routeId.slice(0, -1) : routeId;
}

function routeAliasesFor(route: string): string[] {
  const normalized = normalizeForRouteMatch(route);
  if (normalized === null) return [];
  const base = routeBase(normalized);
  return uniqueSorted([normalized, base, `${base}+`, `${base}-SBS`]);
}

function routeMatchFor(surface: ConsumerSurfaceRow, aliases: Set<string>, targetBase: string) {
  for (const routeId of surface.routeIds) {
    const normalized = normalizeForRouteMatch(routeId);
    if (normalized === null) continue;
    if (aliases.has(normalized)) {
      return normalized === targetBase ? ("direct_route" as const) : ("alias" as const);
    }
    if (
      normalized.length === targetBase.length + 1 &&
      normalized.startsWith(targetBase) &&
      /^[A-Z]$/.test(normalized.slice(-1))
    ) {
      return "route_family" as const;
    }
  }
  return null;
}

function candidateIdFor(routeId: string, surfaceId: string): string {
  return `timeline_candidate_${shortHash(`${routeId}\u001f${surfaceId}`)}`;
}

function sourceRefFor(sourceId: string | null): string {
  return sourceId ?? "unknown_source";
}

function candidateRoleFor(surface: ConsumerSurfaceRow): CandidateRole | null {
  if (
    surface.surfaceKind === "event_candidate" ||
    surface.surfaceKind === "service_change_candidate"
  ) {
    return "timeline_primary";
  }
  if (surface.surfaceKind === "treatment_component") return "supporting_treatment";
  if (surface.surfaceKind === "metric_observation") return "supporting_metric";
  if (
    surface.surfaceKind === "claim" ||
    surface.surfaceKind === "causal_claim" ||
    surface.surfaceKind === "brief_claim_seed" ||
    surface.surfaceKind === "finding_reasoning_seed"
  ) {
    return "supporting_claim";
  }
  if (surface.intendedUses.includes("public_timeline_candidate")) return "timeline_context";
  return null;
}

function candidateScore(input: {
  surface: ConsumerSurfaceRow;
  role: CandidateRole;
  fieldRows: ConsumerFieldRow[];
  unresolvedRows: ConsumerUnresolvedRow[];
  evidencePointerIds: string[];
}): number {
  const roleScore: Record<CandidateRole, number> = {
    timeline_primary: 100,
    supporting_treatment: 82,
    timeline_context: 70,
    supporting_metric: 58,
    supporting_claim: 52,
  };
  let score = roleScore[input.role];
  if (input.surface.intendedUses.includes("public_timeline_candidate")) score += 14;
  if (input.surface.intendedUses.includes("causal_treatment_inventory")) score += 8;
  if (input.surface.intendedUses.includes("event_study_window")) score += 8;
  if (input.evidencePointerIds.length > 0) score += 10;
  if (input.surface.artifactPath.length > 0) score += 4;
  score += Math.min(12, input.fieldRows.length * 2);
  score -= Math.min(8, input.unresolvedRows.length * 2);
  const rankingText = [
    input.surface.displayLabel,
    input.surface.rawText,
    ...input.fieldRows.flatMap((row) => [
      row.keyId,
      row.rawValue,
      row.canonicalLeafId,
      row.canonicalLeafLabel,
      row.coarseFamily,
    ]),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
  if (
    /\b(implemented|launch|launched|service starts|upgrade|bus lane|signal priority|queue jump)\b/.test(
      rankingText,
    )
  ) {
    score += 10;
  }
  if (
    /\b(community board|community_outreach|outreach|meeting|presentation|workshop|open house|cac meeting|advisory committee)\b/.test(
      rankingText,
    )
  ) {
    score -= 28;
  }
  if (/\b(tbd|unknown|to be determined)\b/.test(rankingText)) score -= 8;
  return score;
}

function evidencePointerIdsFor(input: {
  surface: ConsumerSurfaceRow;
  fieldRows: ConsumerFieldRow[];
  unresolvedRows: ConsumerUnresolvedRow[];
}): string[] {
  return uniqueSorted([
    ...input.surface.evidencePointerIds,
    ...input.fieldRows.flatMap((row) => row.evidence.evidencePointerIds),
    ...input.unresolvedRows.flatMap((row) => row.evidence.evidencePointerIds),
  ]);
}

function supportIdsFor(input: {
  fieldRows: ConsumerFieldRow[];
  unresolvedRows: ConsumerUnresolvedRow[];
}): string[] {
  return uniqueSorted([
    ...input.fieldRows.flatMap((row) => row.evidence.supportIds),
    ...input.unresolvedRows.flatMap((row) => row.evidence.supportIds),
  ]);
}

const PAYLOAD_HINT_RE =
  /(date|month|year|status|family|kind|type|treatment|event|location|corridor|route|claim|metric|unit|subject|period|direction)/i;

function collectPayloadHints(payload: unknown, maxHints: number): PayloadHint[] {
  const hints: PayloadHint[] = [];
  const visit = (value: unknown, path: string) => {
    if (hints.length >= maxHints) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      if (PAYLOAD_HINT_RE.test(path)) hints.push({ path, value: String(value) });
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 12).forEach((item, index) => {
        visit(item, `${path}[${index}]`);
      });
      return;
    }
    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value as JsonRecord)) {
        visit(item, path.length > 0 ? `${path}.${key}` : key);
        if (hints.length >= maxHints) return;
      }
    }
  };
  visit(payload, "");
  return hints;
}

const MONTH_NUMBERS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const SEASONS: Record<string, { label: string; rangeStartMonth: string; rangeEndMonth: string }> = {
  spring: { label: "Spring", rangeStartMonth: "03", rangeEndMonth: "05" },
  summer: { label: "Summer", rangeStartMonth: "06", rangeEndMonth: "08" },
  fall: { label: "Fall", rangeStartMonth: "09", rangeEndMonth: "11" },
  autumn: { label: "Fall", rangeStartMonth: "09", rangeEndMonth: "11" },
  winter: { label: "Winter", rangeStartMonth: "12", rangeEndMonth: "02" },
};

function pad2(value: string): string {
  return value.padStart(2, "0");
}

function dateAssertionIdFor(input: {
  candidateId: string;
  sourcePath: string;
  rawText: string;
  displayDate: string | null;
  date: string | null;
  month: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  datePrecision: CandidateDateAssertion["datePrecision"];
}): string {
  return `date_${shortHash(
    [
      input.candidateId,
      input.sourcePath,
      input.rawText,
      input.displayDate ?? "",
      input.date ?? "",
      input.month ?? "",
      input.rangeStart ?? "",
      input.rangeEnd ?? "",
      input.datePrecision,
    ].join("\u001f"),
  )}`;
}

function dateRoleFor(input: {
  sourcePath: string;
  text: string;
  surfaceKind: string;
}): CandidateDateAssertion["dateRole"] {
  const lower = input.text.toLowerCase();
  if (input.sourcePath === "sourceId") return "source_document_date";
  if (
    input.surfaceKind === "event_candidate" ||
    input.surfaceKind === "service_change_candidate" ||
    /\b(meeting|presentation|town hall|open house|workshop|launch|implemented|planned|proposed|starts|completed)\b/.test(
      lower,
    )
  ) {
    return "event_date_candidate";
  }
  return "mentioned_date";
}

function confidenceForDateSource(input: {
  sourcePath: string;
  datePrecision: CandidateDateAssertion["datePrecision"];
}): CandidateDateAssertion["confidence"] {
  if (input.sourcePath === "sourceId") return "medium";
  return input.datePrecision === "day" ? "high" : "medium";
}

function assertionsFromText(input: {
  candidateId: string;
  sourcePath: string;
  text: string | null;
  surfaceKind: string;
}): CandidateDateAssertion[] {
  if (input.text === null || input.text.trim().length === 0) return [];
  const assertions: CandidateDateAssertion[] = [];
  const addAssertion = (
    rawText: string,
    date: string | null,
    month: string | null,
    datePrecision: CandidateDateAssertion["datePrecision"],
    extra: {
      displayDate?: string | null;
      rangeStart?: string | null;
      rangeEnd?: string | null;
    } = {},
  ) => {
    const dateAssertionId = dateAssertionIdFor({
      candidateId: input.candidateId,
      sourcePath: input.sourcePath,
      rawText,
      displayDate: extra.displayDate ?? date ?? month ?? rawText,
      date,
      month,
      rangeStart: extra.rangeStart ?? null,
      rangeEnd: extra.rangeEnd ?? null,
      datePrecision,
    });
    assertions.push({
      dateAssertionRef: "",
      dateAssertionId,
      candidateId: input.candidateId,
      sourcePath: input.sourcePath,
      rawText,
      displayDate: extra.displayDate ?? date ?? month ?? rawText,
      date,
      month,
      rangeStart: extra.rangeStart ?? null,
      rangeEnd: extra.rangeEnd ?? null,
      datePrecision,
      dateRole: dateRoleFor({
        sourcePath: input.sourcePath,
        text: input.text ?? rawText,
        surfaceKind: input.surfaceKind,
      }),
      confidence: confidenceForDateSource({ sourcePath: input.sourcePath, datePrecision }),
    });
  };

  for (const match of input.text.matchAll(/\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b/g)) {
    const year = match[1];
    const month = match[2];
    const day = match[3];
    if (year !== undefined && month !== undefined && day !== undefined) {
      const date = `${year}-${month}-${day}`;
      addAssertion(match[0], date, `${year}-${month}`, "day", {
        displayDate: date,
        rangeStart: date,
        rangeEnd: date,
      });
    }
  }

  for (const match of input.text.matchAll(
    /\b(January|February|March|April|May|June|July|August|September|Sept|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+((?:19|20)\d{2})\b/gi,
  )) {
    const month = MONTH_NUMBERS[(match[1] ?? "").toLowerCase()];
    const day = match[2];
    const year = match[3];
    if (month !== undefined && day !== undefined && year !== undefined) {
      const date = `${year}-${month}-${pad2(day)}`;
      addAssertion(match[0], date, `${year}-${month}`, "day", {
        displayDate: date,
        rangeStart: date,
        rangeEnd: date,
      });
    }
  }

  for (const match of input.text.matchAll(
    /\b(January|February|March|April|May|June|July|August|September|Sept|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+((?:19|20)\d{2})\b/gi,
  )) {
    const month = MONTH_NUMBERS[(match[1] ?? "").toLowerCase()];
    const year = match[2];
    if (month !== undefined && year !== undefined) {
      addAssertion(match[0], null, `${year}-${month}`, "month", {
        displayDate: `${year}-${month}`,
        rangeStart: `${year}-${month}`,
        rangeEnd: `${year}-${month}`,
      });
    }
  }

  for (const match of input.text.matchAll(
    /\b(Spring|Summer|Fall|Autumn|Winter)\s+((?:19|20)\d{2})\b/gi,
  )) {
    const season = SEASONS[(match[1] ?? "").toLowerCase()];
    const year = match[2];
    if (season !== undefined && year !== undefined) {
      const rangeStart =
        season.label === "Winter" ? `${year}-12` : `${year}-${season.rangeStartMonth}`;
      const rangeEnd =
        season.label === "Winter" ? `${Number(year) + 1}-02` : `${year}-${season.rangeEndMonth}`;
      addAssertion(match[0], null, null, "season", {
        displayDate: `${season.label} ${year}`,
        rangeStart,
        rangeEnd,
      });
    }
  }

  for (const match of input.text.matchAll(
    /\b((?:19|20)\d{2})\s*(?:[–-]|\/)\s*((?:19|20)\d{2})\b/g,
  )) {
    const startYear = match[1];
    const endYear = match[2];
    if (startYear !== undefined && endYear !== undefined) {
      addAssertion(match[0], null, null, "range", {
        displayDate: `${startYear}/${endYear}`,
        rangeStart: startYear,
        rangeEnd: endYear,
      });
    }
  }

  if (assertions.length === 0) {
    for (const match of input.text.matchAll(/\b((?:19|20)\d{2})\b/g)) {
      const year = match[1];
      if (year !== undefined) {
        addAssertion(match[0], null, null, "year", {
          displayDate: year,
          rangeStart: year,
          rangeEnd: year,
        });
      }
    }
  }

  if (assertions.length === 0 && /\b(tbd|to be determined|unknown)\b/i.test(input.text)) {
    addAssertion(
      input.text.match(/\b(tbd|to be determined|unknown)\b/i)?.[0] ?? "unknown",
      null,
      null,
      "unknown",
      {
        displayDate: "TBD",
        rangeStart: null,
        rangeEnd: null,
      },
    );
  }

  return assertions;
}

function assertionsFromSourceId(input: {
  candidateId: string;
  sourceId: string | null;
  surfaceKind: string;
}): CandidateDateAssertion[] {
  if (input.sourceId === null) return [];
  const match = input.sourceId.match(/(?:^|_)((?:19|20)\d{2})_(\d{2})_(\d{2})(?:_|$)/);
  if (match === null) return [];
  const year = match[1];
  const month = match[2];
  const day = match[3];
  if (year === undefined || month === undefined || day === undefined) return [];
  const rawText = `${year}_${month}_${day}`;
  const date = `${year}-${month}-${day}`;
  const dateAssertionId = dateAssertionIdFor({
    candidateId: input.candidateId,
    sourcePath: "sourceId",
    rawText,
    displayDate: date,
    date,
    month: `${year}-${month}`,
    rangeStart: date,
    rangeEnd: date,
    datePrecision: "day",
  });
  return [
    {
      dateAssertionRef: "",
      dateAssertionId,
      candidateId: input.candidateId,
      sourcePath: "sourceId",
      rawText,
      displayDate: date,
      date,
      month: `${year}-${month}`,
      rangeStart: date,
      rangeEnd: date,
      datePrecision: "day",
      dateRole: dateRoleFor({
        sourcePath: "sourceId",
        text: input.sourceId,
        surfaceKind: input.surfaceKind,
      }),
      confidence: "medium",
    },
  ];
}

function dateAssertionsForCandidate(input: {
  candidateId: string;
  surface: ConsumerSurfaceRow;
  fieldRows: ConsumerFieldRow[];
  payloadHints: PayloadHint[];
}): CandidateDateAssertion[] {
  const assertions = [
    ...assertionsFromText({
      candidateId: input.candidateId,
      sourcePath: "displayLabel",
      text: input.surface.displayLabel,
      surfaceKind: input.surface.surfaceKind,
    }),
    ...assertionsFromText({
      candidateId: input.candidateId,
      sourcePath: "rawText",
      text: input.surface.rawText,
      surfaceKind: input.surface.surfaceKind,
    }),
    ...assertionsFromSourceId({
      candidateId: input.candidateId,
      sourceId: input.surface.sourceId,
      surfaceKind: input.surface.surfaceKind,
    }),
    ...input.payloadHints.flatMap((hint) =>
      assertionsFromText({
        candidateId: input.candidateId,
        sourcePath: `canonicalPayload.${hint.path}`,
        text: hint.value,
        surfaceKind: input.surface.surfaceKind,
      }),
    ),
    ...input.fieldRows.flatMap((row) =>
      assertionsFromText({
        candidateId: input.candidateId,
        sourcePath: `fieldRows.${row.keyId}.rawValue`,
        text: row.rawValue,
        surfaceKind: input.surface.surfaceKind,
      }),
    ),
  ];
  const seen = new Set<string>();
  return assertions.filter((assertion) => {
    const key = [
      assertion.date,
      assertion.month,
      assertion.displayDate,
      assertion.rangeStart,
      assertion.rangeEnd,
      assertion.datePrecision,
      assertion.rawText.toLowerCase(),
      assertion.sourcePath,
    ].join("\u001f");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactFieldRow(row: ConsumerFieldRow): CurationFieldRow {
  return {
    keyId: row.keyId,
    rawValue: row.rawValue,
    canonicalLeafId: row.canonicalLeafId,
    canonicalLeafLabel: row.canonicalLeafLabel,
    coarseFamily: row.coarseFamily,
    sourceFieldPath: row.sourceFieldPath,
    targetPayloadPath: row.targetPayloadPath,
    modifiers: row.modifiers,
    supportIds: row.evidence.supportIds,
    evidencePointerIds: row.evidence.evidencePointerIds,
  };
}

function compactUnresolvedRow(row: ConsumerUnresolvedRow): CurationUnresolvedRow {
  return {
    keyId: row.keyId,
    rawValue: row.rawValue,
    decision: row.decision,
    reason: row.reason,
    coarseFamily: row.coarseFamily,
    sourceFieldPath: row.sourceFieldPath,
    targetPayloadPath: row.targetPayloadPath,
    modifiers: row.modifiers,
    supportIds: row.evidence.supportIds,
    evidencePointerIds: row.evidence.evidencePointerIds,
  };
}

function outputSchemaFor(routeId: string): TimelineOutputSchema {
  return {
    schemaVersion: 1,
    routeId,
    events: [
      {
        eventId: "route_timeline_event_stable_id",
        title: "Short public-facing event title",
        eventStatus: "needs_review",
        timelineLayer: "project_milestone",
        routeScope: "direct_route",
        summary: "One factual sentence about what the source says happened or was planned.",
        whyItMatters: "One sentence explaining why this belongs on the route timeline.",
        candidateRefs: ["c001"],
        dateAssertionRefs: ["c001.d1"],
        confidence: "medium",
        reviewNotes: [],
      },
    ],
    excludedCandidates: [
      {
        candidateRef: "c002",
        reason: "not_timeline_event",
        notes: "Short explanation.",
      },
    ],
  };
}

function llmPolicy(): string[] {
  return [
    "Curate and merge the provided candidates into a route timeline. Do not extract new standalone facts.",
    "Every event must cite one or more candidateRefs from this pack. Use compact refs such as c001, not the long candidateId.",
    "Prefer source-stated route/project/service/treatment milestones over general context, outreach notes, or metric-only statements.",
    "A metric or claim can support an event, but should not become a timeline event unless it is clearly a study/evaluation milestone.",
    "Do not turn planned/proposed language into implemented language.",
    "For performance/effect language from documents, phrase it as source-stated or source-reported. Do not treat official prose as an independently verified causal effect.",
    "Use dateAssertionRefs when dating events. Do not rewrite dates, months, or date precision in the output; the runner resolves those from refs.",
    "If route scope, status, or date is ambiguous, keep the event but mark confidence low and eventStatus needs_review.",
    "The runner hydrates source ids, page numbers, artifact paths, support ids, and evidence pointer ids from candidateRefs; do not rewrite those known values in the output.",
    "Use excludedCandidates for important duplicates, near-misses, conflicts, or tempting but rejected rows. Do not enumerate the whole unused tail.",
  ];
}

function filesystemGuidance(): string[] {
  return [
    "The JSON pack retains full candidate ids, artifact paths, audit paths, support ids, and evidence pointer ids for runner-owned tools and audit hydration.",
    "If a harness exposes filesystem tools, inspect by compact candidateRef/sourceRef and let the runner resolve the underlying path.",
    "Do not cite a filesystem-discovered fact unless it supports an existing candidateRef in this pack.",
  ];
}

function buildSourceRefs(candidates: RouteTimelineCandidate[]): RouteTimelineSourceRef[] {
  const refs = new Map<
    string,
    {
      sourceId: string;
      sourceTitle: string | null;
      sourceGroup: string | null;
      pageNumbers: Set<number>;
      candidateCount: number;
      evidencePointerIds: Set<string>;
      artifactPaths: Set<string>;
    }
  >();
  for (const candidate of candidates) {
    const sourceId = candidate.sourceId ?? "unknown_source";
    const ref = refs.get(sourceId) ?? {
      sourceId,
      sourceTitle: candidate.sourceTitle,
      sourceGroup: candidate.sourceGroup,
      pageNumbers: new Set<number>(),
      candidateCount: 0,
      evidencePointerIds: new Set<string>(),
      artifactPaths: new Set<string>(),
    };
    ref.candidateCount += 1;
    ref.sourceTitle = ref.sourceTitle ?? candidate.sourceTitle;
    ref.sourceGroup = ref.sourceGroup ?? candidate.sourceGroup;
    for (const page of candidate.pageNumbers) ref.pageNumbers.add(page);
    for (const pointerId of candidate.evidencePointerIds) ref.evidencePointerIds.add(pointerId);
    if (candidate.artifactPath.length > 0) ref.artifactPaths.add(candidate.artifactPath);
    refs.set(sourceId, ref);
  }
  return [...refs.values()]
    .map((ref) => ({
      sourceId: ref.sourceId,
      sourceTitle: ref.sourceTitle,
      sourceGroup: ref.sourceGroup,
      pageNumbers: [...ref.pageNumbers].sort((left, right) => left - right),
      candidateCount: ref.candidateCount,
      evidencePointerCount: ref.evidencePointerIds.size,
      artifactPaths: uniqueSorted([...ref.artifactPaths]).slice(0, 8),
    }))
    .sort(
      (left, right) =>
        right.candidateCount - left.candidateCount ||
        right.evidencePointerCount - left.evidencePointerCount ||
        left.sourceId.localeCompare(right.sourceId),
    )
    .map((ref, index) => ({
      sourceRef: compactRef("s", index),
      ...ref,
    }));
}

function candidateKindCounts(candidates: RouteTimelineCandidate[]) {
  return {
    timelinePrimaryCount: candidates.filter(
      (candidate) => candidate.candidateRole === "timeline_primary",
    ).length,
    timelineContextCount: candidates.filter(
      (candidate) => candidate.candidateRole === "timeline_context",
    ).length,
    treatmentCandidateCount: candidates.filter(
      (candidate) => candidate.candidateRole === "supporting_treatment",
    ).length,
    metricCandidateCount: candidates.filter(
      (candidate) => candidate.candidateRole === "supporting_metric",
    ).length,
    claimCandidateCount: candidates.filter(
      (candidate) => candidate.candidateRole === "supporting_claim",
    ).length,
    eventCandidateCount: candidates.filter(
      (candidate) => candidate.surfaceKind === "event_candidate",
    ).length,
    serviceChangeCandidateCount: candidates.filter(
      (candidate) => candidate.surfaceKind === "service_change_candidate",
    ).length,
  };
}

function buildPack(input: {
  route: string;
  consumerIndex: Tier2VocabConsumerIndexArtifact;
  consumerIndexPath: string;
  materializedViews: Tier2VocabMaterializedViewsArtifact | null;
  materializedViewsPath: string | null;
  generatedAt: string;
  maxCandidates: number;
  maxPayloadHints: number;
}): Tier2RouteTimelineCurationPackArtifact {
  const routeId = normalizeForRouteMatch(input.route);
  if (routeId === null) throw new Error(`Invalid route id: ${input.route}`);
  const routeAliases = routeAliasesFor(routeId);
  const aliasSet = new Set(
    routeAliases
      .map((alias) => normalizeForRouteMatch(alias))
      .filter((v): v is string => v !== null),
  );
  const targetBase = routeBase(routeId);
  const fieldsBySurface = new Map<string, ConsumerFieldRow[]>();
  const unresolvedBySurface = new Map<string, ConsumerUnresolvedRow[]>();
  for (const row of input.consumerIndex.fieldRows) {
    const rows = fieldsBySurface.get(row.surfaceId) ?? [];
    rows.push(row);
    fieldsBySurface.set(row.surfaceId, rows);
  }
  for (const row of input.consumerIndex.unresolvedRows) {
    const rows = unresolvedBySurface.get(row.surfaceId) ?? [];
    rows.push(row);
    unresolvedBySurface.set(row.surfaceId, rows);
  }

  const rankedCandidates = input.consumerIndex.surfaceRows
    .flatMap((surface): RouteTimelineCandidate[] => {
      const role = candidateRoleFor(surface);
      if (role === null) return [];
      const routeMatch = routeMatchFor(surface, aliasSet, targetBase);
      if (routeMatch === null) return [];
      const fieldRows = fieldsBySurface.get(surface.surfaceId) ?? [];
      const unresolvedRows = unresolvedBySurface.get(surface.surfaceId) ?? [];
      const evidencePointerIds = evidencePointerIdsFor({ surface, fieldRows, unresolvedRows });
      const supportIds = supportIdsFor({ fieldRows, unresolvedRows });
      const candidateId = candidateIdFor(routeId, surface.surfaceId);
      const payloadHints = collectPayloadHints(surface.canonicalPayload, input.maxPayloadHints);
      const score = candidateScore({
        surface,
        role,
        fieldRows,
        unresolvedRows,
        evidencePointerIds,
      });
      return [
        {
          candidateRef: candidateId,
          candidateId,
          surfaceId: surface.surfaceId,
          candidateRole: role,
          score,
          surfaceKind: surface.surfaceKind,
          payloadSchemaId: surface.payloadSchemaId,
          displayLabel: surface.displayLabel,
          rawText: surface.rawText,
          sourceId: surface.sourceId,
          sourceRef: sourceRefFor(surface.sourceId),
          sourceTitle: surface.sourceTitle,
          sourceGroup: surface.sourceGroup,
          pageNumbers: surface.pageNumbers,
          routeIds: surface.routeIds,
          routeMatch,
          intendedUses: surface.intendedUses,
          coarseFamilies: surface.coarseFamilies,
          mappedFieldCount: fieldRows.length,
          unresolvedFieldCount: unresolvedRows.length,
          evidencePointerIds,
          supportIds,
          artifactPath: surface.artifactPath,
          auditPath: surface.auditPath,
          canonicalPayload: surface.canonicalPayload,
          payloadHints,
          dateAssertions: dateAssertionsForCandidate({
            candidateId,
            surface,
            fieldRows,
            payloadHints,
          }),
          fieldRows: fieldRows.map(compactFieldRow),
          unresolvedRows: unresolvedRows.map(compactUnresolvedRow),
        },
      ];
    })
    .sort((left, right) => {
      const sourceCompare = (left.sourceId ?? "").localeCompare(right.sourceId ?? "");
      const leftFirstPage = left.pageNumbers[0] ?? Number.MAX_SAFE_INTEGER;
      const rightFirstPage = right.pageNumbers[0] ?? Number.MAX_SAFE_INTEGER;
      return (
        right.score - left.score ||
        sourceCompare ||
        leftFirstPage - rightFirstPage ||
        left.surfaceId.localeCompare(right.surfaceId)
      );
    })
    .slice(0, input.maxCandidates);

  const candidatesWithCandidateRefs = rankedCandidates.map((candidate, candidateIndex) => {
    const candidateRef = compactRef("c", candidateIndex);
    return {
      ...candidate,
      candidateRef,
      dateAssertions: candidate.dateAssertions.map((assertion, assertionIndex) => ({
        ...assertion,
        dateAssertionRef: `${candidateRef}.d${assertionIndex + 1}`,
      })),
    };
  });
  const sourceRefs = buildSourceRefs(candidatesWithCandidateRefs);
  const sourceRefBySourceId = new Map(
    sourceRefs.map((source) => [source.sourceId, source.sourceRef] as const),
  );
  const candidates = candidatesWithCandidateRefs.map((candidate) => ({
    ...candidate,
    sourceRef: sourceRefBySourceId.get(candidate.sourceId ?? "unknown_source") ?? "",
  }));
  const routeBundle =
    input.materializedViews?.routeEvidenceBundles.find((bundle) => {
      const normalized = normalizeForRouteMatch(bundle.routeId);
      return normalized !== null && aliasSet.has(normalized);
    }) ?? null;
  const evidencePointerIds = uniqueSorted(
    candidates.flatMap((candidate) => candidate.evidencePointerIds),
  );
  const dateAssertionCount = candidates.reduce(
    (count, candidate) => count + candidate.dateAssertions.length,
    0,
  );
  const counts = candidateKindCounts(candidates);

  return {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    routeId,
    routeAliases,
    sourceConsumerIndexPath: input.consumerIndexPath,
    sourceMaterializedViewsPath: input.materializedViewsPath,
    summary: {
      candidateCount: candidates.length,
      ...counts,
      sourceCount: sourceRefs.length,
      evidencePointerCount: evidencePointerIds.length,
      dateAssertionCount,
      candidatesWithDateAssertionCount: candidates.filter(
        (candidate) => candidate.dateAssertions.length > 0,
      ).length,
      candidatesWithEvidencePointerCount: candidates.filter(
        (candidate) => candidate.evidencePointerIds.length > 0,
      ).length,
      candidatesWithArtifactPathCount: candidates.filter(
        (candidate) => candidate.artifactPath.length > 0,
      ).length,
      routeBundleSurfaceCount: routeBundle?.surfaceCount ?? null,
      routeBundleTimelineCandidateSurfaceCount: routeBundle?.timelineCandidateSurfaceCount ?? null,
    },
    llmTask: {
      objective: "curate_route_timeline",
      policy: llmPolicy(),
      filesystemGuidance: filesystemGuidance(),
      outputSchema: outputSchemaFor(routeId),
    },
    sourceRefs,
    candidates,
  };
}

function escapeCell(value: unknown): string {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .trim();
}

function truncate(value: string | null, max: number): string {
  if (value === null || value.length <= max) return value ?? "";
  return `${value.slice(0, Math.max(0, max - 1))}...`;
}

function renderFieldRows(rows: CurationFieldRow[]): string[] {
  if (rows.length === 0) return ["  fields: []"];
  return rows.slice(0, 12).map((row) => {
    const label = row.canonicalLeafLabel === null ? row.canonicalLeafId : row.canonicalLeafLabel;
    return `  field: ${row.keyId} raw=${JSON.stringify(row.rawValue)} canonical=${JSON.stringify(label)} family=${row.coarseFamily}`;
  });
}

function renderPayloadHints(hints: PayloadHint[]): string[] {
  if (hints.length === 0) return ["  payloadHints: []"];
  return hints.map((hint) => `  payloadHint: ${hint.path}=${JSON.stringify(hint.value)}`);
}

function renderDateAssertions(assertions: CandidateDateAssertion[]): string[] {
  if (assertions.length === 0) return ["  dateAssertions: []"];
  return assertions.map((assertion) => {
    const value = assertion.displayDate ?? assertion.date ?? assertion.month ?? assertion.rawText;
    return `  dateAssertion: ${assertion.dateAssertionRef} value=${value} precision=${assertion.datePrecision} role=${assertion.dateRole} source=${assertion.sourcePath} raw=${JSON.stringify(assertion.rawText)}`;
  });
}

function renderMarkdown(artifact: Tier2RouteTimelineCurationPackArtifact): string {
  const lines: string[] = [];
  lines.push(`# Route Timeline Curation Pack: ${artifact.routeId}`);
  lines.push("");
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push(`Artifact kind: ${artifact.artifactKind}`);
  lines.push("");
  lines.push("## Task");
  lines.push("");
  lines.push("Curate these source-grounded candidates into a route timeline review artifact.");
  lines.push("");
  lines.push("### Policy");
  lines.push("");
  for (const item of artifact.llmTask.policy) lines.push(`- ${item}`);
  lines.push("");
  lines.push("### Filesystem Guidance");
  lines.push("");
  for (const item of artifact.llmTask.filesystemGuidance) lines.push(`- ${item}`);
  lines.push("");
  lines.push("### Output Schema");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(artifact.llmTask.outputSchema, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Candidates: ${artifact.summary.candidateCount}`);
  lines.push(`- Timeline primary: ${artifact.summary.timelinePrimaryCount}`);
  lines.push(`- Treatments: ${artifact.summary.treatmentCandidateCount}`);
  lines.push(`- Metrics: ${artifact.summary.metricCandidateCount}`);
  lines.push(`- Claims: ${artifact.summary.claimCandidateCount}`);
  lines.push(`- Sources: ${artifact.summary.sourceCount}`);
  lines.push(`- Evidence pointers: ${artifact.summary.evidencePointerCount}`);
  lines.push(`- Date assertions: ${artifact.summary.dateAssertionCount}`);
  lines.push(
    `- Route bundle surfaces: ${artifact.summary.routeBundleSurfaceCount ?? "not provided"}`,
  );
  lines.push("");
  lines.push("## Sources");
  lines.push("");
  lines.push("| Ref | Title | Pages | Candidates | Evidence pointers |");
  lines.push("|---|---|---:|---:|---:|");
  for (const source of artifact.sourceRefs) {
    lines.push(
      `| ${escapeCell(source.sourceRef)} | ${escapeCell(source.sourceTitle)} | ${escapeCell(
        source.pageNumbers.join(","),
      )} | ${source.candidateCount} | ${source.evidencePointerCount} |`,
    );
  }
  lines.push("");
  lines.push("## Candidate Index");
  lines.push("");
  lines.push("| Ref | Role | Score | Kind | Date refs | Source | Pages | Label |");
  lines.push("|---|---|---:|---|---:|---|---:|---|");
  for (const candidate of artifact.candidates) {
    lines.push(
      `| ${candidate.candidateRef} | ${candidate.candidateRole} | ${candidate.score} | ${candidate.surfaceKind} | ${escapeCell(
        candidate.dateAssertions.map((assertion) => assertion.dateAssertionRef).join(","),
      )} | ${escapeCell(
        candidate.sourceRef,
      )} | ${escapeCell(candidate.pageNumbers.join(","))} | ${escapeCell(candidate.displayLabel)} |`,
    );
  }
  lines.push("");
  lines.push("## Candidate Details");
  for (const candidate of artifact.candidates) {
    lines.push("");
    lines.push(`### ${candidate.candidateRef}`);
    lines.push("");
    lines.push(`role: ${candidate.candidateRole}`);
    lines.push(`score: ${candidate.score}`);
    lines.push(`surfaceKind: ${candidate.surfaceKind}`);
    lines.push(`source: ${candidate.sourceRef} pages=${candidate.pageNumbers.join(",")}`);
    lines.push(`routeMatch: ${candidate.routeMatch} routeIds=${candidate.routeIds.join(",")}`);
    lines.push(`intendedUses: ${candidate.intendedUses.join(",")}`);
    lines.push(`coarseFamilies: ${candidate.coarseFamilies.join(",")}`);
    lines.push(`displayLabel: ${truncate(candidate.displayLabel, 260)}`);
    lines.push(`rawText: ${truncate(candidate.rawText, 520)}`);
    for (const row of renderDateAssertions(candidate.dateAssertions)) lines.push(row);
    for (const row of renderPayloadHints(candidate.payloadHints)) lines.push(row);
    for (const row of renderFieldRows(candidate.fieldRows)) lines.push(row);
    if (candidate.unresolvedRows.length > 0) {
      for (const row of candidate.unresolvedRows.slice(0, 8)) {
        lines.push(
          `  unresolved: ${row.keyId} raw=${JSON.stringify(row.rawValue)} decision=${row.decision} reason=${JSON.stringify(
            row.reason,
          )}`,
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function buildRouteTimelineCurationPack(
  args: BuildRouteTimelineCurationPackArgs,
): Promise<Tier2RouteTimelineCurationPackArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const consumerIndexPath = fromCliPath(args.consumerIndexPath);
  const consumerIndex = (await Bun.file(
    consumerIndexPath,
  ).json()) as Tier2VocabConsumerIndexArtifact;
  if (!Array.isArray(consumerIndex.surfaceRows)) {
    throw new Error(`Consumer index has no surfaceRows array: ${consumerIndexPath}`);
  }
  const materializedViewsPath =
    args.materializedViewsPath === undefined ? null : fromCliPath(args.materializedViewsPath);
  const materializedViews =
    materializedViewsPath === null
      ? null
      : ((await Bun.file(materializedViewsPath).json()) as Tier2VocabMaterializedViewsArtifact);
  return buildPack({
    route: args.route,
    consumerIndex,
    consumerIndexPath,
    materializedViews,
    materializedViewsPath,
    generatedAt,
    maxCandidates: args.maxCandidates ?? 180,
    maxPayloadHints: args.maxPayloadHints ?? 24,
  });
}

function defaultOutputPath(route: string): string {
  const normalized = normalizeForRouteMatch(route) ?? route;
  const routeSlug = normalized
    .toLowerCase()
    .replaceAll("+", "plus")
    .replace(/[^a-z0-9_-]/g, "-");
  return join(
    defaultArtifactRootPath(),
    "docs",
    "tier2-route-timeline-curation-packs",
    routeSlug,
    "route-timeline-curation-pack.json",
  );
}

export async function runRouteTimelineCurationPack(
  args: BuildRouteTimelineCurationPackArgs,
): Promise<{
  artifact: Tier2RouteTimelineCurationPackArtifact;
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
}> {
  const artifact = await buildRouteTimelineCurationPack(args);
  const outputPath = fromCliPath(args.outputPath ?? defaultOutputPath(args.route));
  const markdownPath =
    args.markdownPath === undefined
      ? outputPath.replace(/\.json$/, ".md")
      : fromCliPath(args.markdownPath);
  const summaryPath =
    args.summaryPath === undefined
      ? outputPath.replace(/\.json$/, "-summary.json")
      : fromCliPath(args.summaryPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  await Bun.write(markdownPath, renderMarkdown(artifact));
  await writeJson(summaryPath, {
    artifactKind: SUMMARY_KIND,
    schemaVersion: 1,
    generatedAt: artifact.generatedAt,
    sourceArtifactPath: outputPath,
    summary: artifact.summary,
  });
  return { artifact, outputPath, markdownPath, summaryPath };
}

function parseNonNegativeInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`${flag} requires a non-negative integer.`);
  return parsed;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--route") {
      if (value === undefined) throw new Error("--route requires a value.");
      args.route = value;
      index += 1;
    } else if (arg === "--consumer-index") {
      if (value === undefined) throw new Error("--consumer-index requires a value.");
      args.consumerIndexPath = value;
      index += 1;
    } else if (arg === "--materialized-views") {
      if (value === undefined) throw new Error("--materialized-views requires a value.");
      args.materializedViewsPath = value;
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
    } else if (arg === "--max-candidates") {
      if (value === undefined) throw new Error("--max-candidates requires a value.");
      args.maxCandidates = parseNonNegativeInteger(value, "--max-candidates");
      index += 1;
    } else if (arg === "--max-payload-hints") {
      if (value === undefined) throw new Error("--max-payload-hints requires a value.");
      args.maxPayloadHints = parseNonNegativeInteger(value, "--max-payload-hints");
      index += 1;
    } else {
      throw new Error(`Unknown docs tier2 route-timeline-curation-pack option: ${arg}`);
    }
  }
  return args;
}

export async function runRouteTimelineCurationPackFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.route === undefined) throw new Error("Provide --route.");
  if (args.consumerIndexPath === undefined) throw new Error("Provide --consumer-index.");
  const result = await runRouteTimelineCurationPack({
    route: args.route,
    consumerIndexPath: args.consumerIndexPath,
    ...(args.materializedViewsPath === undefined
      ? {}
      : { materializedViewsPath: args.materializedViewsPath }),
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
    ...(args.maxCandidates === undefined ? {} : { maxCandidates: args.maxCandidates }),
    ...(args.maxPayloadHints === undefined ? {} : { maxPayloadHints: args.maxPayloadHints }),
  });
  console.log(
    `route-timeline-curation-pack: route=${result.artifact.routeId} candidates=${result.artifact.summary.candidateCount} sources=${result.artifact.summary.sourceCount}`,
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
