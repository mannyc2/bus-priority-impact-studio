import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  type OperationalDateAssertion,
  OperationalDateAssertionSchema,
  toProjectJsonSchema,
} from "@bp/domain";
import { z } from "zod";
import { writeJson } from "../../../lib/json.ts";
import type { ToolCallMessage } from "../../../lib/llm.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { callPioneerToolCallDirect, openRouterErrorMessage } from "./_llm-clients.ts";
import {
  type CliOption,
  defaultFetch,
  extractToolCallArguments,
  type FetchLike,
  latestDocsRunId,
  markdownBody,
  missingToolCallErrorMessage,
  parseCliOptions,
  runArtifactRoot,
  trueOption,
} from "./_shared.ts";

export const TIER2_PROOF_HARNESS_ARTIFACT_KIND = "bp.tier2_operational_date_proof_harness.v1";
export const TIER2_PROOF_PROMPT_VERSION = "tier2-operational-date-proof-v1";
export const TIER2_PROOF_TOOL_NAME = "submit_tier2_operational_date_proof";

const DEFAULT_MODEL = "claude-opus-4-5";
const DEFAULT_MAX_TOKENS = 8_000;
const DEFAULT_MAX_CONTEXT_CHARS = 80_000;
const DEFAULT_EXECUTE_CONCURRENCY = 1;

const OperationalDateAssertionsArtifactSchema = z
  .object({
    rows: z.array(OperationalDateAssertionSchema),
  })
  .passthrough();

const PageMarkdownManifestPageSchema = z
  .object({
    pageNumber: z.number().int().positive(),
    status: z.string(),
    markdownArtifactKey: z.string().nullable().optional(),
    markdownCharCount: z.number().optional(),
  })
  .passthrough();

const PageMarkdownManifestSourceSchema = z
  .object({
    sourceId: z.string(),
    title: z.string().optional(),
    sourceGroup: z.string().optional(),
    pages: z.array(PageMarkdownManifestPageSchema),
  })
  .passthrough();

const PageMarkdownManifestSchema = z
  .object({
    sources: z.array(PageMarkdownManifestSourceSchema),
  })
  .passthrough();

type PageMarkdownManifest = z.output<typeof PageMarkdownManifestSchema>;
type PageMarkdownManifestSource = z.output<typeof PageMarkdownManifestSourceSchema>;

export const Tier2ProofClaimTypeSchema = z.enum([
  "realized_operational_launch",
  "planned_or_future_launch",
  "camera_warning_start",
  "camera_ticketing_start",
  "construction_or_installation_start",
  "post_implementation_observation",
  "meeting_or_outreach",
  "study_or_design",
  "other",
]);
export type Tier2ProofClaimType = z.output<typeof Tier2ProofClaimTypeSchema>;

export const Tier2ProofStatusSchema = z.enum(["proven", "contradicted", "ambiguous", "not_found"]);
export type Tier2ProofStatus = z.output<typeof Tier2ProofStatusSchema>;

export const Tier2ProofEvidenceSupportSchema = z.enum([
  "date",
  "operational_status",
  "route_scope",
  "treatment_type",
  "counter_evidence",
  "context",
]);

export const Tier2ProofEvidenceSpanSchema = z
  .object({
    spanId: z.string().min(1),
    pageNumber: z.number().int().positive().nullable(),
    quote: z.string().min(1),
    supports: z.array(Tier2ProofEvidenceSupportSchema).min(1),
  })
  .strict();
export type Tier2ProofEvidenceSpan = z.output<typeof Tier2ProofEvidenceSpanSchema>;

export const Tier2ProofResultSchema = z
  .object({
    candidateId: z.string().min(1),
    proofStatus: Tier2ProofStatusSchema,
    claimType: Tier2ProofClaimTypeSchema,
    dateText: z.string().min(1).nullable(),
    operationalStatusText: z.string().min(1).nullable(),
    treatmentText: z.string().min(1).nullable(),
    routeScope: z
      .object({
        kind: z.enum([
          "direct_route",
          "source_single_route_context",
          "corridor_only",
          "systemwide",
          "unclear",
        ]),
        routeIds: z.array(z.string().min(1)),
        routeText: z.string().min(1).nullable(),
      })
      .strict(),
    evidenceSpans: z.array(Tier2ProofEvidenceSpanSchema),
    counterEvidenceSpans: z.array(Tier2ProofEvidenceSpanSchema),
    confidence: z.enum(["high", "medium", "low"]),
    reasoning: z.string().min(1),
    unvalidatedQuestions: z.array(z.string().min(1)),
  })
  .strict();
export type Tier2ProofResult = z.output<typeof Tier2ProofResultSchema>;

export type Tier2ProofCandidate = {
  candidateId: string;
  surfaceId: string;
  interventionId: string;
  sourceId: string;
  sourceTitle: string | null;
  sourceGroup: string | null;
  displayLabel: string | null;
  expectedClaim: {
    operationalDate: string | null;
    implementationMonth: string | null;
    normalizedPrecision: string;
    isRealizedOnset: boolean;
    validationState: string;
    sourceStatedStatus: string;
    eventKind: string;
    interventionFamily: string;
    routeIds: string[];
    routeResolutionTier: string | null;
    treatmentText: string | null;
    locationText: string | null;
    confidence: number;
  };
  deterministicReasons: string[];
  evidenceRefs: OperationalDateAssertion["evidenceRefs"];
};

export type Tier2ProofContextStatus =
  | "available"
  | "provided_context"
  | "missing_manifest"
  | "missing_source"
  | "missing_page_markdown"
  | "document_context_missing";

type Tier2ProofDocumentContext = {
  status: Tier2ProofContextStatus;
  sourceId: string;
  pageNumbers: number[];
  pageArtifactKeys: string[];
  markdownChars: number;
  markdownTruncated: boolean;
  markdownHash: string | null;
  text: string | null;
  reason: string | null;
};

export type Tier2ProofValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
};

export type Tier2ProofValidatedResult = {
  candidateId: string;
  validationState: "valid" | "invalid" | "schema_error" | "unknown_candidate";
  proofStatus: Tier2ProofStatus | null;
  result: Tier2ProofResult | null;
  issues: Tier2ProofValidationIssue[];
  responseArtifactKey: string | null;
  toolCallArtifactKey: string | null;
  errorArtifactKey: string | null;
};

export type Tier2ProofRequestRecord = {
  candidateId: string;
  sourceId: string;
  requestArtifactKey: string;
  responseArtifactKey: string | null;
  toolCallArtifactKey: string | null;
  errorArtifactKey: string | null;
  contextStatus: Tier2ProofContextStatus;
  contextPageNumbers: number[];
  contextChars: number;
  contextTruncated: boolean;
  contextHash: string | null;
};

export type Tier2ProofHarnessArtifact = {
  artifactKind: typeof TIER2_PROOF_HARNESS_ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  promptVersion: typeof TIER2_PROOF_PROMPT_VERSION;
  toolName: typeof TIER2_PROOF_TOOL_NAME;
  provider: "pioneer";
  model: string;
  execute: boolean;
  maxTokens: number;
  maxContextChars: number;
  sourceArtifacts: {
    operationalDateAssertionsPath: string;
    pageMarkdownManifestPath: string | null;
    pageMarkdownRoot: string | null;
    documentContextPath: string | null;
    proofResultsPath: string | null;
  };
  summary: {
    candidateCount: number;
    requestCount: number;
    contextAvailableCount: number;
    contextMissingCount: number;
    validatedResultCount: number;
    validProvenCount: number;
    validationErrorCount: number;
    validationWarningCount: number;
    countsByProofStatus: Record<string, number>;
  };
  candidates: Tier2ProofCandidate[];
  requests: Tier2ProofRequestRecord[];
  validatedResults: Tier2ProofValidatedResult[];
};

export type RunTier2ProofHarnessArgs = {
  operationalDateAssertionsPath: string;
  outputPath: string;
  requestRootPath?: string;
  pageMarkdownManifestPath?: string;
  pageMarkdownRoot?: string;
  documentContextPath?: string;
  proofResultsPath?: string;
  generatedAt?: string;
  model?: string;
  maxTokens?: number;
  maxContextChars?: number;
  limitCandidates?: number;
  candidateIds?: string[];
  sourceIds?: string[];
  execute?: boolean;
  executeConcurrency?: number;
  reuseExistingResponses?: boolean;
  fetcher?: FetchLike;
  pioneerApiKey?: string;
};

