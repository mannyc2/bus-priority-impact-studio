import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import type { ToolCallMessage } from "../../../lib/llm.ts";
import {
  callPioneerToolCallDirect,
  openRouterErrorMessage,
} from "./_llm-clients.ts";
import {
  defaultFetch,
  extractToolCallArguments,
  latestDocsRunId,
  missingToolCallErrorMessage,
  parseCliOptions,
  runArtifactRoot,
  trueOption,
  type CliOption,
  type FetchLike,
} from "./_shared.ts";

const PROMPT_VERSION = "tier2-normalization-workbench-v1";
const TOOL_NAME = "submit_tier2_normalization_rules";
const DEFAULT_MODEL = "claude-opus-4-5";
const DEFAULT_MAX_TOKENS = 6_000;
const DEFAULT_GROUP_COUNT = 32;
const DEFAULT_EXAMPLES_PER_GROUP = 5;

type CandidateType =
  | "entity"
  | "metric"
  | "event"
  | "table"
  | "claim"
  | "context_signal"
  | "review_question";

type EvidenceRef = {
  blockId: string;
  pageNumber: number;
  lineStart: number;
  lineEnd: number;
  blockHash?: string;
  roleRaw?: string;
};

type NormalizedCandidateRow = {
  rowId: string;
  inputLabel?: string;
  extractionId?: string;
  sourceId: string;
  sourceTitle: string;
  sourceGroup: string;
  pageNumbers: number[];
  candidateType: CandidateType;
  candidateId: string;
  canonicalFamily: string;
  rawFamily: string;
  displayLabel: string;
  clusterKey: string;
  evidenceRefs: EvidenceRef[];
  rawCandidate: unknown;
};

type NormalizedCandidatesArtifact = {
  version: number;
  generatedAt: string;
  rowCount: number;
  summary: unknown;
  rows: NormalizedCandidateRow[];
};

type CandidateGroup = {
  groupId: string;
  candidateType: CandidateType;
  canonicalFamily: string;
  rawFamily: string;
  count: number;
  sourceCount: number;
  clusterCount: number;
  hazardTags: string[];
  sampleRows: Array<{
    rowId: string;
    sourceId: string;
    sourceGroup: string;
    pageNumbers: number[];
    displayLabel: string;
    evidenceRefs: EvidenceRef[];
    rawCandidateSummary: Record<string, unknown>;
  }>;
};

type RuleAction =
  | "annotate"
  | "split_family"
  | "suppress"
  | "denormalize_surface"
  | "needs_review";

type NormalizationRule = {
  ruleId: string;
  source: "builtin" | "model";
  status: "approved_seed" | "proposed";
  action: RuleAction;
  candidateType: CandidateType | "any";
  match: {
    canonicalFamily?: string;
    rawFamilyIncludes?: string[];
    labelIncludes?: string[];
    hazardTags?: string[];
  };
  output: {
    targetSurface?: string;
    normalizedFamily?: string;
    fields?: Record<string, string | number | boolean | null>;
  };
  confidence: number;
  rationale: string;
  sampleGroupIds: string[];
};

type ModelRuleResponse = {
  rules: NormalizationRule[];
  reviewQuestions: Array<{
    question: string;
    reason: string;
    sampleGroupIds: string[];
  }>;
  denormalizedSurfaces: Array<{
    surfaceName: string;
    purpose: string;
    requiredFields: string[];
  }>;
};

export type Tier2NormalizationWorkbenchArtifact = {
  version: 1;
  generatedAt: string;
  promptVersion: string;
  sourceNormalizedCandidatesPath: string;
  provider: "pioneer" | null;
  model: string | null;
  execute: boolean;
  summary: {
    inputRows: number;
    groupCount: number;
    selectedGroupCount: number;
    builtinRuleCount: number;
    modelRuleCount: number;
    reviewQuestionCount: number;
  };
  groups: CandidateGroup[];
  builtinRules: NormalizationRule[];
  modelRules: NormalizationRule[];
  reviewQuestions: ModelRuleResponse["reviewQuestions"];
  denormalizedSurfaces: ModelRuleResponse["denormalizedSurfaces"];
  requestArtifactKey: string | null;
  responseArtifactKey: string | null;
  toolCallArtifactKey: string | null;
  errorArtifactKey: string | null;
  rawUsage: unknown | null;
};

type AppliedRowBase = {
  rowId: string;
  sourceId: string;
  sourceGroup: string;
  pageNumbers: number[];
  displayLabel: string;
  canonicalFamily: string;
  rawFamily: string;
  evidenceRefs: EvidenceRef[];
  appliedRuleIds: string[];
  reviewReasons: string[];
};

export type Tier2NormalizationAppliedArtifact = {
  version: 1;
  generatedAt: string;
  sourceNormalizedCandidatesPath: string;
  sourceWorkbenchPath: string;
  summary: {
    inputRows: number;
    appliedApprovedRuleCount: number;
    surfaceCounts: Record<string, number>;
    reviewQueueCount: number;
    unresolvedGroupCount: number;
    unresolvedRowCount: number;
  };
  surfaces: {
    documentMetricClaims: Array<AppliedRowBase & {
      metricSource: string;
      metricTruthStatus: string;
      valuePrecision: string;
      geographyScope: string;
      measurementMethodology: string;
    }>;
    documentEntities: Array<AppliedRowBase & { entityMode: string }>;
    documentInterventionEvents: Array<AppliedRowBase & {
      implementationStatus: string;
      dateResolution: string;
    }>;
    documentTables: Array<AppliedRowBase & { refinedTableFamily: string }>;
    documentClaims: Array<AppliedRowBase & { causalClaimFlag: boolean; claimBasis: string }>;
    sourceGapQueue: Array<AppliedRowBase & { queueReason: string }>;
  };
  unresolvedGroups: Array<{
    groupId: string;
    candidateType: CandidateType;
    canonicalFamily: string;
    rawFamily: string;
    count: number;
    reasons: string[];
  }>;
};