type ProofHarnessCliArgs = {
  operationalDateAssertionsPath?: string;
  outputPath?: string;
  requestRootPath?: string;
  pageMarkdownManifestPath?: string;
  pageMarkdownRoot?: string;
  documentContextPath?: string;
  proofResultsPath?: string;
  artifactRoot?: string;
  runId?: string;
  generatedAt?: string;
  model?: string;
  maxTokens?: number;
  maxContextChars?: number;
  limitCandidates?: number;
  candidateIds?: string[];
  sourceIds?: string[];
  execute?: boolean;
  executeConcurrency?: number;
  reuseExistingResponses?: boolean;
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeFileName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized.slice(0, 120) : sha256Hex(value).slice(0, 24);
}

function truncateContext(
  text: string,
  maxContextChars: number,
): {
  text: string;
  truncated: boolean;
  hash: string;
} {
  const hash = sha256Hex(text);
  if (text.length <= maxContextChars) {
    return { text, truncated: false, hash };
  }
  return {
    text: `${text.slice(0, maxContextChars)}\n\n[TRUNCATED_BY_PROOF_HARNESS sha256:${hash}]`,
    truncated: true,
    hash,
  };
}

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function quoteAppearsInContext(quote: string, context: string | null): boolean {
  if (context === null) return false;
  if (context.includes(quote)) return true;
  const normalizedQuote = normalizeSearchText(quote);
  if (normalizedQuote.length === 0) return false;
  return normalizeSearchText(context).includes(normalizedQuote);
}

function splitList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const out = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return out.length > 0 ? out : undefined;
}

function proofClaimIsOperational(claimType: Tier2ProofClaimType): boolean {
  return (
    claimType === "realized_operational_launch" ||
    claimType === "camera_warning_start" ||
    claimType === "camera_ticketing_start"
  );
}

type ProofEvidenceSupport = z.output<typeof Tier2ProofEvidenceSupportSchema>;

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const REALIZED_STATUS_PATTERN =
  /\b(activated|began|begun|completed|converted|implemented|in effect|in service|installed|launched|opened|service began|started|upgraded)\b/i;

const NON_REALIZED_STATUS_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  {
    code: "planned_or_future_language_in_status_quote",
    pattern:
      /\b(anticipated|expected to|future|not implemented|not yet implemented|planned for|planned to|plans to|proposed|scheduled to|will|would)\b/i,
  },
  {
    code: "denied_cancelled_or_rejected_status_quote",
    pattern: /\b(cancelled|canceled|denied|not approved|rejected|withdrawn)\b/i,
  },
  {
    code: "process_or_design_language_in_status_quote",
    pattern:
      /\b(agenda|design phase|draft plan|open house|planning study|public meeting|workshop)\b/i,
  },
];

const RAIL_ONLY_PATTERN = /\b(rail|subway|train)\b/i;
const BUS_OR_ROUTE_PATTERN =
  /\b(bus|busway|sbs|select bus|transit priority|q\d{1,2}|m\d{1,2}|bx\d{1,2}|b\d{1,2}|s\d{1,2})\b/i;
const CAMERA_PROGRAM_TOKEN_PATTERN = /\b(?:ACE|ABLE)\b/;
const CAMERA_WORD_SUPPORT_PATTERN =
  /camera|automated bus lane enforcement|bus lane enforcement|enforcement camera/i;

const BUS_LANE_SUPPORT_PATTERN =
  /\b(?:bus lanes?|bus-only lanes?|bus only lanes?|dedicated bus lanes?|offset bus lanes?|curbside bus lanes?|red bus lanes?|painted bus lanes?)\b/i;
const OFFSET_BUS_LANE_SUPPORT_PATTERN =
  /\b(?:offset bus lanes?|curbside bus lanes?|offset and curbside bus lanes?)\b/i;
const BUSWAY_SUPPORT_PATTERN =
  /\b(?:busways?|transitways?|transit\s+(?:and|&|\/)\s+truck priority|truck\s+(?:and|&|\/)\s+transit priority|transit\/truck priority|bus and truck only|bus-only streets?|bus only streets?)\b/i;
const SELECT_BUS_SUPPORT_PATTERN = /\b(?:select bus service|sbs|bus rapid transit|brt)\b/i;
const TSP_SUPPORT_PATTERN =
  /\b(?:transit signal priority|signal priority|tsp|green signal|green time|signal timing|signal retiming|bus priority signal)\b/i;
const QUEUE_JUMP_SUPPORT_PATTERN = /\b(?:queue jumps?|bus-only signals?|bus only signals?)\b/i;
const STOP_CONSOLIDATION_SUPPORT_PATTERN =
  /\b(?:bus stop consolidation|stop consolidation|consolidat(?:ed|ion)\s+(?:bus\s+)?stops?)\b/i;
const OTHER_BUS_PRIORITY_SUPPORT_PATTERN =
  /\b(?:bus priority|bus improvements?|bus-only|bus only|bus lanes?|busways?|select bus service|sbs|bus rapid transit|brt|off[-\s]?board fare|fare prepayment|all[-\s]?door boarding|bus bulbs?|bus boarding islands?|bus stops?|route extension|bus service change|bus and truck only|transit and truck priority)\b/i;
const CAMERA_CANDIDATE_LABEL_PATTERN =
  /\b(?:ACE|ABLE)\b|camera|enforcement|summons(?:es)?|warning period|tickets?|ticketing/i;
const CAMERA_PROGRAM_EXACT_TOKEN_PATTERN = /\b(?:ACE|ABLE)\b/;
const SIGNAL_CANDIDATE_LABEL_PATTERN =
  /\b(?:TSP|transit signal priority|signal timing|signal priority)\b/i;
const STOP_CANDIDATE_LABEL_PATTERN =
  /\b(?:bus stop consolidation|stop consolidation|new sbs stops?|stops? (?:added|removed|replaced)|stop (?:addition|replacement))\b/i;
const ANCILLARY_NON_ANCHOR_LABEL_PATTERN =
  /\b(?:customer ambassadors?|first year of|press conference|snow|storm|fare evasion|ridership comparison|articulated buses?)\b/i;

const TREATMENT_FAMILY_SUPPORT: Record<string, { label: string; patterns: RegExp[] }> = {
  bus_lane: {
    label: "bus-lane treatment",
    patterns: [BUS_LANE_SUPPORT_PATTERN],
  },
  offset_or_curbside_bus_lane: {
    label: "offset/curbside bus-lane treatment",
    patterns: [OFFSET_BUS_LANE_SUPPORT_PATTERN, BUS_LANE_SUPPORT_PATTERN],
  },
  busway_or_transitway: {
    label: "busway/transitway treatment",
    patterns: [BUSWAY_SUPPORT_PATTERN],
  },
  select_bus_service: {
    label: "Select Bus Service/BRT treatment",
    patterns: [SELECT_BUS_SUPPORT_PATTERN],
  },
  transit_signal_priority: {
    label: "transit signal priority treatment",
    patterns: [TSP_SUPPORT_PATTERN],
  },
  queue_jump: {
    label: "queue-jump or bus-only signal treatment",
    patterns: [QUEUE_JUMP_SUPPORT_PATTERN],
  },
  stop_consolidation: {
    label: "bus stop consolidation treatment",
    patterns: [STOP_CONSOLIDATION_SUPPORT_PATTERN],
  },
  other_bus_priority: {
    label: "concrete bus-priority treatment",
    patterns: [
      OTHER_BUS_PRIORITY_SUPPORT_PATTERN,
      BUS_LANE_SUPPORT_PATTERN,
      BUSWAY_SUPPORT_PATTERN,
      SELECT_BUS_SUPPORT_PATTERN,
      TSP_SUPPORT_PATTERN,
      QUEUE_JUMP_SUPPORT_PATTERN,
      STOP_CONSOLIDATION_SUPPORT_PATTERN,
    ],
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsToken(text: string, token: string): boolean {
  if (token.trim().length === 0) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(token.toLowerCase())}(?=$|[^a-z0-9])`).test(text);
}

function routeIdVariants(routeId: string): string[] {
  const bare = routeId.replace(/\+$/, "").trim();
  const compact = bare.replace(/[^a-z0-9]/gi, "");
  const withoutSbs = compact.replace(/SBS$/i, "");
  const variants = new Set([bare, compact, withoutSbs]);
  const routeMatch = compact.match(/^([a-z]+)(\d+)([a-z])?$/i);
  if (routeMatch?.[1] !== undefined && routeMatch[2] !== undefined) {
    variants.add(`${routeMatch[1]} ${routeMatch[2]}${routeMatch[3] ?? ""}`);
  }
  return [...variants].filter((value) => value.length > 0);
}

function normalizeRouteForComparison(routeId: string): string {
  return routeId
    .toUpperCase()
    .replace(/\bSELECT\s+BUS\s+SERVICE\b/g, "")
    .replace(/\bSBS\b/g, "")
    .replace(/\+$/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .replace(/SBS$/g, "");
}

function routeIdsOverlap(left: readonly string[], right: readonly string[]): boolean {
  const rightNormalized = new Set(
    right.map(normalizeRouteForComparison).filter((routeId) => routeId.length > 0),
  );
  return left
    .map(normalizeRouteForComparison)
    .some((routeId) => routeId.length > 0 && rightNormalized.has(routeId));
}

function routeTextAppearsInQuote(quoteText: string, routeText: string): boolean {
  const normalizedRouteText = normalizeSearchText(routeText);
  if (normalizedRouteText.length === 0) return false;
  if (/[^a-z0-9]/.test(normalizedRouteText)) {
    return quoteText.includes(normalizedRouteText);
  }
  return containsToken(quoteText, normalizedRouteText);
}

function implementationMonthMatchesDateText(input: {
  implementationMonth: string | null;
  operationalDate: string | null;
  dateText: string | null;
}): boolean {
  if (input.dateText === null) return false;
  const dateText = normalizeSearchText(input.dateText);
  const operationalDate =
    input.operationalDate === null ? "" : normalizeSearchText(input.operationalDate);
  if (
    operationalDate.length > 0 &&
    (dateText.includes(operationalDate) || operationalDate.includes(dateText))
  ) {
    return true;
  }
  const match = input.implementationMonth?.match(/^(\d{4})-(\d{2})$/);
  if (match?.[1] === undefined || match[2] === undefined) return true;
  const year = match[1];
  const monthNumber = Number.parseInt(match[2], 10);
  const monthName = MONTH_NAMES[monthNumber - 1];
  if (monthName === undefined || !dateText.includes(year)) return false;
  const shortName = monthName.slice(0, 3);
  return (
    dateText.includes(monthName) ||
    dateText.includes(shortName) ||
    containsToken(dateText, String(monthNumber)) ||
    containsToken(dateText, match[2])
  );
}

function quoteIsRailOnly(quote: string): boolean {
  return RAIL_ONLY_PATTERN.test(quote) && !BUS_OR_ROUTE_PATTERN.test(quote);
}

function issue(
  severity: Tier2ProofValidationIssue["severity"],
  code: string,
  message: string,
  path?: string,
): Tier2ProofValidationIssue {
  return path === undefined ? { severity, code, message } : { severity, code, message, path };
}

function candidateShapeIssues(candidate: Tier2ProofCandidate): Tier2ProofValidationIssue[] {
  const issues: Tier2ProofValidationIssue[] = [];
  const label = candidate.displayLabel ?? "";
  const treatmentText = candidate.expectedClaim.treatmentText ?? "";
  const family = candidate.expectedClaim.interventionFamily;
  const cameraCandidate =
    CAMERA_CANDIDATE_LABEL_PATTERN.test(label) ||
    CAMERA_PROGRAM_EXACT_TOKEN_PATTERN.test(treatmentText);
  if (cameraCandidate && family !== "camera_enforcement") {
    issues.push(
      issue(
        "error",
        "candidate_camera_enforcement_family_mismatch",
        "Candidate text describes camera/ACE/ABLE enforcement but the deterministic family is not camera_enforcement.",
      ),
    );
  }
  if (SIGNAL_CANDIDATE_LABEL_PATTERN.test(label) && family !== "transit_signal_priority") {
    issues.push(
      issue(
        "error",
        "candidate_signal_priority_family_mismatch",
        "Candidate label describes signal priority/timing but the deterministic family is not transit_signal_priority.",
      ),
    );
  }
  if (
    STOP_CANDIDATE_LABEL_PATTERN.test(label) &&
    family !== "stop_consolidation" &&
    family !== "other_bus_priority"
  ) {
    issues.push(
      issue(
        "error",
        "candidate_stop_change_family_mismatch",
        "Candidate label describes stop additions/removals/replacements but the deterministic family is not a stop-change family.",
      ),
    );
  }
  if (ANCILLARY_NON_ANCHOR_LABEL_PATTERN.test(label)) {
    issues.push(
      issue(
        "error",
        "candidate_non_anchor_label",
        "Candidate label describes an ancillary, observation, or support activity rather than a causal treatment anchor.",
      ),
    );
  }
  return issues;
}

function candidateFromAssertion(row: OperationalDateAssertion): Tier2ProofCandidate {
  return {
    candidateId: row.surfaceId,
    surfaceId: row.surfaceId,
    interventionId: row.interventionId,
    sourceId: row.sourceId,
    sourceTitle: row.sourceTitle,
    sourceGroup: row.sourceGroup,
    displayLabel: row.displayLabel,
    expectedClaim: {
      operationalDate: row.operationalDate,
      implementationMonth: row.implementationMonth,
      normalizedPrecision: row.normalizedPrecision,
      isRealizedOnset: row.isRealizedOnset,
      validationState: row.validationState,
      sourceStatedStatus: row.sourceStatedStatus,
      eventKind: row.eventKind,
      interventionFamily: row.interventionFamily,
      routeIds: row.routeIds,
      routeResolutionTier: row.routeResolutionTier,
      treatmentText: row.treatmentText,
      locationText: row.locationText,
      confidence: row.confidence,
    },
    deterministicReasons: row.classificationReasons,
    evidenceRefs: row.evidenceRefs,
  };
}

export function buildTier2ProofCandidates(input: {
  assertions: readonly OperationalDateAssertion[];
  candidateIds?: readonly string[];
  sourceIds?: readonly string[];
  limitCandidates?: number;
}): Tier2ProofCandidate[] {
  const wantedCandidates = input.candidateIds === undefined ? null : new Set(input.candidateIds);
  const wantedSources = input.sourceIds === undefined ? null : new Set(input.sourceIds);
  const out: Tier2ProofCandidate[] = [];
  for (const row of input.assertions) {
    if (!row.causalAnchorEligible) continue;
    if (wantedCandidates !== null && !wantedCandidates.has(row.surfaceId)) continue;
    if (wantedSources !== null && !wantedSources.has(row.sourceId)) continue;
    out.push(candidateFromAssertion(row));
    if (input.limitCandidates !== undefined && out.length >= input.limitCandidates) break;
  }
  return out;
}

async function readJsonFile(path: string): Promise<unknown> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Artifact not found at ${path}`);
  }
  return await file.json();
}

async function loadAssertions(path: string): Promise<OperationalDateAssertion[]> {
  const parsed = OperationalDateAssertionsArtifactSchema.safeParse(await readJsonFile(path));
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((item) => `${item.path.join(".") || "<root>"}: ${item.message}`)
      .join("; ");
    throw new Error(`Failed to parse operational-date assertions at ${path}: ${detail}`);
  }
  return parsed.data.rows;
}

async function loadPageMarkdownManifest(
  path: string | undefined,
): Promise<PageMarkdownManifest | null> {
  if (path === undefined) return null;
  const parsed = PageMarkdownManifestSchema.safeParse(await readJsonFile(path));
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((item) => `${item.path.join(".") || "<root>"}: ${item.message}`)
      .join("; ");
    throw new Error(`Failed to parse page markdown manifest at ${path}: ${detail}`);
  }
  return parsed.data;
}

async function readProvidedDocumentContext(input: {
  candidate: Tier2ProofCandidate;
  path: string;
  maxContextChars: number;
}): Promise<Tier2ProofDocumentContext> {
  const file = Bun.file(input.path);
  if (!(await file.exists())) {
    return {
      status: "document_context_missing",
      sourceId: input.candidate.sourceId,
      pageNumbers: [],
      pageArtifactKeys: [],
      markdownChars: 0,
      markdownTruncated: false,
      markdownHash: null,
      text: null,
      reason: `Document context not found at ${input.path}`,
    };
  }
  const raw = await file.text();
  const truncated = truncateContext(raw, input.maxContextChars);
  return {
    status: "provided_context",
    sourceId: input.candidate.sourceId,
    pageNumbers: [],
    pageArtifactKeys: [input.path],
    markdownChars: truncated.text.length,
    markdownTruncated: truncated.truncated,
    markdownHash: truncated.hash,
    text: truncated.text,
    reason: null,
  };
}