export type RunTier2NormalizationWorkbenchArgs = {
  normalizedCandidatesPath: string;
  outputPath?: string;
  batchOutputPath?: string;
  appliedOutputPath?: string;
  markdownPath?: string;
  generatedAt?: string;
  groupCount?: number;
  examplesPerGroup?: number;
  execute?: boolean;
  model?: string;
  maxTokens?: number;
  pioneerApiKey?: string;
  fetcher?: FetchLike;
};

type CliArgs = {
  normalizedCandidatesPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  batchOutputPath?: string;
  appliedOutputPath?: string;
  markdownPath?: string;
  groupCount?: number;
  examplesPerGroup?: number;
  execute?: boolean;
  model?: string;
  maxTokens?: number;
};

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function compact(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function includesAny(text: string, needles: string[]): boolean {
  const compacted = compact(text);
  return needles.some((needle) => compacted.includes(needle));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: unknown, key: string): string {
  const field = asRecord(value)[key];
  return typeof field === "string" ? field : "";
}

function rawCandidateText(row: NormalizedCandidateRow): string {
  const raw = asRecord(row.rawCandidate);
  return [
    row.displayLabel,
    row.rawFamily,
    row.canonicalFamily,
    stringField(raw, "labelRaw"),
    stringField(raw, "subjectRaw"),
    stringField(raw, "geographyRaw"),
    stringField(raw, "periodRaw"),
    stringField(raw, "comparisonRaw"),
    stringField(raw, "statusRaw"),
    stringField(raw, "dateRaw"),
    stringField(raw, "claimText"),
    stringField(raw, "tableKindRaw"),
    stringField(raw, "titleRaw"),
  ].join(" ");
}

function rawCandidateSummary(row: NormalizedCandidateRow): Record<string, unknown> {
  const raw = asRecord(row.rawCandidate);
  const keys = [
    "labelRaw",
    "valueRaw",
    "unitRaw",
    "subjectRaw",
    "geographyRaw",
    "periodRaw",
    "comparisonRaw",
    "directionRaw",
    "statusRaw",
    "dateRaw",
    "locationRaw",
    "claimText",
    "claimKindRaw",
    "tableKindRaw",
    "titleRaw",
    "headerTextsRaw",
    "rawText",
    "rawKind",
    "kindHint",
  ];
  return Object.fromEntries(keys.flatMap((key) => {
    const value = raw[key];
    if (value === undefined || value === null || value === "") return [];
    if (Array.isArray(value)) return [[key, value.slice(0, 8)]];
    if (typeof value === "object") return [];
    return [[key, value]];
  }));
}

function hazardTagsForGroup(rows: NormalizedCandidateRow[]): string[] {
  const joined = rows.slice(0, 100).map(rawCandidateText).join(" ");
  const first = rows[0];
  if (first === undefined) return [];
  const tags = new Set<string>();
  if (first.canonicalFamily.startsWith("other")) tags.add("unresolved_family");
  if (first.candidateType === "metric") {
    tags.add("document_metric_claim");
    if (includesAny(joined, ["~", "approx", "approximately", "about"])) tags.add("approximate_value");
    if (includesAny(joined, ["faster", "improvement", "improved", "reduced", "increase", "decrease"])) {
      tags.add("change_metric");
    }
    if (!includesAny(joined, ["201", "202", "before", "after", "pre", "post", "baseline"])) {
      tags.add("weak_period");
    }
  }
  if (first.candidateType === "entity") {
    if (
      first.canonicalFamily === "transit_line" ||
      first.canonicalFamily === "rail_service" ||
      includesAny(joined, ["subway", "lirr", "path", "nj transit", "amtrak", "station"])
    ) {
      tags.add("rail_or_subway_context");
    }
    if (first.canonicalFamily === "bus_route" && includesAny(joined, ["subway", "rail", "station"])) {
      tags.add("bus_rail_mode_conflict");
    }
  }
  if (first.candidateType === "event") {
    tags.add("status_gate_required");
    if (includesAny(joined, ["proposed", "proposal", "planned", "planning", "design"])) {
      tags.add("proposal_or_planning");
    }
    if (includesAny(joined, ["completed", "implemented", "launched", "opened"])) {
      tags.add("implemented_language");
    }
  }
  if (first.candidateType === "table") {
    if (includesAny(joined, ["map", "legend"])) tags.add("map_legend_or_noise");
    if (includesAny(joined, ["before", "after", "pre", "post", "2018", "2019", "2020"])) {
      tags.add("comparison_table");
    }
    if (includesAny(joined, ["ridership", "boarding", "alighting", "stop"])) {
      tags.add("stop_or_ridership_table");
    }
  }
  if (first.candidateType === "claim") {
    if (isCausalClaim(joined)) tags.add("causal_claim_gate");
    if (includesAny(joined, ["expected", "projected", "will", "would", "promise"])) {
      tags.add("projected_or_expected_claim");
    }
  }
  return [...tags].sort();
}

function groupScore(group: CandidateGroup): number {
  let score = Math.min(group.count, 2_000);
  if (group.hazardTags.length > 0) score += 50_000;
  for (const tag of group.hazardTags) {
    if (tag === "unresolved_family") score += 10_000;
    else if (tag === "bus_rail_mode_conflict") score += 8_000;
    else if (tag === "causal_claim_gate") score += 5_000;
    else if (tag === "status_gate_required") score += 4_000;
    else if (tag === "document_metric_claim") score += 2_000;
    else score += 500;
  }
  return score;
}

function selectCandidateGroups(groups: CandidateGroup[], groupCount: number): CandidateGroup[] {
  const selected: CandidateGroup[] = [];
  const deferred: CandidateGroup[] = [];
  const typeCounts = new Map<CandidateType, number>();
  const typeCap = Math.max(2, Math.ceil(groupCount / 5));
  for (const group of groups) {
    const typeCount = typeCounts.get(group.candidateType) ?? 0;
    if (typeCount < typeCap) {
      selected.push(group);
      typeCounts.set(group.candidateType, typeCount + 1);
    } else {
      deferred.push(group);
    }
    if (selected.length >= groupCount) return selected;
  }
  for (const group of deferred) {
    selected.push(group);
    if (selected.length >= groupCount) break;
  }
  return selected;
}

function buildCandidateGroups(rows: NormalizedCandidateRow[], input: {
  groupCount: number;
  examplesPerGroup: number;
}): CandidateGroup[] {
  const grouped = new Map<string, NormalizedCandidateRow[]>();
  for (const row of rows) {
    const key = `${row.candidateType}|${row.canonicalFamily}|${compact(row.rawFamily)}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }
  const groups = [...grouped.entries()]
    .map(([key, bucket]) => {
      const first = bucket[0];
      if (first === undefined) throw new Error(`Empty group for ${key}`);
      const sourceIds = new Set(bucket.map((row) => row.sourceId));
      const clusterKeys = new Set(bucket.map((row) => row.clusterKey));
      const hazardTags = hazardTagsForGroup(bucket);
      return {
        groupId: `group_${shortHash(key)}`,
        candidateType: first.candidateType,
        canonicalFamily: first.canonicalFamily,
        rawFamily: first.rawFamily,
        count: bucket.length,
        sourceCount: sourceIds.size,
        clusterCount: clusterKeys.size,
        hazardTags,
        sampleRows: bucket.slice(0, input.examplesPerGroup).map((row) => ({
          rowId: row.rowId,
          sourceId: row.sourceId,
          sourceGroup: row.sourceGroup,
          pageNumbers: row.pageNumbers,
          displayLabel: row.displayLabel,
          evidenceRefs: row.evidenceRefs.slice(0, 4),
          rawCandidateSummary: rawCandidateSummary(row),
        })),
      } satisfies CandidateGroup;
    })
    .sort((left, right) => groupScore(right) - groupScore(left) || left.groupId.localeCompare(right.groupId));
  return selectCandidateGroups(groups, input.groupCount);
}

function builtinRules(groups: CandidateGroup[]): NormalizationRule[] {
  return [
    {
      ruleId: "builtin_metric_document_claim_default",
      source: "builtin",
      status: "approved_seed",
      action: "denormalize_surface",
      candidateType: "metric",
      match: {},
      output: {
        targetSurface: "documentMetricClaims",
        fields: {
          metricSource: "document_claimed",
          metricTruthStatus: "not_deterministic_project_metric",
        },
      },
      confidence: 0.95,
      rationale: "Tier 2 documents provide source claims; deterministic analytics remain metric truth.",
      sampleGroupIds: groups.filter((group) => group.candidateType === "metric").slice(0, 5).map((group) => group.groupId),
    },
    {
      ruleId: "builtin_entity_mode_split",
      source: "builtin",
      status: "approved_seed",
      action: "annotate",
      candidateType: "entity",
      match: {},
      output: { targetSurface: "documentEntities" },
      confidence: 0.9,
      rationale: "Bus routes, subway lines, rail services, and stations are all useful but must not share one route namespace.",
      sampleGroupIds: groups.filter((group) => group.candidateType === "entity").slice(0, 5).map((group) => group.groupId),
    },
    {
      ruleId: "builtin_event_status_gate",
      source: "builtin",
      status: "approved_seed",
      action: "annotate",
      candidateType: "event",
      match: {},
      output: { targetSurface: "documentInterventionEvents" },
      confidence: 0.85,
      rationale: "Event rows must carry proposal/planning/implementation status before feeding intervention panels.",
      sampleGroupIds: groups.filter((group) => group.candidateType === "event").slice(0, 5).map((group) => group.groupId),
    },
    {
      ruleId: "builtin_claim_causal_gate",
      source: "builtin",
      status: "approved_seed",
      action: "annotate",
      candidateType: "claim",
      match: { hazardTags: ["causal_claim_gate"] },
      output: { targetSurface: "documentClaims", fields: { causalClaimFlag: true } },
      confidence: 0.8,
      rationale: "Documents may assert effects, but causal language must be review-gated.",
      sampleGroupIds: groups.filter((group) => group.hazardTags.includes("causal_claim_gate")).slice(0, 5).map((group) => group.groupId),
    },
    {
      ruleId: "builtin_table_family_refinement",
      source: "builtin",
      status: "approved_seed",
      action: "split_family",
      candidateType: "table",
      match: {},
      output: { targetSurface: "documentTables" },
      confidence: 0.8,
      rationale: "Map legends, stop-ridership tables, and before/after comparisons have different downstream uses.",
      sampleGroupIds: groups.filter((group) => group.candidateType === "table").slice(0, 5).map((group) => group.groupId),
    },
    {
      ruleId: "builtin_review_unresolved_family",
      source: "builtin",
      status: "approved_seed",
      action: "needs_review",
      candidateType: "any",
      match: { hazardTags: ["unresolved_family"] },
      output: { targetSurface: "sourceGapQueue" },
      confidence: 0.9,
      rationale: "The long tail remains reviewable instead of being silently coerced.",
      sampleGroupIds: groups.filter((group) => group.hazardTags.includes("unresolved_family")).slice(0, 5).map((group) => group.groupId),
    },
  ];
}

function precisionFromMetric(row: NormalizedCandidateRow): string {
  const text = rawCandidateText(row);
  if (includesAny(text, ["~", "approx", "approximately", "about"])) return "approximate";
  if (includesAny(text, ["-", " to ", "range"])) return "range";
  return "exact_or_reported";
}

function geographyScope(row: NormalizedCandidateRow): string {
  const text = rawCandidateText(row);
  if (includesAny(text, ["citywide", "new york city", "nyc bus"])) return "citywide";
  if (includesAny(text, ["bronx", "manhattan", "brooklyn", "queens", "staten island"])) return "borough";
  if (includesAny(text, ["stop", "station"])) return "stop";
  if (includesAny(text, ["route", "m15", "m14", "bx", "b41", "q"])) return "route";
  if (includesAny(text, ["corridor", "street", "avenue", "road"])) return "corridor";
  return "unknown";
}

function measurementMethodology(row: NormalizedCandidateRow): string {
  const text = rawCandidateText(row);
  if (includesAny(text, ["survey", "satisfaction"])) return "survey";
  if (includesAny(text, ["gps", "bus time", "avl"])) return "gps_or_avl";
  if (includesAny(text, ["apc", "passenger counter", "ridership"])) return "apc_or_ridership_system";
  if (includesAny(text, ["chart", "figure"])) return "chart_estimate";
  return "unspecified_document_method";
}

function entityMode(row: NormalizedCandidateRow): string {
  const text = rawCandidateText(row);
  if (row.canonicalFamily === "bus_route") return "bus_route";
  if (row.canonicalFamily === "rail_service") return "rail_service";
  if (row.canonicalFamily === "station") return "station";
  if (includesAny(text, ["subway", "train", "station"])) return "subway_or_station";
  if (includesAny(text, ["lirr", "path", "nj transit", "amtrak", "rail"])) return "rail_service";
  if (row.canonicalFamily === "transit_line") return "transit_line_ambiguous";
  return "non_route_entity";
}

function dateResolution(row: NormalizedCandidateRow): string {
  const raw = asRecord(row.rawCandidate);
  const text = `${stringField(raw, "dateRaw")} ${row.displayLabel}`;
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(text)) return "exact";
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/i.test(text)) return "exact";
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i.test(text)) return "month";
  if (/\b\d{4}\s*[-–]\s*\d{4}\b/.test(text)) return "range";
  if (/\b\d{4}\b/.test(text)) return "year";
  if (includesAny(text, ["before", "after", "prior", "currently", "future"])) return "relative";
  return "unknown";
}

function implementationStatus(row: NormalizedCandidateRow): string {
  const text = rawCandidateText(row);
  if (includesAny(text, ["cancelled", "canceled", "removed"])) return "cancelled";
  if (includesAny(text, ["proposed", "proposal"])) return "proposed";
  if (includesAny(text, ["planning", "planned", "design"])) return "planned";
  if (includesAny(text, ["underway", "construction", "installing"])) return "in_progress";
  if (includesAny(text, ["completed", "implemented", "launched", "opened", "in service"])) return "completed";
  return "unknown";
}

function isCausalClaim(text: string): boolean {
  return includesAny(text, [
    "caused",
    "led to",
    "resulted",
    "translated into",
    "because",
    "due to",
    "attributed",
    "effect",
    "impact",
  ]);
}

function claimBasis(row: NormalizedCandidateRow): string {
  const text = rawCandidateText(row);
  if (includesAny(text, ["expected", "projected", "will", "would"])) return "projected";
  if (isCausalClaim(text)) return "attributed";
  return "descriptive";
}

function refinedTableFamily(row: NormalizedCandidateRow): string {
  const text = rawCandidateText(row);
  if (includesAny(text, ["map", "legend"])) return "map_legend";
  if (includesAny(text, ["boarding", "alighting", "ridership", "stop"])) return "stop_or_ridership_table";
  if (includesAny(text, ["before", "after", "pre", "post", "2018", "2019", "2020"])) return "before_after_comparison";
  return row.canonicalFamily;
}

function baseApplied(row: NormalizedCandidateRow, appliedRuleIds: string[], reviewReasons: string[]): AppliedRowBase {
  return {
    rowId: row.rowId,
    sourceId: row.sourceId,
    sourceGroup: row.sourceGroup,
    pageNumbers: row.pageNumbers,
    displayLabel: row.displayLabel,
    canonicalFamily: row.canonicalFamily,
    rawFamily: row.rawFamily,
    evidenceRefs: row.evidenceRefs,
    appliedRuleIds,
    reviewReasons,
  };
}

function reviewReasonsFor(row: NormalizedCandidateRow): string[] {
  const reasons: string[] = [];
  if (row.canonicalFamily.startsWith("other")) reasons.push("unresolved_family");
  if (row.candidateType === "entity" && entityMode(row).includes("ambiguous")) {
    reasons.push("ambiguous_transit_mode");
  }
  if (row.candidateType === "event" && implementationStatus(row) === "unknown") {
    reasons.push("event_status_unknown");
  }
  if (row.candidateType === "event" && dateResolution(row) === "unknown") {
    reasons.push("event_date_unknown");
  }
  if (row.candidateType === "metric" && geographyScope(row) === "unknown") {
    reasons.push("metric_geography_scope_unknown");
  }
  if (row.candidateType === "claim" && isCausalClaim(rawCandidateText(row))) {
    reasons.push("causal_claim_needs_review");
  }
  return reasons;
}

function applySeedRules(input: {
  rows: NormalizedCandidateRow[];
  workbenchPath: string;
  sourceNormalizedCandidatesPath: string;
  generatedAt: string;
  rules: NormalizationRule[];
  groups: CandidateGroup[];
}): Tier2NormalizationAppliedArtifact {
  const approvedRuleIds = input.rules.filter((rule) => rule.status === "approved_seed").map((rule) => rule.ruleId);
  const surfaces: Tier2NormalizationAppliedArtifact["surfaces"] = {
    documentMetricClaims: [],
    documentEntities: [],
    documentInterventionEvents: [],
    documentTables: [],
    documentClaims: [],
    sourceGapQueue: [],
  };

  for (const row of input.rows) {
    const reviewReasons = reviewReasonsFor(row);
    if (row.candidateType === "metric") {
      surfaces.documentMetricClaims.push({
        ...baseApplied(row, ["builtin_metric_document_claim_default"], reviewReasons),
        metricSource: "document_claimed",
        metricTruthStatus: "not_deterministic_project_metric",
        valuePrecision: precisionFromMetric(row),
        geographyScope: geographyScope(row),
        measurementMethodology: measurementMethodology(row),
      });
    } else if (row.candidateType === "entity") {
      surfaces.documentEntities.push({
        ...baseApplied(row, ["builtin_entity_mode_split"], reviewReasons),
        entityMode: entityMode(row),
      });
    } else if (row.candidateType === "event") {
      surfaces.documentInterventionEvents.push({
        ...baseApplied(row, ["builtin_event_status_gate"], reviewReasons),
        implementationStatus: implementationStatus(row),
        dateResolution: dateResolution(row),
      });
    } else if (row.candidateType === "table") {
      surfaces.documentTables.push({
        ...baseApplied(row, ["builtin_table_family_refinement"], reviewReasons),
        refinedTableFamily: refinedTableFamily(row),
      });
    } else if (row.candidateType === "claim") {
      surfaces.documentClaims.push({
        ...baseApplied(row, ["builtin_claim_causal_gate"], reviewReasons),
        causalClaimFlag: isCausalClaim(rawCandidateText(row)),
        claimBasis: claimBasis(row),
      });
    }
    for (const reason of reviewReasons) {
      surfaces.sourceGapQueue.push({
        ...baseApplied(row, approvedRuleIds, reviewReasons),
        queueReason: reason,
      });
    }
  }

  const unresolvedGroups = input.groups
    .filter((group) => group.hazardTags.length > 0)
    .map((group) => ({
      groupId: group.groupId,
      candidateType: group.candidateType,
      canonicalFamily: group.canonicalFamily,
      rawFamily: group.rawFamily,
      count: group.count,
      reasons: group.hazardTags,
    }));
  const surfaceCounts = Object.fromEntries(
    Object.entries(surfaces).map(([surface, rows]) => [surface, rows.length]),
  );
  return {
    version: 1,
    generatedAt: input.generatedAt,
    sourceNormalizedCandidatesPath: input.sourceNormalizedCandidatesPath,
    sourceWorkbenchPath: input.workbenchPath,
    summary: {
      inputRows: input.rows.length,
      appliedApprovedRuleCount: approvedRuleIds.length,
      surfaceCounts,
      reviewQueueCount: surfaces.sourceGapQueue.length,
      unresolvedGroupCount: unresolvedGroups.length,
      unresolvedRowCount: unresolvedGroups.reduce((sum, group) => sum + group.count, 0),
    },
    surfaces,
    unresolvedGroups,
  };
}

function modelTool() {
  return {
    name: TOOL_NAME,
    description:
      "Submit proposed normalization, merge, suppression, and denormalization rules for Tier 2 discovery candidate groups.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["rules", "reviewQuestions", "denormalizedSurfaces"],
      properties: {
        rules: {
          type: "array",
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "ruleId",
              "source",
              "status",
              "action",
              "candidateType",
              "match",
              "output",
              "confidence",
              "rationale",
              "sampleGroupIds",
            ],
            properties: {
              ruleId: { type: "string" },
              source: { type: "string", enum: ["model"] },
              status: { type: "string", enum: ["proposed"] },
              action: {
                type: "string",
                enum: ["annotate", "split_family", "suppress", "denormalize_surface", "needs_review"],
              },
              candidateType: {
                type: "string",
                enum: ["any", "entity", "metric", "event", "table", "claim", "context_signal", "review_question"],
              },
              match: {
                type: "object",
                additionalProperties: false,
                properties: {
                  canonicalFamily: { type: "string" },
                  rawFamilyIncludes: { type: "array", items: { type: "string" } },
                  labelIncludes: { type: "array", items: { type: "string" } },
                  hazardTags: { type: "array", items: { type: "string" } },
                },
              },
              output: {
                type: "object",
                additionalProperties: false,
                properties: {
                  targetSurface: { type: "string" },
                  normalizedFamily: { type: "string" },
                  fields: {
                    type: "object",
                    additionalProperties: { type: ["string", "number", "boolean", "null"] },
                  },
                },
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string" },
              sampleGroupIds: { type: "array", items: { type: "string" } },
            },
          },
        },
        reviewQuestions: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["question", "reason", "sampleGroupIds"],
            properties: {
              question: { type: "string" },
              reason: { type: "string" },
              sampleGroupIds: { type: "array", items: { type: "string" } },
            },
          },
        },
        denormalizedSurfaces: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["surfaceName", "purpose", "requiredFields"],
            properties: {
              surfaceName: { type: "string" },
              purpose: { type: "string" },
              requiredFields: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  };
}

const SYSTEM_PROMPT = [
  "You are designing deterministic normalization rules for a NYC bus reliability document corpus.",
  "You are not extracting facts from pages. You are reviewing candidate groups and proposing rules.",
  "Rules must be specific enough that engineers can implement them deterministically.",
  "Prefer provenance, status, mode, scope, and suppression rules over one-off labels.",
  "Never promote document claims into computed project metrics.",
  "Never collapse bus routes and subway/rail lines into the same route namespace.",
  "Call the tool exactly once. Keep the output concise.",
].join("\n");

function buildUserPrompt(input: {
  groups: CandidateGroup[];
  builtinRules: NormalizationRule[];
}): string {
  return [
    "Review these grouped Tier 2 discovery candidates and propose normalization/merge/suppression/denormalization rules.",
    "",
    "The loop we are testing is:",
    "1. Take grouped candidates.",
    "2. Propose normalization/merge/suppression rules.",
    "3. Persist the proposed rules.",
    "4. Apply approved deterministic rules.",
    "5. Audit unresolved groups.",
    "6. Repeat on the unresolved/ambiguous long tail.",
    "",
    "Return proposed rules only; builtin approved seed rules are included as context and should not be repeated unless you refine them.",
    "",
    "Builtin approved seed rules:",
    JSON.stringify(input.builtinRules, null, 2),
    "",
    "Candidate groups:",
    JSON.stringify(input.groups, null, 2),
  ].join("\n");
}

function artifactSibling(path: string, suffix: string): string {
  return path.endsWith(".json") ? path.replace(/\.json$/, `${suffix}.json`) : `${path}${suffix}.json`;
}

function usageFromBody(body: unknown): unknown | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  return (body as Record<string, unknown>)["usage"] ?? null;
}

function defaultSurfaceSpecs(): ModelRuleResponse["denormalizedSurfaces"] {
  return [
    {
      surfaceName: "documentMetricClaims",
      purpose: "Document-claimed metrics for evidence packets, priors, and source-gap review; not deterministic project metrics.",
      requiredFields: ["rowId", "metricSource", "metricTruthStatus", "valuePrecision", "geographyScope", "measurementMethodology", "evidenceRefs"],
    },
    {
      surfaceName: "documentInterventionEvents",
      purpose: "Candidate intervention and service-change events with status/date gates for applied research panels.",
      requiredFields: ["rowId", "implementationStatus", "dateResolution", "evidenceRefs"],
    },
    {
      surfaceName: "documentEntities",
      purpose: "Typed document entities with explicit bus/rail/station mode separation.",
      requiredFields: ["rowId", "entityMode", "canonicalFamily", "displayLabel", "evidenceRefs"],
    },
    {
      surfaceName: "sourceGapQueue",
      purpose: "Ambiguous, unresolved, or risky rows for iterative review and future rule batches.",
      requiredFields: ["rowId", "queueReason", "reviewReasons", "evidenceRefs"],
    },
  ];
}

function renderMarkdown(input: {
  workbench: Tier2NormalizationWorkbenchArtifact;
  applied: Tier2NormalizationAppliedArtifact;
}): string {
  const lines: string[] = [];
  lines.push("# Tier 2 Normalization Workbench");
  lines.push("");
  lines.push(`Generated: ${input.workbench.generatedAt}`);
  lines.push("");
  lines.push("## Loop Status");
  lines.push("");
  lines.push(`- Input rows: ${input.workbench.summary.inputRows}`);
  lines.push(`- Selected groups: ${input.workbench.summary.selectedGroupCount}`);
  lines.push(`- Builtin approved rules: ${input.workbench.summary.builtinRuleCount}`);
  lines.push(`- Model proposed rules: ${input.workbench.summary.modelRuleCount}`);
  lines.push(`- Review questions: ${input.workbench.summary.reviewQuestionCount}`);
  lines.push(`- Review queue rows after deterministic apply: ${input.applied.summary.reviewQueueCount}`);
  lines.push(`- Unresolved selected groups: ${input.applied.summary.unresolvedGroupCount}`);
  lines.push("");
  lines.push("## Surface Counts");
  lines.push("");
  lines.push("| Surface | Rows |");
  lines.push("|---|---:|");
  for (const [surface, count] of Object.entries(input.applied.summary.surfaceCounts)) {
    lines.push(`| ${surface} | ${count} |`);
  }
  lines.push("");
  lines.push("## Selected Groups");
  lines.push("");
  lines.push("| Count | Sources | Type | Family | Hazards | Raw family |");
  lines.push("|---:|---:|---|---|---|---|");
  for (const group of input.workbench.groups.slice(0, 30)) {
    lines.push(
      `| ${group.count} | ${group.sourceCount} | ${group.candidateType} | ${group.canonicalFamily} | ${group.hazardTags.join(", ")} | ${group.rawFamily.replace(/\|/g, "/")} |`,
    );
  }
  lines.push("");
  lines.push("## Model Proposed Rules");
  lines.push("");
  for (const rule of input.workbench.modelRules) {
    lines.push(`- **${rule.ruleId}** (${rule.action}, ${rule.candidateType}, confidence ${rule.confidence}): ${rule.rationale}`);
  }
  lines.push("");
  lines.push("## Review Questions");
  lines.push("");
  for (const question of input.workbench.reviewQuestions) {
    lines.push(`- ${question.question} (${question.reason})`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function runTier2NormalizationWorkbench(
  args: RunTier2NormalizationWorkbenchArgs,
): Promise<{
  workbench: Tier2NormalizationWorkbenchArtifact;
  applied: Tier2NormalizationAppliedArtifact;
}> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const normalized = (await Bun.file(args.normalizedCandidatesPath).json()) as NormalizedCandidatesArtifact;
  const rows = normalized.rows;
  const groupCount = args.groupCount ?? DEFAULT_GROUP_COUNT;
  const examplesPerGroup = args.examplesPerGroup ?? DEFAULT_EXAMPLES_PER_GROUP;
  const groups = buildCandidateGroups(rows, { groupCount, examplesPerGroup });
  const builtin = builtinRules(groups);
  const outputPath = args.outputPath ?? join(dirname(args.normalizedCandidatesPath), "document-discovery-normalization-workbench-v1.json");
  const batchOutputPath = args.batchOutputPath ?? artifactSibling(outputPath, "-batch");
  const appliedOutputPath = args.appliedOutputPath ?? artifactSibling(outputPath, "-applied");
  const markdownPath = args.markdownPath ?? artifactSibling(outputPath, "");
  const requestPath = artifactSibling(outputPath, "-request");
  const responsePath = artifactSibling(outputPath, "-response");
  const toolCallPath = artifactSibling(outputPath, "-tool-call");
  const errorPath = artifactSibling(outputPath, "-error");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(batchOutputPath, {
    version: 1,
    generatedAt,
    promptVersion: PROMPT_VERSION,
    sourceNormalizedCandidatesPath: args.normalizedCandidatesPath,
    inputRows: rows.length,
    groups,
    builtinRules: builtin,
  });

  let modelRules: NormalizationRule[] = [];
  let reviewQuestions: ModelRuleResponse["reviewQuestions"] = [];
  let denormalizedSurfaces = defaultSurfaceSpecs();
  let responseArtifactKey: string | null = null;
  let toolCallArtifactKey: string | null = null;
  let errorArtifactKey: string | null = null;
  let rawUsage: unknown | null = null;
  const model = args.model ?? DEFAULT_MODEL;
  const maxTokens = args.maxTokens ?? DEFAULT_MAX_TOKENS;

  if (args.execute === true) {
    const apiKey = args.pioneerApiKey ?? process.env["PIONEER_API_KEY"];
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error("PIONEER_API_KEY is required for docs tier2 normalization-workbench --execute.");
    }
    const tool = modelTool();
    const messages: ToolCallMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt({ groups, builtinRules: builtin }) },
    ];
    await writeJson(requestPath, {
      version: 1,
      promptVersion: PROMPT_VERSION,
      provider: "pioneer",
      model,
      maxTokens,
      toolName: TOOL_NAME,
      messages,
      tool,
    });
    try {
      const providerResult = await callPioneerToolCallDirect({
        apiKey,
        model,
        maxTokens,
        toolName: TOOL_NAME,
        messages,
        tools: [tool],
        fetcher: args.fetcher ?? defaultFetch,
      });
      await writeJson(responsePath, providerResult.body);
      responseArtifactKey = responsePath;
      rawUsage = usageFromBody(providerResult.body);
      if (!providerResult.response.ok) {
        throw new Error(
          openRouterErrorMessage(providerResult.body) ??
            `HTTP ${providerResult.response.status} ${providerResult.response.statusText}`,
        );
      }
      const toolArgs = extractToolCallArguments(providerResult.body, TOOL_NAME);
      if (toolArgs === null) {
        throw new Error(
          missingToolCallErrorMessage({
            responseJson: providerResult.body,
            toolName: TOOL_NAME,
            maxTokens,
          }),
        );
      }
      const parsed = toolArgs as ModelRuleResponse;
      await writeJson(toolCallPath, parsed);
      toolCallArtifactKey = toolCallPath;
      modelRules = (parsed.rules ?? []).map((rule) => ({
        ...rule,
        source: "model",
        status: "proposed",
      }));
      reviewQuestions = parsed.reviewQuestions ?? [];
      denormalizedSurfaces =
        parsed.denormalizedSurfaces?.length > 0 ? parsed.denormalizedSurfaces : denormalizedSurfaces;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeJson(errorPath, {
        version: 1,
        generatedAt,
        promptVersion: PROMPT_VERSION,
        provider: "pioneer",
        model,
        error: message,
        requestArtifactKey: requestPath,
        responseArtifactKey,
      });
      errorArtifactKey = errorPath;
    }
  }

  const workbench: Tier2NormalizationWorkbenchArtifact = {
    version: 1,
    generatedAt,
    promptVersion: PROMPT_VERSION,
    sourceNormalizedCandidatesPath: args.normalizedCandidatesPath,
    provider: args.execute === true ? "pioneer" : null,
    model: args.execute === true ? model : null,
    execute: args.execute === true,
    summary: {
      inputRows: rows.length,
      groupCount: new Set(rows.map((row) => `${row.candidateType}|${row.canonicalFamily}|${compact(row.rawFamily)}`)).size,
      selectedGroupCount: groups.length,
      builtinRuleCount: builtin.length,
      modelRuleCount: modelRules.length,
      reviewQuestionCount: reviewQuestions.length,
    },
    groups,
    builtinRules: builtin,
    modelRules,
    reviewQuestions,
    denormalizedSurfaces,
    requestArtifactKey: args.execute === true ? requestPath : null,
    responseArtifactKey,
    toolCallArtifactKey,
    errorArtifactKey,
    rawUsage,
  };
  await writeJson(outputPath, workbench);
  const applied = applySeedRules({
    rows,
    workbenchPath: outputPath,
    sourceNormalizedCandidatesPath: args.normalizedCandidatesPath,
    generatedAt,
    rules: builtin,
    groups,
  });
  await writeJson(appliedOutputPath, applied);
  await Bun.write(markdownPath.endsWith(".md") ? markdownPath : markdownPath.replace(/\.json$/, ".md"), renderMarkdown({ workbench, applied }));
  return { workbench, applied };
}

function parseArgs(argv: string[]): CliArgs {
  const options: CliOption<CliArgs>[] = [
    {
      flags: ["--normalized-candidates"],
      apply: (output, value) => {
        if (value !== undefined) output.normalizedCandidatesPath = fromCliPath(value);
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) output.runId = value;
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--batch-output"],
      apply: (output, value) => {
        if (value !== undefined) output.batchOutputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--applied-output"],
      apply: (output, value) => {
        if (value !== undefined) output.appliedOutputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--markdown"],
      apply: (output, value) => {
        if (value !== undefined) output.markdownPath = fromCliPath(value);
      },
    },
    {
      flags: ["--group-count"],
      apply: (output, value) => {
        if (value !== undefined) output.groupCount = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--examples-per-group"],
      apply: (output, value) => {
        if (value !== undefined) output.examplesPerGroup = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--model"],
      apply: (output, value) => {
        if (value !== undefined) output.model = value;
      },
    },
    {
      flags: ["--max-tokens"],
      apply: (output, value) => {
        if (value !== undefined) output.maxTokens = Number.parseInt(value, 10);
      },
    },
    trueOption<CliArgs>(["--execute"], (output) => {
      output.execute = true;
    }),
  ];
  return parseCliOptions(argv, {}, options);
}

async function resolveNormalizedCandidatesPath(args: CliArgs): Promise<string> {
  if (args.normalizedCandidatesPath !== undefined) return args.normalizedCandidatesPath;
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --normalized-candidates.");
  }
  return join(runArtifactRoot(artifactRoot, runId), "document-discovery-normalized-candidates-canonical-v1.json");
}

export async function runTier2NormalizationWorkbenchFromCli(argv: string[]) {
  const args = parseArgs(argv);
  const normalizedCandidatesPath = await resolveNormalizedCandidatesPath(args);
  const result = await runTier2NormalizationWorkbench({
    normalizedCandidatesPath,
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.batchOutputPath === undefined ? {} : { batchOutputPath: args.batchOutputPath }),
    ...(args.appliedOutputPath === undefined ? {} : { appliedOutputPath: args.appliedOutputPath }),
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.groupCount === undefined ? {} : { groupCount: args.groupCount }),
    ...(args.examplesPerGroup === undefined ? {} : { examplesPerGroup: args.examplesPerGroup }),
    ...(args.execute === undefined ? {} : { execute: args.execute }),
    ...(args.model === undefined ? {} : { model: args.model }),
    ...(args.maxTokens === undefined ? {} : { maxTokens: args.maxTokens }),
  });
  console.log(
    `tier2-normalization-workbench: groups=${result.workbench.summary.selectedGroupCount} modelRules=${result.workbench.summary.modelRuleCount} reviewQueue=${result.applied.summary.reviewQueueCount}`,
  );
  return result.workbench;
}