async function readSourceMarkdownContext(input: {
  candidate: Tier2ProofCandidate;
  manifest: PageMarkdownManifest | null;
  pageMarkdownRoot: string | null;
  maxContextChars: number;
}): Promise<Tier2ProofDocumentContext> {
  if (input.pageMarkdownRoot === null) {
    return {
      status: "missing_manifest",
      sourceId: input.candidate.sourceId,
      pageNumbers: [],
      pageArtifactKeys: [],
      markdownChars: 0,
      markdownTruncated: false,
      markdownHash: null,
      text: null,
      reason: "No page markdown manifest/root was provided.",
    };
  }

  if (input.manifest === null) {
    return readSourceMarkdownContextFromRoot({
      candidate: input.candidate,
      pageMarkdownRoot: input.pageMarkdownRoot,
      maxContextChars: input.maxContextChars,
    });
  }

  const source = input.manifest.sources.find(
    (candidateSource) => candidateSource.sourceId === input.candidate.sourceId,
  );
  if (source === undefined) {
    return {
      status: "missing_source",
      sourceId: input.candidate.sourceId,
      pageNumbers: [],
      pageArtifactKeys: [],
      markdownChars: 0,
      markdownTruncated: false,
      markdownHash: null,
      text: null,
      reason: "The page markdown manifest does not contain this source.",
    };
  }
  return readSourceMarkdownContextFromManifestSource({
    candidate: input.candidate,
    source,
    pageMarkdownRoot: input.pageMarkdownRoot,
    maxContextChars: input.maxContextChars,
  });
}

function sourceDirMatches(dirName: string, sourceId: string): boolean {
  return dirName === sourceId || dirName.endsWith(`_${sourceId}`);
}

async function collectSourcesDirs(root: string, maxDepth = 3): Promise<string[]> {
  const roots: string[] = [];
  async function visit(path: string, depth: number): Promise<void> {
    if (basename(path) === "sources") {
      roots.push(path);
      return;
    }
    if (depth >= maxDepth) return;
    let entries: Dirent<string>[];
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      await visit(join(path, String(entry.name)), depth + 1);
    }
  }
  await visit(root, 0);
  return roots;
}

async function markdownPagesForSourceDir(input: {
  sourceDir: string;
  pageMarkdownRoot: string;
}): Promise<Array<{ pageNumber: number; path: string; artifactKey: string }>> {
  const pagesRoot = join(input.sourceDir, "pages");
  let entries: Dirent<string>[];
  try {
    entries = await readdir(pagesRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const pages: Array<{ pageNumber: number; path: string; artifactKey: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryName = String(entry.name);
    const pageNumber = Number.parseInt(entryName, 10);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) continue;
    const path = join(pagesRoot, entryName, "page.md");
    const file = Bun.file(path);
    if (!(await file.exists())) continue;
    const artifactKey = path.startsWith(`${input.pageMarkdownRoot}/`)
      ? path.slice(input.pageMarkdownRoot.length + 1)
      : path;
    pages.push({ pageNumber, path, artifactKey });
  }
  return pages.toSorted((left, right) => left.pageNumber - right.pageNumber);
}

async function readSourceMarkdownContextFromRoot(input: {
  candidate: Tier2ProofCandidate;
  pageMarkdownRoot: string;
  maxContextChars: number;
}): Promise<Tier2ProofDocumentContext> {
  const sourcesDirs = await collectSourcesDirs(input.pageMarkdownRoot);
  let bestPages: Array<{ pageNumber: number; path: string; artifactKey: string }> = [];
  for (const sourcesDir of sourcesDirs) {
    let entries: Dirent<string>[];
    try {
      entries = await readdir(sourcesDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryName = String(entry.name);
      if (!entry.isDirectory() || !sourceDirMatches(entryName, input.candidate.sourceId)) {
        continue;
      }
      const pages = await markdownPagesForSourceDir({
        sourceDir: join(sourcesDir, entryName),
        pageMarkdownRoot: input.pageMarkdownRoot,
      });
      if (pages.length > bestPages.length) bestPages = pages;
    }
  }

  if (bestPages.length === 0) {
    return {
      status: "missing_source",
      sourceId: input.candidate.sourceId,
      pageNumbers: [],
      pageArtifactKeys: [],
      markdownChars: 0,
      markdownTruncated: false,
      markdownHash: null,
      text: null,
      reason: "No source markdown pages were found under the supplied page markdown root.",
    };
  }

  const parts: string[] = [];
  for (const page of bestPages) {
    const body = markdownBody(await Bun.file(page.path).text());
    parts.push(`\n\n<!-- page ${page.pageNumber} -->\n\n${body}`);
  }
  const raw = parts.join("\n").trim();
  const truncated = truncateContext(raw, input.maxContextChars);
  return {
    status: "available",
    sourceId: input.candidate.sourceId,
    pageNumbers: bestPages.map((page) => page.pageNumber),
    pageArtifactKeys: bestPages.map((page) => page.artifactKey),
    markdownChars: truncated.text.length,
    markdownTruncated: truncated.truncated,
    markdownHash: truncated.hash,
    text: truncated.text,
    reason: null,
  };
}

async function readSourceMarkdownContextFromManifestSource(input: {
  candidate: Tier2ProofCandidate;
  source: PageMarkdownManifestSource;
  pageMarkdownRoot: string;
  maxContextChars: number;
}): Promise<Tier2ProofDocumentContext> {
  const parts: string[] = [];
  const pageNumbers: number[] = [];
  const pageArtifactKeys: string[] = [];
  for (const page of [...input.source.pages].sort(
    (left, right) => left.pageNumber - right.pageNumber,
  )) {
    if (page.markdownArtifactKey === undefined || page.markdownArtifactKey === null) continue;
    const path = join(input.pageMarkdownRoot, page.markdownArtifactKey);
    const file = Bun.file(path);
    if (!(await file.exists())) continue;
    const body = markdownBody(await file.text());
    parts.push(`\n\n<!-- page ${page.pageNumber} -->\n\n${body}`);
    pageNumbers.push(page.pageNumber);
    pageArtifactKeys.push(page.markdownArtifactKey);
  }

  if (parts.length === 0) {
    return {
      status: "missing_page_markdown",
      sourceId: input.candidate.sourceId,
      pageNumbers: [],
      pageArtifactKeys: [],
      markdownChars: 0,
      markdownTruncated: false,
      markdownHash: null,
      text: null,
      reason: "The source exists in the manifest but has no readable markdown pages.",
    };
  }

  const raw = parts.join("\n").trim();
  const truncated = truncateContext(raw, input.maxContextChars);
  return {
    status: "available",
    sourceId: input.candidate.sourceId,
    pageNumbers,
    pageArtifactKeys,
    markdownChars: truncated.text.length,
    markdownTruncated: truncated.truncated,
    markdownHash: truncated.hash,
    text: truncated.text,
    reason: null,
  };
}

function proofTool(): { name: string; description: string; parameters: Record<string, unknown> } {
  return {
    name: TIER2_PROOF_TOOL_NAME,
    description: "Submit source-grounded proof for one proposed Tier 2 operational-date anchor.",
    parameters: toProjectJsonSchema(Tier2ProofResultSchema) as Record<string, unknown>,
  };
}

function systemPrompt(): string {
  return [
    "You are a source-evidence verification agent for a NYC bus priority dataset.",
    "Use only the provided document context. Do not rely on outside memory.",
    "Your task is to validate a proposed treatment anchor: route scope, treatment type, operational status, and date.",
    "Return proven only when the context directly supports a realized launch, implementation, or camera enforcement start with a route-linked scope and a date.",
    "Classify planned launches, studies, design milestones, public meetings, agenda dates, observations after implementation, and vague corridor-only mentions as not proven causal anchors.",
    "Treat denied, cancelled, rejected, not-implemented, not-yet-implemented, proposed, expected-to, scheduled-to, will/would, agenda, workshop, public-meeting, study, and design language as non-proving unless another exact quote states realized operation.",
    "Do not infer bus-camera enforcement from substrings. ACE and ABLE count only as exact uppercase tokens or when the quote also says camera/enforcement.",
    "Do not use subway, rail, train, or station-only text as bus-route proof.",
    "Do not trust the candidate metadata. The candidate is only a hypothesis to verify against the document context.",
    "Every evidence quote must be copied exactly from the provided context.",
    "If the context is missing or too weak, return not_found or ambiguous instead of guessing.",
    `Call the ${TIER2_PROOF_TOOL_NAME} tool exactly once.`,
  ].join("\n");
}

export function buildTier2ProofMessages(input: {
  candidate: Tier2ProofCandidate;
  context: Tier2ProofDocumentContext;
}): ToolCallMessage[] {
  const contextPayload =
    input.context.text === null
      ? {
          status: input.context.status,
          reason: input.context.reason,
          instruction:
            "No document text is available. Return not_found unless the supplied candidate metadata alone is being contradicted by the absence of source context.",
        }
      : {
          status: input.context.status,
          pageNumbers: input.context.pageNumbers,
          markdownHash: input.context.markdownHash,
          markdownTruncated: input.context.markdownTruncated,
          text: input.context.text,
        };

  return [
    { role: "system", content: systemPrompt() },
    {
      role: "user",
      content: [
        "Validate this proposed operational-date anchor.",
        "",
        "Candidate:",
        JSON.stringify(input.candidate, null, 2),
        "",
        "Document context:",
        JSON.stringify(contextPayload, null, 2),
        "",
        "Validation standard:",
        "- proofStatus=proven requires exact quoted evidence for date, operational status, route scope, and treatment type.",
        "- routeScope.kind=direct_route or source_single_route_context requires route IDs or route names stated in route-scope evidence.",
        "- If the quote says planned/future/proposed, classify as planned_or_future_launch and do not mark proven for a realized causal anchor.",
        "- If the quote says study/design/workshop/agenda/meeting/observation, classify the non-operational claim type and do not mark proven.",
        "- If the source text contradicts the candidate date/status/route, return contradicted with counterEvidenceSpans.",
        "- Put any remaining unverifiable facts in unvalidatedQuestions.",
      ].join("\n"),
    },
  ];
}

function evidenceSpansSupport(
  spans: readonly Tier2ProofEvidenceSpan[],
  support: z.output<typeof Tier2ProofEvidenceSupportSchema>,
): boolean {
  return spans.some((span) => span.supports.includes(support));
}

function supportingQuotesFromSpans(
  spans: readonly Tier2ProofEvidenceSpan[],
  support: ProofEvidenceSupport,
): string[] {
  return spans.filter((span) => span.supports.includes(support)).map((span) => span.quote);
}

function joinedSupportingTextFromSpans(
  spans: readonly Tier2ProofEvidenceSpan[],
  support: ProofEvidenceSupport,
): string {
  return supportingQuotesFromSpans(spans, support).join(" ");
}

function routeScopeGroundedInResolvedQuote(
  result: Tier2ProofResult,
  evidenceSpans: readonly Tier2ProofEvidenceSpan[],
): boolean {
  const routeQuoteText = normalizeSearchText(
    joinedSupportingTextFromSpans(evidenceSpans, "route_scope"),
  );
  const routeText =
    result.routeScope.routeText === null ? "" : normalizeSearchText(result.routeScope.routeText);
  if (routeTextAppearsInQuote(routeQuoteText, routeText)) return true;
  return result.routeScope.routeIds.some((routeId) =>
    routeIdVariants(routeId).some((variant) => containsToken(routeQuoteText, variant)),
  );
}

function treatmentFamilySupportedByResolvedQuote(input: {
  candidate: Tier2ProofCandidate;
  result: Tier2ProofResult;
  evidenceSpans: readonly Tier2ProofEvidenceSpan[];
}): boolean {
  const treatmentText = joinedSupportingTextFromSpans(input.evidenceSpans, "treatment_type");
  const family = input.candidate.expectedClaim.interventionFamily;
  if (family.includes("camera") || family.includes("enforcement")) {
    return (
      CAMERA_PROGRAM_TOKEN_PATTERN.test(treatmentText) ||
      CAMERA_WORD_SUPPORT_PATTERN.test(treatmentText)
    );
  }
  const rule = TREATMENT_FAMILY_SUPPORT[family];
  if (rule === undefined) return OTHER_BUS_PRIORITY_SUPPORT_PATTERN.test(treatmentText);
  return rule.patterns.some((pattern) => pattern.test(treatmentText));
}

export function validateTier2ProofResult(input: {
  candidate: Tier2ProofCandidate;
  result: Tier2ProofResult;
  contextText: string | null;
  contextStatus: Tier2ProofContextStatus;
}): Tier2ProofValidationIssue[] {
  const issues: Tier2ProofValidationIssue[] = [];
  const { candidate, result } = input;
  const evidenceResolutions = result.evidenceSpans.map((span, index) => ({
    span,
    path: `evidenceSpans[${index}].quote`,
    quoteTooShort: normalizeSearchText(span.quote).length < 12,
    quoteNotFound: !quoteAppearsInContext(span.quote, input.contextText),
  }));
  const counterEvidenceResolutions = result.counterEvidenceSpans.map((span, index) => ({
    span,
    path: `counterEvidenceSpans[${index}].quote`,
    quoteTooShort: normalizeSearchText(span.quote).length < 12,
    quoteNotFound: !quoteAppearsInContext(span.quote, input.contextText),
  }));
  const resolvedEvidenceSpans = evidenceResolutions
    .filter((resolution) => !resolution.quoteTooShort && !resolution.quoteNotFound)
    .map((resolution) => resolution.span);
  const resolvedCounterEvidenceSpans = counterEvidenceResolutions
    .filter((resolution) => !resolution.quoteTooShort && !resolution.quoteNotFound)
    .map((resolution) => resolution.span);
  const resolvedSupports = new Set<ProofEvidenceSupport>(
    resolvedEvidenceSpans.flatMap((span) => span.supports),
  );

  if (result.candidateId !== candidate.candidateId) {
    issues.push(
      issue(
        "error",
        "candidate_id_mismatch",
        `Proof result candidateId '${result.candidateId}' does not match '${candidate.candidateId}'.`,
        "candidateId",
      ),
    );
  }

  if (result.proofStatus === "proven") {
    issues.push(...candidateShapeIssues(candidate));
    for (const resolution of evidenceResolutions) {
      const criticalSupports = resolution.span.supports.filter((support) => support !== "context");
      const isCritical = criticalSupports.some((support) => !resolvedSupports.has(support));
      if (resolution.quoteTooShort) {
        issues.push(
          issue(
            isCritical ? "error" : "warning",
            "evidence_quote_too_short",
            "Evidence quote is too short to be a reliable source span.",
            resolution.path,
          ),
        );
      }
      if (resolution.quoteNotFound) {
        issues.push(
          issue(
            isCritical ? "error" : "warning",
            "evidence_quote_not_found",
            "Evidence quote does not appear in the supplied document context.",
            resolution.path,
          ),
        );
      }
    }
    if (
      input.contextText === null ||
      (input.contextStatus !== "available" && input.contextStatus !== "provided_context")
    ) {
      issues.push(
        issue(
          "error",
          "proven_without_document_context",
          "A proven result requires readable document context.",
        ),
      );
    }
    if (result.evidenceSpans.length === 0) {
      issues.push(
        issue("error", "proven_without_evidence", "A proven result requires evidence spans."),
      );
    }
    if (!proofClaimIsOperational(result.claimType)) {
      issues.push(
        issue(
          "error",
          "non_operational_claim_type",
          `Claim type '${result.claimType}' is not a realized operational anchor.`,
          "claimType",
        ),
      );
    }
    if (
      result.routeScope.kind !== "direct_route" &&
      result.routeScope.kind !== "source_single_route_context"
    ) {
      issues.push(
        issue(
          "error",
          "non_route_linked_scope",
          "A proven causal anchor requires direct route or single-route source-context proof.",
          "routeScope.kind",
        ),
      );
    }
    if (result.dateText === null) {
      issues.push(
        issue(
          "error",
          "proven_without_date",
          "A proven operational anchor requires dateText.",
          "dateText",
        ),
      );
    } else if (
      !implementationMonthMatchesDateText({
        implementationMonth: candidate.expectedClaim.implementationMonth,
        operationalDate: candidate.expectedClaim.operationalDate,
        dateText: result.dateText,
      })
    ) {
      issues.push(
        issue(
          "error",
          "proven_date_mismatch",
          "Proof date does not match the deterministic candidate month/date.",
          "dateText",
        ),
      );
    } else if (
      !resolvedEvidenceSpans.some(
        (span) =>
          span.supports.includes("date") &&
          normalizeSearchText(span.quote).includes(normalizeSearchText(result.dateText ?? "")),
      )
    ) {
      issues.push(
        issue(
          "warning",
          "date_text_not_in_date_quote",
          "dateText should be verbatim text from a date-supporting evidence quote.",
          "dateText",
        ),
      );
    }
    if (!evidenceSpansSupport(resolvedEvidenceSpans, "date")) {
      issues.push(issue("error", "missing_date_support", "No evidence span supports the date."));
    }
    if (!evidenceSpansSupport(resolvedEvidenceSpans, "operational_status")) {
      issues.push(
        issue(
          "error",
          "missing_operational_status_support",
          "No evidence span supports realized operational status.",
        ),
      );
    }
    if (!evidenceSpansSupport(resolvedEvidenceSpans, "route_scope")) {
      issues.push(
        issue("error", "missing_route_scope_support", "No evidence span supports route scope."),
      );
    }
    if (!evidenceSpansSupport(resolvedEvidenceSpans, "treatment_type")) {
      issues.push(
        issue(
          "error",
          "missing_treatment_type_support",
          "No evidence span supports treatment type.",
        ),
      );
    }
    const statusQuotes = supportingQuotesFromSpans(resolvedEvidenceSpans, "operational_status");
    if (!statusQuotes.some((quote) => REALIZED_STATUS_PATTERN.test(quote))) {
      issues.push(
        issue(
          "error",
          "status_quote_lacks_realized_language",
          "Operational-status evidence must state a realized launch, implementation, activation, installation, completion, or service start.",
        ),
      );
    }
    for (const quote of statusQuotes) {
      for (const pattern of NON_REALIZED_STATUS_PATTERNS) {
        if (
          pattern.code === "planned_or_future_language_in_status_quote" &&
          REALIZED_STATUS_PATTERN.test(quote)
        ) {
          continue;
        }
        if (pattern.pattern.test(quote)) {
          issues.push(
            issue(
              "error",
              pattern.code,
              "Operational-status evidence contains non-realized/process language.",
            ),
          );
        }
      }
    }
    if (
      supportingQuotesFromSpans(resolvedEvidenceSpans, "route_scope").some(quoteIsRailOnly) ||
      supportingQuotesFromSpans(resolvedEvidenceSpans, "treatment_type").some(quoteIsRailOnly)
    ) {
      issues.push(
        issue(
          "error",
          "rail_or_subway_only_proof",
          "Route/treatment proof appears to describe rail, subway, train, or station context without bus-route support.",
        ),
      );
    }
    if (!routeScopeGroundedInResolvedQuote(result, resolvedEvidenceSpans)) {
      issues.push(
        issue(
          "error",
          "route_scope_not_grounded_in_quote",
          "Route-scope evidence must contain the route text or route IDs returned by the proof.",
          "routeScope",
        ),
      );
    }
    if (
      (result.routeScope.kind === "direct_route" ||
        result.routeScope.kind === "source_single_route_context") &&
      result.routeScope.routeIds.length === 0
    ) {
      issues.push(
        issue(
          "error",
          "route_linked_scope_without_route_ids",
          "Route-linked proof requires at least one routeId.",
          "routeScope.routeIds",
        ),
      );
    }
    if (
      (result.routeScope.kind === "direct_route" ||
        result.routeScope.kind === "source_single_route_context") &&
      candidate.expectedClaim.routeIds.length > 0 &&
      !routeIdsOverlap(candidate.expectedClaim.routeIds, result.routeScope.routeIds)
    ) {
      issues.push(
        issue(
          "error",
          "expected_route_not_confirmed",
          "Direct route proof does not include any deterministic routeId from the candidate.",
          "routeScope.routeIds",
        ),
      );
    }
    if (
      !treatmentFamilySupportedByResolvedQuote({
        candidate,
        result,
        evidenceSpans: resolvedEvidenceSpans,
      })
    ) {
      issues.push(
        issue(
          "error",
          "treatment_family_not_supported",
          "Treatment evidence does not support the candidate treatment family.",
          "treatmentText",
        ),
      );
    }
    if (result.confidence === "low") {
      issues.push(
        issue("warning", "proven_low_confidence", "A proven anchor should not be low confidence."),
      );
    }
  }

  if (result.proofStatus !== "proven") {
    for (const resolution of evidenceResolutions) {
      if (resolution.quoteTooShort) {
        issues.push(
          issue(
            "warning",
            "evidence_quote_too_short",
            "Evidence quote is too short to be a reliable source span.",
            resolution.path,
          ),
        );
      }
      if (resolution.quoteNotFound) {
        issues.push(
          issue(
            "warning",
            "evidence_quote_not_found",
            "Evidence quote does not appear in the supplied document context.",
            resolution.path,
          ),
        );
      }
    }
  }

  if (result.proofStatus === "contradicted" && result.counterEvidenceSpans.length === 0) {
    issues.push(
      issue(
        "error",
        "contradiction_without_counter_evidence",
        "A contradicted result requires counterEvidenceSpans.",
      ),
    );
  }
  if (result.proofStatus === "contradicted" && result.counterEvidenceSpans.length > 0) {
    for (const resolution of counterEvidenceResolutions) {
      if (resolution.quoteTooShort) {
        issues.push(
          issue(
            "error",
            "evidence_quote_too_short",
            "Counter-evidence quote is too short to be a reliable source span.",
            resolution.path,
          ),
        );
      }
      if (resolution.quoteNotFound) {
        issues.push(
          issue(
            "error",
            "evidence_quote_not_found",
            "Counter-evidence quote does not appear in the supplied document context.",
            resolution.path,
          ),
        );
      }
    }
    if (resolvedCounterEvidenceSpans.length === 0) {
      issues.push(
        issue(
          "error",
          "contradiction_without_resolved_counter_evidence",
          "A contradicted result requires at least one exact counter-evidence span.",
        ),
      );
    }
  }

  return issues;
}

function parseProofResult(value: unknown): {
  result: Tier2ProofResult | null;
  issues: Tier2ProofValidationIssue[];
} {
  const parsed = Tier2ProofResultSchema.safeParse(value);
  if (parsed.success) return { result: parsed.data, issues: [] };
  return {
    result: null,
    issues: parsed.error.issues.map((item) =>
      issue("error", "proof_result_schema_error", item.message, item.path.join(".") || "<root>"),
    ),
  };
}

function proofResultsFromArtifact(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as { results?: unknown; validatedResults?: unknown };
    if (Array.isArray(record.results)) {
      return record.results.map((entry) => {
        if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
          return (entry as { result?: unknown }).result ?? entry;
        }
        return entry;
      });
    }
    if (Array.isArray(record.validatedResults)) {
      return record.validatedResults.map((entry) => {
        if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
          return (entry as { result?: unknown }).result ?? entry;
        }
        return entry;
      });
    }
  }
  throw new Error(
    "Proof results artifact must be an array or contain a results/validatedResults array.",
  );
}

function validateRawProofResult(input: {
  raw: unknown;
  candidatesById: ReadonlyMap<string, Tier2ProofCandidate>;
  contextsByCandidateId: ReadonlyMap<string, Tier2ProofDocumentContext>;
  responseArtifactKey?: string | null;
  toolCallArtifactKey?: string | null;
  errorArtifactKey?: string | null;
}): Tier2ProofValidatedResult {
  const parsed = parseProofResult(input.raw);
  if (parsed.result === null) {
    return {
      candidateId: "<schema_error>",
      validationState: "schema_error",
      proofStatus: null,
      result: null,
      issues: parsed.issues,
      responseArtifactKey: input.responseArtifactKey ?? null,
      toolCallArtifactKey: input.toolCallArtifactKey ?? null,
      errorArtifactKey: input.errorArtifactKey ?? null,
    };
  }
  const candidate = input.candidatesById.get(parsed.result.candidateId);
  if (candidate === undefined) {
    return {
      candidateId: parsed.result.candidateId,
      validationState: "unknown_candidate",
      proofStatus: parsed.result.proofStatus,
      result: parsed.result,
      issues: [
        issue(
          "error",
          "unknown_candidate",
          `No proof candidate exists for '${parsed.result.candidateId}'.`,
          "candidateId",
        ),
      ],
      responseArtifactKey: input.responseArtifactKey ?? null,
      toolCallArtifactKey: input.toolCallArtifactKey ?? null,
      errorArtifactKey: input.errorArtifactKey ?? null,
    };
  }
  const context = input.contextsByCandidateId.get(candidate.candidateId) ?? {
    status: "missing_manifest" as const,
    sourceId: candidate.sourceId,
    pageNumbers: [],
    pageArtifactKeys: [],
    markdownChars: 0,
    markdownTruncated: false,
    markdownHash: null,
    text: null,
    reason: "Context was not generated.",
  };
  const issues = [
    ...parsed.issues,
    ...validateTier2ProofResult({
      candidate,
      result: parsed.result,
      contextText: context.text,
      contextStatus: context.status,
    }),
  ];
  return {
    candidateId: candidate.candidateId,
    validationState: issues.some((item) => item.severity === "error") ? "invalid" : "valid",
    proofStatus: parsed.result.proofStatus,
    result: parsed.result,
    issues,
    responseArtifactKey: input.responseArtifactKey ?? null,
    toolCallArtifactKey: input.toolCallArtifactKey ?? null,
    errorArtifactKey: input.errorArtifactKey ?? null,
  };
}

function envValue(name: "PIONEER_API_KEY"): string | undefined {
  return process.env[name];
}

function countByProofStatus(results: readonly Tier2ProofValidatedResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) {
    if (result.proofStatus === null) continue;
    counts[result.proofStatus] = (counts[result.proofStatus] ?? 0) + 1;
  }
  return counts;
}

function requestPaths(
  requestRootPath: string,
  candidateId: string,
): {
  dir: string;
  requestPath: string;
  responsePath: string;
  toolCallPath: string;
  errorPath: string;
} {
  const dir = join(requestRootPath, safeFileName(candidateId));
  return {
    dir,
    requestPath: join(dir, "request.json"),
    responsePath: join(dir, "response.json"),
    toolCallPath: join(dir, "tool-call.json"),
    errorPath: join(dir, "error.json"),
  };
}

function normalizedExecuteConcurrency(value: number | undefined, workCount: number): number {
  if (workCount <= 0) return 1;
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_EXECUTE_CONCURRENCY;
  return Math.max(1, Math.min(Math.floor(value), workCount));
}

async function buildContextForCandidate(input: {
  candidate: Tier2ProofCandidate;
  pageMarkdownManifest: PageMarkdownManifest | null;
  pageMarkdownRoot: string | null;
  documentContextPath: string | undefined;
  maxContextChars: number;
}): Promise<Tier2ProofDocumentContext> {
  if (input.documentContextPath !== undefined) {
    return readProvidedDocumentContext({
      candidate: input.candidate,
      path: input.documentContextPath,
      maxContextChars: input.maxContextChars,
    });
  }
  return readSourceMarkdownContext({
    candidate: input.candidate,
    manifest: input.pageMarkdownManifest,
    pageMarkdownRoot: input.pageMarkdownRoot,
    maxContextChars: input.maxContextChars,
  });
}

async function readExistingToolCallProof(input: {
  paths: ReturnType<typeof requestPaths>;
  candidatesById: ReadonlyMap<string, Tier2ProofCandidate>;
  contextsByCandidateId: ReadonlyMap<string, Tier2ProofDocumentContext>;
}): Promise<Tier2ProofValidatedResult | null> {
  const toolCallFile = Bun.file(input.paths.toolCallPath);
  if (!(await toolCallFile.exists())) return null;
  const responseArtifactKey = (await Bun.file(input.paths.responsePath).exists())
    ? input.paths.responsePath
    : null;
  return validateRawProofResult({
    raw: await toolCallFile.json(),
    candidatesById: input.candidatesById,
    contextsByCandidateId: input.contextsByCandidateId,
    responseArtifactKey,
    toolCallArtifactKey: input.paths.toolCallPath,
  });
}

async function executeProofRequest(input: {
  apiKey: string;
  model: string;
  maxTokens: number;
  messages: ToolCallMessage[];
  tool: ReturnType<typeof proofTool>;
  paths: ReturnType<typeof requestPaths>;
  candidate: Tier2ProofCandidate;
  candidatesById: ReadonlyMap<string, Tier2ProofCandidate>;
  contextsByCandidateId: ReadonlyMap<string, Tier2ProofDocumentContext>;
  fetcher: FetchLike;
}): Promise<Tier2ProofValidatedResult> {
  try {
    const providerResult = await callPioneerToolCallDirect({
      apiKey: input.apiKey,
      model: input.model,
      maxTokens: input.maxTokens,
      toolName: TIER2_PROOF_TOOL_NAME,
      messages: input.messages,
      tools: [input.tool],
      fetcher: input.fetcher,
    });
    await writeJson(input.paths.responsePath, providerResult.body);
    if (!providerResult.response.ok) {
      throw new Error(
        openRouterErrorMessage(providerResult.body) ??
          `HTTP ${providerResult.response.status} ${providerResult.response.statusText}`,
      );
    }
    const toolArgs = extractToolCallArguments(providerResult.body, TIER2_PROOF_TOOL_NAME);
    if (toolArgs === null) {
      throw new Error(
        missingToolCallErrorMessage({
          responseJson: providerResult.body,
          toolName: TIER2_PROOF_TOOL_NAME,
          maxTokens: input.maxTokens,
        }),
      );
    }
    await writeJson(input.paths.toolCallPath, toolArgs);
    return validateRawProofResult({
      raw: toolArgs,
      candidatesById: input.candidatesById,
      contextsByCandidateId: input.contextsByCandidateId,
      responseArtifactKey: input.paths.responsePath,
      toolCallArtifactKey: input.paths.toolCallPath,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    await writeJson(input.paths.errorPath, {
      candidateId: input.candidate.candidateId,
      error: message,
    });
    return {
      candidateId: input.candidate.candidateId,
      validationState: "schema_error",
      proofStatus: null,
      result: null,
      issues: [issue("error", "llm_execution_error", message)],
      responseArtifactKey: null,
      toolCallArtifactKey: null,
      errorArtifactKey: input.paths.errorPath,
    };
  }
}

function artifactSummary(input: {
  candidates: readonly Tier2ProofCandidate[];
  requests: readonly Tier2ProofRequestRecord[];
  validatedResults: readonly Tier2ProofValidatedResult[];
}): Tier2ProofHarnessArtifact["summary"] {
  const validationErrorCount = input.validatedResults.reduce(
    (sum, result) => sum + result.issues.filter((item) => item.severity === "error").length,
    0,
  );
  const validationWarningCount = input.validatedResults.reduce(
    (sum, result) => sum + result.issues.filter((item) => item.severity === "warning").length,
    0,
  );
  return {
    candidateCount: input.candidates.length,
    requestCount: input.requests.length,
    contextAvailableCount: input.requests.filter(
      (request) =>
        request.contextStatus === "available" || request.contextStatus === "provided_context",
    ).length,
    contextMissingCount: input.requests.filter(
      (request) =>
        request.contextStatus !== "available" && request.contextStatus !== "provided_context",
    ).length,
    validatedResultCount: input.validatedResults.length,
    validProvenCount: input.validatedResults.filter(
      (result) => result.validationState === "valid" && result.proofStatus === "proven",
    ).length,
    validationErrorCount,
    validationWarningCount,
    countsByProofStatus: countByProofStatus(input.validatedResults),
  };
}

export async function runTier2ProofHarness(
  args: RunTier2ProofHarnessArgs,
): Promise<Tier2ProofHarnessArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const model = args.model ?? DEFAULT_MODEL;
  const maxTokens = args.maxTokens ?? DEFAULT_MAX_TOKENS;
  const maxContextChars = args.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
  const requestRootPath =
    args.requestRootPath ??
    join(dirname(args.outputPath), "document-operational-date-proof-requests-v1");
  const pageMarkdownManifest = await loadPageMarkdownManifest(args.pageMarkdownManifestPath);
  const pageMarkdownRoot =
    args.pageMarkdownRoot ??
    (args.pageMarkdownManifestPath === undefined ? null : dirname(args.pageMarkdownManifestPath));
  const assertions = await loadAssertions(args.operationalDateAssertionsPath);
  const candidates = buildTier2ProofCandidates({
    assertions,
    ...(args.candidateIds === undefined ? {} : { candidateIds: args.candidateIds }),
    ...(args.sourceIds === undefined ? {} : { sourceIds: args.sourceIds }),
    ...(args.limitCandidates === undefined ? {} : { limitCandidates: args.limitCandidates }),
  });
  const candidatesById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const contextsByCandidateId = new Map<string, Tier2ProofDocumentContext>();
  const requests: Tier2ProofRequestRecord[] = [];
  const validatedResults: Tier2ProofValidatedResult[] = [];
  const tool = proofTool();
  const executionWork: Array<{
    candidate: Tier2ProofCandidate;
    messages: ToolCallMessage[];
    paths: ReturnType<typeof requestPaths>;
    requestIndex: number;
  }> = [];

  await mkdir(requestRootPath, { recursive: true });
  for (const candidate of candidates) {
    const context = await buildContextForCandidate({
      candidate,
      pageMarkdownManifest,
      pageMarkdownRoot,
      documentContextPath: args.documentContextPath,
      maxContextChars,
    });
    contextsByCandidateId.set(candidate.candidateId, context);
    const paths = requestPaths(requestRootPath, candidate.candidateId);
    await mkdir(paths.dir, { recursive: true });
    const messages = buildTier2ProofMessages({ candidate, context });
    await writeJson(paths.requestPath, {
      version: 1,
      generatedAt,
      promptVersion: TIER2_PROOF_PROMPT_VERSION,
      provider: "pioneer",
      model,
      maxTokens,
      toolName: TIER2_PROOF_TOOL_NAME,
      candidate,
      context: {
        status: context.status,
        sourceId: context.sourceId,
        pageNumbers: context.pageNumbers,
        pageArtifactKeys: context.pageArtifactKeys,
        markdownChars: context.markdownChars,
        markdownTruncated: context.markdownTruncated,
        markdownHash: context.markdownHash,
        reason: context.reason,
      },
      messages,
      tool,
    });
    requests.push({
      candidateId: candidate.candidateId,
      sourceId: candidate.sourceId,
      requestArtifactKey: paths.requestPath,
      responseArtifactKey: null,
      toolCallArtifactKey: null,
      errorArtifactKey: null,
      contextStatus: context.status,
      contextPageNumbers: context.pageNumbers,
      contextChars: context.markdownChars,
      contextTruncated: context.markdownTruncated,
      contextHash: context.markdownHash,
    });

    if (args.execute) {
      executionWork.push({
        candidate,
        messages,
        paths,
        requestIndex: requests.length - 1,
      });
    }
  }

  if (args.execute) {
    const apiKey = args.pioneerApiKey ?? envValue("PIONEER_API_KEY");
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error("PIONEER_API_KEY is required for docs tier2 proof-harness --execute.");
    }
    const concurrency = normalizedExecuteConcurrency(args.executeConcurrency, executionWork.length);
    const executionResults = new Array<Tier2ProofValidatedResult | undefined>(executionWork.length);
    let nextWorkIndex = 0;

    const runWorker = async (): Promise<void> => {
      while (nextWorkIndex < executionWork.length) {
        const workIndex = nextWorkIndex;
        nextWorkIndex += 1;
        const work = executionWork[workIndex];
        if (work === undefined) continue;
        const reused =
          args.reuseExistingResponses === true
            ? await readExistingToolCallProof({
                paths: work.paths,
                candidatesById,
                contextsByCandidateId,
              })
            : null;
        const executed =
          reused ??
          (await executeProofRequest({
            apiKey,
            model,
            maxTokens,
            messages: work.messages,
            tool,
            paths: work.paths,
            candidate: work.candidate,
            candidatesById,
            contextsByCandidateId,
            fetcher: args.fetcher ?? defaultFetch,
          }));
        executionResults[workIndex] = executed;
        const request = requests[work.requestIndex];
        if (request !== undefined) {
          request.responseArtifactKey = executed.responseArtifactKey;
          request.toolCallArtifactKey = executed.toolCallArtifactKey;
          request.errorArtifactKey = executed.errorArtifactKey;
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
    for (const result of executionResults) {
      if (result !== undefined) validatedResults.push(result);
    }
  }

  if (args.proofResultsPath !== undefined) {
    const rawResults = proofResultsFromArtifact(await readJsonFile(args.proofResultsPath));
    for (const raw of rawResults) {
      validatedResults.push(
        validateRawProofResult({
          raw,
          candidatesById,
          contextsByCandidateId,
        }),
      );
    }
  }

  const artifact: Tier2ProofHarnessArtifact = {
    artifactKind: TIER2_PROOF_HARNESS_ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt,
    promptVersion: TIER2_PROOF_PROMPT_VERSION,
    toolName: TIER2_PROOF_TOOL_NAME,
    provider: "pioneer",
    model,
    execute: args.execute ?? false,
    maxTokens,
    maxContextChars,
    sourceArtifacts: {
      operationalDateAssertionsPath: args.operationalDateAssertionsPath,
      pageMarkdownManifestPath: args.pageMarkdownManifestPath ?? null,
      pageMarkdownRoot,
      documentContextPath: args.documentContextPath ?? null,
      proofResultsPath: args.proofResultsPath ?? null,
    },
    summary: artifactSummary({ candidates, requests, validatedResults }),
    candidates,
    requests,
    validatedResults,
  };
  await mkdir(dirname(args.outputPath), { recursive: true });
  await writeJson(args.outputPath, artifact);
  return artifact;
}

function parseProofHarnessArgs(argv: string[]): ProofHarnessCliArgs {
  const options: CliOption<ProofHarnessCliArgs>[] = [
    {
      flags: ["--operational-date-assertions"],
      apply: (output, value) => {
        if (value !== undefined) output.operationalDateAssertionsPath = fromCliPath(value);
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--request-root"],
      apply: (output, value) => {
        if (value !== undefined) output.requestRootPath = fromCliPath(value);
      },
    },
    {
      flags: ["--page-markdown-manifest"],
      apply: (output, value) => {
        if (value !== undefined) output.pageMarkdownManifestPath = fromCliPath(value);
      },
    },
    {
      flags: ["--page-markdown-root"],
      apply: (output, value) => {
        if (value !== undefined) output.pageMarkdownRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--document-context"],
      apply: (output, value) => {
        if (value !== undefined) output.documentContextPath = fromCliPath(value);
      },
    },
    {
      flags: ["--proof-results"],
      apply: (output, value) => {
        if (value !== undefined) output.proofResultsPath = fromCliPath(value);
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
      flags: ["--generated-at"],
      apply: (output, value) => {
        if (value !== undefined) output.generatedAt = value;
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
    {
      flags: ["--max-context-chars"],
      apply: (output, value) => {
        if (value !== undefined) output.maxContextChars = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--execute-concurrency"],
      apply: (output, value) => {
        if (value !== undefined) output.executeConcurrency = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--limit-candidates"],
      apply: (output, value) => {
        if (value !== undefined) output.limitCandidates = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--candidate-ids", "--candidate-id"],
      apply: (output, value) => {
        const parsed = splitList(value);
        if (parsed !== undefined) output.candidateIds = [...(output.candidateIds ?? []), ...parsed];
      },
    },
    {
      flags: ["--source-ids", "--source-id"],
      apply: (output, value) => {
        const parsed = splitList(value);
        if (parsed !== undefined) output.sourceIds = [...(output.sourceIds ?? []), ...parsed];
      },
    },
    trueOption<ProofHarnessCliArgs>(["--execute"], (output) => {
      output.execute = true;
    }),
    trueOption<ProofHarnessCliArgs>(["--reuse-existing-responses"], (output) => {
      output.reuseExistingResponses = true;
    }),
  ];
  return parseCliOptions(argv, {}, options);
}

async function resolveProofHarnessDefaults(args: ProofHarnessCliArgs): Promise<{
  operationalDateAssertionsPath: string;
  outputPath: string;
}> {
  if (args.operationalDateAssertionsPath !== undefined) {
    return {
      operationalDateAssertionsPath: args.operationalDateAssertionsPath,
      outputPath:
        args.outputPath ??
        join(
          dirname(args.operationalDateAssertionsPath),
          "document-operational-date-proof-harness-v1.json",
        ),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --operational-date-assertions.");
  }
  const surfacesDir = join(runArtifactRoot(artifactRoot, runId), "document-derived-surfaces-v1");
  return {
    operationalDateAssertionsPath: join(
      surfacesDir,
      "document-operational-date-assertions-v1.json",
    ),
    outputPath:
      args.outputPath ?? join(surfacesDir, "document-operational-date-proof-harness-v1.json"),
  };
}

export async function runTier2ProofHarnessFromCli(args: string[]): Promise<{
  outputPath: string;
  summary: Tier2ProofHarnessArtifact["summary"];
}> {
  const parsed = parseProofHarnessArgs(args);
  const defaults = await resolveProofHarnessDefaults(parsed);
  const artifact = await runTier2ProofHarness({
    ...defaults,
    ...(parsed.requestRootPath === undefined ? {} : { requestRootPath: parsed.requestRootPath }),
    ...(parsed.pageMarkdownManifestPath === undefined
      ? {}
      : { pageMarkdownManifestPath: parsed.pageMarkdownManifestPath }),
    ...(parsed.pageMarkdownRoot === undefined ? {} : { pageMarkdownRoot: parsed.pageMarkdownRoot }),
    ...(parsed.documentContextPath === undefined
      ? {}
      : { documentContextPath: parsed.documentContextPath }),
    ...(parsed.proofResultsPath === undefined ? {} : { proofResultsPath: parsed.proofResultsPath }),
    ...(parsed.generatedAt === undefined ? {} : { generatedAt: parsed.generatedAt }),
    ...(parsed.model === undefined ? {} : { model: parsed.model }),
    ...(parsed.maxTokens === undefined ? {} : { maxTokens: parsed.maxTokens }),
    ...(parsed.maxContextChars === undefined ? {} : { maxContextChars: parsed.maxContextChars }),
    ...(parsed.limitCandidates === undefined ? {} : { limitCandidates: parsed.limitCandidates }),
    ...(parsed.candidateIds === undefined ? {} : { candidateIds: parsed.candidateIds }),
    ...(parsed.sourceIds === undefined ? {} : { sourceIds: parsed.sourceIds }),
    ...(parsed.execute === undefined ? {} : { execute: parsed.execute }),
    ...(parsed.executeConcurrency === undefined
      ? {}
      : { executeConcurrency: parsed.executeConcurrency }),
    ...(parsed.reuseExistingResponses === undefined
      ? {}
      : { reuseExistingResponses: parsed.reuseExistingResponses }),
  });
  return {
    outputPath: defaults.outputPath,
    summary: artifact.summary,
  };
}
