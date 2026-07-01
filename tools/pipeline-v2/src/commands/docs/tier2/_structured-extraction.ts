// biome-ignore-all lint/style/noNonNullAssertion: Legacy Tier 2 command code is pending plan 024 deletion; existing index assertions are intentional.
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type StructuredDocumentExtraction,
  StructuredDocumentExtractionSchema,
  type StructuredDocumentExtractionToolResponse,
  StructuredDocumentExtractionToolResponseSchema,
  type StructuredExtractionValidationIssue,
} from "@bp/domain/documents/structured-extraction";
import { toProjectJsonSchema } from "@bp/domain/json-schema";
import { writeJson } from "../../../lib/json.ts";
import type { ToolCallMessage } from "../../../lib/llm.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import {
  callDeepSeekToolCallViaPi,
  callPioneerToolCallDirect,
  type OpenRouterCallResult,
  openRouterErrorMessage,
} from "./_llm-clients.ts";
import {
  artifactKey,
  type CliOption,
  defaultFetch,
  extractToolCallArguments,
  type FetchLike,
  latestDocsRunId,
  missingToolCallErrorMessage,
  normalizeOcrArtifactRootName,
  normalizeOcrPageMarkdownRootName,
  ocrPlanPath,
  parseCliOptions,
  parseSourceIds,
  readRequiredJsonArtifact,
  runArtifactRoot,
  type Tier2OcrPageMarkdownAudit,
  type Tier2OcrPageMarkdownAuditPage,
  type Tier2OcrPlan,
  type Tier2OcrPlanSource,
  trueOption,
} from "./_shared.ts";

export const STRUCTURED_DOCUMENT_EXTRACTION_TOOL_NAME = "submit_structured_document_extraction";
export const STRUCTURED_DOCUMENT_EXTRACTION_PROMPT_VERSION = "tier2-structured-extraction-v2";
export const DEFAULT_STRUCTURED_EXTRACTION_PROVIDER = "auto";
export const DEFAULT_PIONEER_STRUCTURED_MODEL = "deepseek-ai/DeepSeek-V4-Flash";
export const DEFAULT_DEEPSEEK_STRUCTURED_MODEL = "deepseek-v4-pro";
export const DEFAULT_STRUCTURED_MAX_TOKENS = 16_000;

export type StructuredExtractionProvider = "auto" | "pioneer" | "deepseek";

export type Tier2StructuredExtractionWindowStatus =
  | "planned"
  | "extracted"
  | "reused"
  | "budget_skipped"
  | "failed";

export type Tier2StructuredExtractionUsage = {
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cacheReadUsdPerMillion: number;
  cacheWriteUsdPerMillion: number;
};

export type Tier2StructuredExtractionWindow = {
  windowId: string;
  sourceId: string;
  pageNumbers: number[];
  status: Tier2StructuredExtractionWindowStatus;
  provider: "pioneer" | "deepseek" | null;
  model: string | null;
  reusedExisting: boolean;
  responseArtifactKey: string | null;
  toolCallArtifactKey: string | null;
  extractionArtifactKey: string | null;
  errorArtifactKey: string | null;
  estimatedCostUsd: number;
  usage: Tier2StructuredExtractionUsage | null;
  validationIssueCounts: Record<string, number>;
  validationIssues: StructuredExtractionValidationIssue[];
  evidenceSpanCount: number;
  claimCount: number;
  tableCount: number;
  interventionEventCount: number;
  serviceChangeCount: number;
  contextSignalCount: number;
  reviewQuestionCount: number;
};

export type Tier2StructuredExtractionArtifact = {
  version: 1;
  runId: string;
  generatedAt: string;
  ocrPlanPath: string;
  pageMarkdownAuditPath: string;
  outputPath: string | null;
  provider: StructuredExtractionProvider;
  model: string;
  fallbackModel: string;
  maxTokens: number;
  pageMarkdownRootName: string;
  structuredRootName: string;
  promptVersion: string;
  execute: boolean;
  pageWindowSize: number;
  windowConcurrency: number;
  maxEstimatedCostUsd: number | null;
  summary: {
    selectedSourceCount: number;
    windowCount: number;
    plannedWindowCount: number;
    extractedWindowCount: number;
    reusedExistingWindowCount: number;
    budgetSkippedWindowCount: number;
    failedWindowCount: number;
    promptTokens: number;
    completionTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    validationErrorCount: number;
    validationWarningCount: number;
    evidenceSpanCount: number;
    claimCount: number;
    tableCount: number;
    interventionEventCount: number;
    serviceChangeCount: number;
    contextSignalCount: number;
    reviewQuestionCount: number;
  };
  windows: Tier2StructuredExtractionWindow[];
  extractions: StructuredDocumentExtraction[];
};

export type ExtractTier2StructuredDocumentsArgs = {
  ocrPlanPath: string;
  pageMarkdownAuditPath: string;
  outputPath?: string;
  generatedAt?: string;
  pageMarkdownRootName?: string;
  structuredRootName?: string;
  provider?: StructuredExtractionProvider;
  model?: string;
  fallbackModel?: string;
  maxTokens?: number;
  maxEstimatedCostUsd?: number;
  sourceIds?: string[];
  limitSources?: number;
  pageWindowSize?: number;
  windowConcurrency?: number;
  execute?: boolean;
  fetcher?: FetchLike;
  pioneerApiKey?: string;
  deepseekApiKey?: string;
};

type StructuredExtractionCliArgs = {
  ocrPlanPath?: string;
  pageMarkdownAuditPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  pageMarkdownRootName?: string;
  structuredRootName?: string;
  provider?: StructuredExtractionProvider;
  model?: string;
  fallbackModel?: string;
  maxTokens?: number;
  maxEstimatedCostUsd?: number;
  sourceIds?: string[];
  limitSources?: number;
  pageWindowSize?: number;
  windowConcurrency?: number;
  execute?: boolean;
};

type SelectedSource = {
  source: Tier2OcrPlanSource;
  sourceIndex: number;
};

type WindowPaths = {
  windowRoot: string;
  responsePath: string;
  toolCallPath: string;
  extractionPath: string;
  errorPath: string;
  attemptsPath: string;
};

type ProviderAttempt = {
  provider: "pioneer" | "deepseek";
  model: string;
  ok: boolean;
  error: string | null;
  usage: Tier2StructuredExtractionUsage | null;
  estimatedCostUsd: number;
};

type StructuredExtractionPrice = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cacheReadUsdPerMillion: number;
  cacheWriteUsdPerMillion: number;
};

const MODEL_PRICES: Record<string, StructuredExtractionPrice> = {
  "deepseek:deepseek-v4-pro": {
    inputUsdPerMillion: 0.435,
    outputUsdPerMillion: 0.87,
    cacheReadUsdPerMillion: 0.003625,
    cacheWriteUsdPerMillion: 0,
  },
  "deepseek:deepseek-v4-flash": {
    inputUsdPerMillion: 0.14,
    outputUsdPerMillion: 0.28,
    cacheReadUsdPerMillion: 0.0028,
    cacheWriteUsdPerMillion: 0,
  },
  "pioneer:deepseek-ai/DeepSeek-V4-Flash": {
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.2,
    cacheReadUsdPerMillion: 0.1,
    cacheWriteUsdPerMillion: 0.1,
  },
  "pioneer:deepseek-ai/DeepSeek-V4-Pro": {
    inputUsdPerMillion: 0.435,
    outputUsdPerMillion: 0.87,
    cacheReadUsdPerMillion: 0.435,
    cacheWriteUsdPerMillion: 0.435,
  },
};

const DEFAULT_PRICE: StructuredExtractionPrice = {
  inputUsdPerMillion: 0.435,
  outputUsdPerMillion: 0.87,
  cacheReadUsdPerMillion: 0.435,
  cacheWriteUsdPerMillion: 0.435,
};

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function numericField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageRecord(body: unknown): Record<string, unknown> | null {
  const root = recordOrNull(body);
  if (root === null) return null;
  return recordOrNull(root["usage"]);
}

function usagePrice(input: {
  provider: "pioneer" | "deepseek";
  model: string;
}): StructuredExtractionPrice {
  return MODEL_PRICES[`${input.provider}:${input.model}`] ?? DEFAULT_PRICE;
}

function estimateUsageCost(input: {
  provider: "pioneer" | "deepseek";
  model: string;
  body: unknown;
}): Tier2StructuredExtractionUsage | null {
  const usage = usageRecord(input.body);
  if (usage === null) return null;
  const details = recordOrNull(usage["prompt_tokens_details"]) ?? {};
  const promptTokens = numericField(usage, "prompt_tokens");
  const completionTokens = numericField(usage, "completion_tokens");
  const cacheReadTokens =
    numericField(usage, "cache_read_tokens") + numericField(details, "cached_tokens");
  const cacheWriteTokens =
    numericField(usage, "cache_write_tokens") + numericField(details, "cache_write_tokens");
  const totalTokens =
    numericField(usage, "total_tokens") ||
    promptTokens + completionTokens + cacheReadTokens + cacheWriteTokens;
  const price = usagePrice(input);
  const billablePromptTokens = Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens);
  const estimatedCostUsd = roundCost(
    (billablePromptTokens * price.inputUsdPerMillion +
      completionTokens * price.outputUsdPerMillion +
      cacheReadTokens * price.cacheReadUsdPerMillion +
      cacheWriteTokens * price.cacheWriteUsdPerMillion) /
      1_000_000,
  );
  return {
    promptTokens,
    completionTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    estimatedCostUsd,
    ...price,
  };
}

function emptyUsage(): Tier2StructuredExtractionUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    inputUsdPerMillion: 0,
    outputUsdPerMillion: 0,
    cacheReadUsdPerMillion: 0,
    cacheWriteUsdPerMillion: 0,
  };
}

function addUsage(
  left: Tier2StructuredExtractionUsage,
  right: Tier2StructuredExtractionUsage | null,
): Tier2StructuredExtractionUsage {
  if (right === null) return left;
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    estimatedCostUsd: roundCost(left.estimatedCostUsd + right.estimatedCostUsd),
    inputUsdPerMillion: 0,
    outputUsdPerMillion: 0,
    cacheReadUsdPerMillion: 0,
    cacheWriteUsdPerMillion: 0,
  };
}

function attemptCost(attempts: ProviderAttempt[]): Tier2StructuredExtractionUsage {
  return attempts.reduce((sum, attempt) => addUsage(sum, attempt.usage), emptyUsage());
}

function persistedUsage(value: unknown): Tier2StructuredExtractionUsage | null {
  const record = recordOrNull(value);
  if (record === null) return null;
  return {
    promptTokens: numericField(record, "promptTokens"),
    completionTokens: numericField(record, "completionTokens"),
    cacheReadTokens: numericField(record, "cacheReadTokens"),
    cacheWriteTokens: numericField(record, "cacheWriteTokens"),
    totalTokens: numericField(record, "totalTokens"),
    estimatedCostUsd: numericField(record, "estimatedCostUsd"),
    inputUsdPerMillion: numericField(record, "inputUsdPerMillion"),
    outputUsdPerMillion: numericField(record, "outputUsdPerMillion"),
    cacheReadUsdPerMillion: numericField(record, "cacheReadUsdPerMillion"),
    cacheWriteUsdPerMillion: numericField(record, "cacheWriteUsdPerMillion"),
  };
}

async function existingAttemptsUsage(path: string): Promise<Tier2StructuredExtractionUsage | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const value = await file.json().catch(() => null);
  if (!Array.isArray(value)) return null;
  return value.reduce<Tier2StructuredExtractionUsage>(
    (sum, attempt) => addUsage(sum, persistedUsage(recordOrNull(attempt)?.["usage"])),
    emptyUsage(),
  );
}

const DOCUMENT_MODES = [
  "implementation_report",
  "project_brochure",
  "board_metrics",
  "route_redesign_plan",
  "methodology",
  "press_release",
  "community_presentation",
  "source_dictionary",
  "other",
] as const;

const PAGE_ROLES = [
  "substantive",
  "table",
  "map",
  "methodology",
  "appendix",
  "title_or_boilerplate",
  "unclear",
] as const;

const SPAN_ROLES = [
  "claim_support",
  "date_support",
  "route_support",
  "location_support",
  "treatment_support",
  "metric_support",
  "methodology_support",
  "caveat_support",
  "table_support",
] as const;

const ENTITY_KINDS = [
  "route",
  "street",
  "corridor",
  "borough",
  "stop",
  "program",
  "agency",
  "date",
] as const;

const ENTITY_ROLES = ["affected", "comparison", "context", "location", "unclear"] as const;

const ENTITY_REF_TYPES = ["route_id", "street_id", "corridor_id", "program_id", "date"] as const;

const ENTITY_MATCH_METHODS = [
  "exact_catalog",
  "alias_catalog",
  "spatial_join",
  "model_suggested",
] as const;

const EVENT_FAMILIES = [
  "busway",
  "bus_lane",
  "transit_signal_priority",
  "camera_enforcement",
  "select_bus_service",
  "stop_consolidation",
  "route_redesign",
  "service_change",
  "curb_management",
  "other",
] as const;

const EVENT_STATUSES = [
  "proposed",
  "planned",
  "approved",
  "implemented",
  "historical_context",
  "unclear",
] as const;

const QUALITY_TIERS = [
  "canonical_milestone_candidate",
  "implemented_treatment_component_candidate",
  "planned_or_proposed_candidate",
  "context_only",
  "needs_review",
] as const;

const DATE_ROLES = [
  "launch",
  "service_start",
  "implemented",
  "approved",
  "proposal_date",
  "report_date",
  "warning_period_start",
  "unknown",
] as const;

const DATE_PRECISIONS = ["day", "month", "year"] as const;

const ROUTE_ROLES = ["affected", "comparison", "context", "unknown"] as const;

const TREATMENT_COMPONENT_TYPES = [
  "red_bus_lane",
  "busway_restriction",
  "tsp",
  "queue_jump",
  "all_door_boarding",
  "off_board_fare_collection",
  "camera_enforcement",
  "stop_change",
  "curb_rule_change",
  "signal_retiming",
  "other",
] as const;

const VALIDATION_STATES = ["unvalidated", "validated", "ambiguous", "rejected"] as const;

const FACT_AUTHORITIES = [
  "agency_official",
  "agency_self_reported_metric",
  "independent_audit",
  "consultant_or_advocacy",
  "unknown",
] as const;

const METRIC_NAMES = [
  "bus_speed",
  "travel_time",
  "ridership",
  "headway",
  "excess_wait",
  "collisions",
  "blocked_stop",
  "on_time_performance",
  "custom",
] as const;

const METRIC_DIRECTIONS = ["increase", "decrease", "no_change", "mixed", "unclear"] as const;

const METRIC_AUTHORITIES = [
  "document_claim_only",
  "official_customer_metric",
  "deterministic_project_metric",
  "third_party_estimate",
] as const;

const TABLE_KINDS = [
  "route_profile",
  "metric_summary",
  "implementation_schedule",
  "stop_change",
  "treatment_inventory",
  "methodology",
  "other",
] as const;

const TABLE_COMPLETENESS = [
  "complete_small_table",
  "contiguous_slice",
  "too_large_summarized",
] as const;

const REVIEW_QUESTION_KINDS = [
  "needs_route_validation",
  "needs_corridor_validation",
  "needs_implementation_date",
  "needs_metric_crosscheck",
  "needs_duplicate_resolution",
  "needs_followup_source",
  "possible_source_gap",
  "possible_detector_gold_label",
] as const;

const PRIORITIES = ["high", "medium", "low"] as const;

const RESEARCH_USE_TAGS = [
  "detector_evidence",
  "detector_counter_evidence",
  "source_gap_seed",
  "causal_treatment_inventory",
  "event_study_window",
  "natural_experiment_context",
  "forecasting_context_feature",
  "event_family_response_drift",
  "public_timeline_candidate",
  "review_packet_context",
  "gold_label_seed",
] as const;

function sha256Hex(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function sameNumberArray(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function markdownBody(markdown: string): string {
  if (!markdown.startsWith("---")) return markdown;
  const marker = "\n---\n";
  const end = markdown.indexOf(marker, 3);
  if (end === -1) return markdown;
  return markdown.slice(end + marker.length);
}

function issue(
  severity: "error" | "warning",
  code: string,
  path: string,
  message: string,
): StructuredExtractionValidationIssue {
  return { severity, code, path, message };
}

function countIssues(issues: StructuredExtractionValidationIssue[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const current of issues) {
    counts[current.code] = (counts[current.code] ?? 0) + 1;
  }
  return counts;
}

function supportTextFor(spanIds: string[], spansById: Map<string, string>): string {
  return spanIds.map((spanId) => spansById.get(spanId) ?? "").join("\n");
}

export function validateStructuredExtraction(input: {
  extraction: StructuredDocumentExtractionToolResponse;
  markdownBody: string;
  expectedSourceId: string;
  expectedPageNumbers: number[];
}): StructuredExtractionValidationIssue[] {
  const issues: StructuredExtractionValidationIssue[] = [];
  const expectedPages = input.expectedPageNumbers.join(",");
  const actualPages = input.extraction.source.pageNumbers.join(",");
  if (input.extraction.source.sourceId !== input.expectedSourceId) {
    issues.push(
      issue(
        "error",
        "source_id_mismatch",
        "source.sourceId",
        `Expected source ${input.expectedSourceId} but tool returned ${input.extraction.source.sourceId}.`,
      ),
    );
  }
  if (actualPages !== expectedPages) {
    issues.push(
      issue(
        "error",
        "page_numbers_mismatch",
        "source.pageNumbers",
        `Expected pages ${expectedPages} but tool returned ${actualPages}.`,
      ),
    );
  }

  const spansById = new Map<string, string>();
  for (const [index, span] of input.extraction.evidenceSpans.entries()) {
    if (spansById.has(span.spanId)) {
      issues.push(
        issue(
          "error",
          "duplicate_evidence_span_id",
          `evidenceSpans.${index}.spanId`,
          `Duplicate evidence span id ${span.spanId}.`,
        ),
      );
    }
    spansById.set(span.spanId, span.quote);
    if (!input.markdownBody.includes(span.quote)) {
      issues.push(
        issue(
          "error",
          "quote_not_found",
          `evidenceSpans.${index}.quote`,
          `Evidence quote for ${span.spanId} is not a contiguous substring of the OCR Markdown body.`,
        ),
      );
    }
  }

  const checkSpanRefs = (spanIds: string[], path: string): void => {
    for (const spanId of spanIds) {
      if (!spansById.has(spanId)) {
        issues.push(
          issue("error", "unknown_evidence_span_ref", path, `Unknown evidenceSpanId ${spanId}.`),
        );
      }
    }
  };

  for (const [index, mention] of input.extraction.entityMentions.entries()) {
    checkSpanRefs(mention.evidenceSpanIds, `entityMentions.${index}.evidenceSpanIds`);
  }
  for (const [index, claim] of input.extraction.claims.entries()) {
    checkSpanRefs(claim.evidenceSpanIds, `claims.${index}.evidenceSpanIds`);
    if (claim.metric?.metricAuthority === "deterministic_project_metric") {
      issues.push(
        issue(
          "error",
          "document_claim_uses_project_metric_authority",
          `claims.${index}.metric.metricAuthority`,
          "Document extraction may not declare deterministic project metrics; use document_claim_only, official_customer_metric, or third_party_estimate.",
        ),
      );
    }
    if (claim.metric !== undefined) {
      const supportText = supportTextFor(claim.evidenceSpanIds, spansById);
      if (!supportText.includes(claim.metric.valueText)) {
        issues.push(
          issue(
            "error",
            "metric_value_text_not_supported",
            `claims.${index}.metric.valueText`,
            "Metric valueText must appear in the cited evidence span.",
          ),
        );
      }
    }
  }
  for (const [index, table] of input.extraction.tables.entries()) {
    checkSpanRefs(table.evidenceSpanIds, `tables.${index}.evidenceSpanIds`);
  }
  for (const [index, event] of input.extraction.interventionEvents.entries()) {
    checkSpanRefs(event.evidenceSpanIds, `interventionEvents.${index}.evidenceSpanIds`);
    for (const [componentIndex, component] of event.components.entries()) {
      checkSpanRefs(
        component.evidenceSpanIds,
        `interventionEvents.${index}.components.${componentIndex}.evidenceSpanIds`,
      );
    }
    if (event.qualityTier === "planned_or_proposed_candidate" && event.status === "implemented") {
      issues.push(
        issue(
          "error",
          "planned_candidate_marked_implemented",
          `interventionEvents.${index}.status`,
          "A planned/proposed candidate cannot also be marked implemented.",
        ),
      );
    }
    if (
      event.status === "implemented" &&
      (event.dateRole === "proposal_date" || event.dateRole === "report_date")
    ) {
      issues.push(
        issue(
          "error",
          "implemented_event_uses_non_implementation_date_role",
          `interventionEvents.${index}.dateRole`,
          "Implemented events cannot use proposal_date or report_date as their implementation date role.",
        ),
      );
    }
    if (event.researchUseTags.includes("public_timeline_candidate") && event.date === undefined) {
      issues.push(
        issue(
          "error",
          "public_timeline_candidate_missing_date",
          `interventionEvents.${index}.date`,
          "Public timeline candidates need a supported date before promotion.",
        ),
      );
    }
    const researchNeedsScope =
      event.researchUseTags.includes("causal_treatment_inventory") ||
      event.researchUseTags.includes("event_study_window") ||
      event.researchUseTags.includes("event_family_response_drift");
    if (
      researchNeedsScope &&
      event.routeRoles.length === 0 &&
      event.location.corridorRaw === undefined &&
      event.location.normalizedCorridorRef === undefined
    ) {
      issues.push(
        issue(
          "error",
          "research_event_missing_scope",
          `interventionEvents.${index}`,
          "Causal/event-study/response-drift candidates need route or corridor scope.",
        ),
      );
    }
  }
  for (const [index, serviceChange] of input.extraction.serviceChanges.entries()) {
    checkSpanRefs(serviceChange.evidenceSpanIds, `serviceChanges.${index}.evidenceSpanIds`);
  }
  for (const [index, signal] of input.extraction.contextSignals.entries()) {
    checkSpanRefs(signal.evidenceSpanIds, `contextSignals.${index}.evidenceSpanIds`);
  }
  for (const [index, question] of input.extraction.reviewQuestions.entries()) {
    checkSpanRefs(question.evidenceSpanIds, `reviewQuestions.${index}.evidenceSpanIds`);
  }

  if (
    input.extraction.pageProfile.extractionShouldProceed &&
    input.extraction.evidenceSpans.length === 0
  ) {
    issues.push(
      issue(
        "warning",
        "proceed_page_has_no_evidence_spans",
        "evidenceSpans",
        "Page profile says extraction should proceed but no evidence spans were submitted.",
      ),
    );
  }
  return issues;
}

function structuredExtractionTool(): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: STRUCTURED_DOCUMENT_EXTRACTION_TOOL_NAME,
    description:
      "Submit structured, quote-backed extraction for one OCR Markdown page or page window. Use only the supplied Markdown and source metadata.",
    parameters: toProjectJsonSchema(StructuredDocumentExtractionToolResponseSchema) as Record<
      string,
      unknown
    >,
  };
}

const STRUCTURED_EXTRACTION_SYSTEM_PROMPT = [
  "You are the Tier 2 structured document extraction agent for Bus Priority Impact Studio.",
  "Stable contract: deterministic, quote-backed extraction only; no memory, no inferred facts, no project-computed metrics.",
  "Use only the supplied OCR Markdown pages and source metadata. Do not rely on memory.",
  "You must call the submit_structured_document_extraction tool exactly once.",
  "Always include the full required tool envelope: source, pageProfile, evidence arrays, and extractionAudit.",
  "Copy source metadata from the prompt exactly; the extraction engine will validate sourceId and pageNumbers.",
  "Set pageProfile even for empty/title pages. For empty pages set extractionShouldProceed=false and provide skipReason.",
  "Set extractionAudit.promptVersion to the supplied prompt version if present; use candidateCounts to summarize array lengths.",
  `Use only these researchUseTags when tags are useful: ${RESEARCH_USE_TAGS.join(", ")}.`,
  "Every claim, event, table, context signal, and review question must cite evidenceSpanIds.",
  "Every evidenceSpan.quote must be a short contiguous verbatim substring from the supplied Markdown body.",
  "Numeric metric valueText must appear exactly in a cited evidence span.",
  "Document prose is evidence, not metric truth. Agency self-reported speed, wait, collision, ridership, or effect statements are document claims, not deterministic project metrics.",
  "Keep raw route, street, corridor, and date mentions separate from validated refs. Only mark normalized refs validated when the lookup evidence is decisive.",
  "Do not promote proposed, planned, report-date, or recommendation language into implemented events.",
  "Route redesign pages usually create serviceChange candidates, not bus-priority intervention events, unless a quoted treatment is explicit.",
  "Tables should be represented as tables when rows or cells carry route, status, metric, schedule, or stop-change meaning.",
  "If a page is title/boilerplate or contains no extractable facts, set extractionShouldProceed=false, include a skipReason, and submit empty arrays.",
].join("\n");

function buildStructuredExtractionPrompt(input: {
  source: Tier2OcrPlanSource;
  pages: Tier2OcrPageMarkdownAuditPage[];
  markdownText: string;
  pageArtifactKeys: string[];
  markdownHash: string;
}): string {
  const stableSourceMetadata = {
    sourceId: input.source.sourceId,
    sourceTitle: input.source.title,
    publisher: input.source.publisher,
    sourceGroup: input.source.sourceGroup,
    finalUrl: input.source.finalUrl,
    documentDateState: "unknown",
    sourceContentHash: input.source.sha256,
  };
  const pageWindowMetadata = {
    pageNumbers: input.pages.map((page) => page.pageNumber),
    pageArtifactKeys: input.pageArtifactKeys,
    markdownHash: input.markdownHash,
  };
  return [
    "STABLE EXTRACTION CONTRACT",
    `Prompt version: ${STRUCTURED_DOCUMENT_EXTRACTION_PROMPT_VERSION}`,
    `Tool name: ${STRUCTURED_DOCUMENT_EXTRACTION_TOOL_NAME}`,
    `Allowed researchUseTags: ${RESEARCH_USE_TAGS.join(", ")}`,
    "Return one tool call. Use exact source/page metadata below. Evidence quotes must be contiguous substrings of the OCR Markdown.",
    "",
    "STABLE SOURCE METADATA",
    JSON.stringify(stableSourceMetadata, null, 2),
    "",
    "PAGE WINDOW METADATA",
    JSON.stringify(pageWindowMetadata, null, 2),
    "",
    "REQUIRED SOURCE OBJECT FOR TOOL CALL",
    JSON.stringify(
      {
        ...stableSourceMetadata,
        ...pageWindowMetadata,
      },
      null,
      2,
    ),
    "",
    "REQUIRED EXTRACTION AUDIT STABLE FIELDS",
    JSON.stringify(
      {
        promptVersion: STRUCTURED_DOCUMENT_EXTRACTION_PROMPT_VERSION,
        toolSchemaVersion: "1",
      },
      null,
      2,
    ),
    "",
    "VOLATILE PAGE/WINDOW OCR MARKDOWN",
    input.markdownText,
  ].join("\n");
}

function sourceRoot(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  sourceIndex: number;
  structuredRootName: string;
}): string {
  return join(
    input.runRoot,
    input.structuredRootName,
    "sources",
    `${String(input.sourceIndex + 1).padStart(4, "0")}_${input.source.sourceId}`,
  );
}

function windowPaths(input: { sourceRoot: string; pages: number[] }): WindowPaths {
  const label = `${String(input.pages[0] ?? 0).padStart(4, "0")}-${String(
    input.pages.at(-1) ?? 0,
  ).padStart(4, "0")}`;
  const windowRoot = join(input.sourceRoot, "windows", label);
  return {
    windowRoot,
    responsePath: join(windowRoot, "structured-extraction-response.json"),
    toolCallPath: join(windowRoot, "structured-extraction-tool-call.json"),
    extractionPath: join(windowRoot, "structured-extraction.json"),
    errorPath: join(windowRoot, "error.json"),
    attemptsPath: join(windowRoot, "provider-attempts.json"),
  };
}

async function readMarkdownWindow(input: {
  runRoot: string;
  pages: Tier2OcrPageMarkdownAuditPage[];
}): Promise<{ markdownText: string; markdownBodyText: string; pageArtifactKeys: string[] }> {
  const parts: string[] = [];
  const pageArtifactKeys: string[] = [];
  for (const page of input.pages) {
    if (page.markdownArtifactKey === null) {
      throw new Error(`Page ${page.sourceId}/${page.pageNumber} has no markdown artifact key.`);
    }
    pageArtifactKeys.push(page.markdownArtifactKey);
    const markdown = await Bun.file(join(input.runRoot, page.markdownArtifactKey)).text();
    parts.push(`\n\n<!-- page ${page.pageNumber} -->\n\n${markdownBody(markdown)}`);
  }
  const markdownText = parts.join("\n");
  return {
    markdownText,
    markdownBodyText: markdownText,
    pageArtifactKeys,
  };
}

function chunkPages<T>(pages: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < pages.length; index += size) {
    chunks.push(pages.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function selectedSources(input: {
  plan: Tier2OcrPlan;
  sourceIds: string[] | undefined;
  limitSources: number | undefined;
}): SelectedSource[] {
  const filter = input.sourceIds === undefined ? null : new Set(input.sourceIds);
  const selected: SelectedSource[] = [];
  for (const [sourceIndex, source] of input.plan.sources.entries()) {
    if (filter !== null && !filter.has(source.sourceId)) continue;
    selected.push({ source, sourceIndex });
    if (input.limitSources !== undefined && selected.length >= input.limitSources) break;
  }
  return selected;
}

async function existingExtraction(input: {
  path: string;
  expectedPromptVersion: string;
  expectedSourceId: string;
  expectedPageNumbers: number[];
  expectedPageArtifactKeys: string[];
  expectedMarkdownHash: string;
}): Promise<StructuredDocumentExtraction | null> {
  const file = Bun.file(input.path);
  if (!(await file.exists())) return null;
  const parsed = StructuredDocumentExtractionSchema.safeParse(await file.json());
  if (!parsed.success) return null;
  const extraction = parsed.data;
  if (extraction.extractionAudit.promptVersion !== input.expectedPromptVersion) return null;
  if (extraction.source.sourceId !== input.expectedSourceId) return null;
  if (!sameNumberArray(extraction.source.pageNumbers, input.expectedPageNumbers)) return null;
  if (!sameStringArray(extraction.source.pageArtifactKeys, input.expectedPageArtifactKeys)) {
    return null;
  }
  if (extraction.source.markdownHash !== input.expectedMarkdownHash) return null;
  return extraction;
}

async function deleteIfExists(path: string): Promise<void> {
  const file = Bun.file(path);
  if (await file.exists()) {
    await file.delete();
  }
}

function extractionFromToolResponse(input: {
  toolResponse: StructuredDocumentExtractionToolResponse;
  extractionId: string;
  validationState: "extracted" | "reused";
  validationIssues: StructuredExtractionValidationIssue[];
}): StructuredDocumentExtraction {
  return StructuredDocumentExtractionSchema.parse({
    ...input.toolResponse,
    extractionId: input.extractionId,
    validationState: input.validationState,
    validationIssues: input.validationIssues,
  });
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function enumOr<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function optionalEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function normalizeResearchUseTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (tag): tag is string =>
      typeof tag === "string" && (RESEARCH_USE_TAGS as readonly string[]).includes(tag),
  );
}

function stripEmptyStrings(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== "" && item !== null)
      .map((item) => stripEmptyStrings(item));
  }
  const record = recordOrNull(value);
  if (record === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, current] of Object.entries(record)) {
    if (current === "" || current === null) continue;
    result[key] = stripEmptyStrings(current);
  }
  return result;
}

function hasRawMetricClaim(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((claim) => recordOrNull(claim)?.["metric"] !== undefined);
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = recordOrNull(item);
    return record === null ? [] : [record];
  });
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => Number.isInteger(item) && item > 0);
}

function normalizeEvidenceSpans(value: unknown): unknown {
  return recordArray(value).flatMap((span) => {
    if (
      typeof span["spanId"] !== "string" ||
      typeof span["quote"] !== "string" ||
      typeof span["quoteHash"] !== "string"
    ) {
      return [];
    }
    const pageRefs = numberArray(span["pageRefs"]);
    if (pageRefs.length === 0) return [];
    return [
      {
        spanId: span["spanId"],
        pageRefs,
        quote: span["quote"],
        quoteHash: span["quoteHash"],
        spanRole: enumOr(span["spanRole"], SPAN_ROLES, "claim_support"),
      },
    ];
  });
}

function inferEntityKind(input: {
  rawText: unknown;
  entityKind: unknown;
}): (typeof ENTITY_KINDS)[number] {
  if (
    typeof input.entityKind === "string" &&
    (ENTITY_KINDS as readonly string[]).includes(input.entityKind)
  ) {
    return input.entityKind as (typeof ENTITY_KINDS)[number];
  }
  const rawText = typeof input.rawText === "string" ? input.rawText : "";
  if (
    /^B[0-9]{1,3}\\w?$|^M[0-9]{1,3}\\w?$|^Q[0-9]{1,3}\\w?$|^S[0-9]{1,3}\\w?$|^Bx[0-9]{1,3}\\w?$/i.test(
      rawText.trim(),
    )
  ) {
    return "route";
  }
  if (
    /\\b(st|street|ave|avenue|blvd|boulevard|road|rd|drive|dr|parkway|pkwy|place|pl)\\b/i.test(
      rawText,
    )
  ) {
    return "street";
  }
  if (/\\b(20\\d{2}|19\\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\\b/i.test(rawText)) {
    return "date";
  }
  if (/\\b(manhattan|brooklyn|queens|bronx|staten island)\\b/i.test(rawText)) {
    return "borough";
  }
  if (/\\b(dot|mta|nyct|department|agency)\\b/i.test(rawText)) {
    return "agency";
  }
  return "program";
}

function normalizeEntityRef(value: unknown): unknown {
  const ref = recordOrNull(value);
  if (ref === null) return undefined;
  if (
    typeof ref["refId"] !== "string" ||
    ref["refId"].trim() === "" ||
    optionalEnum(ref["refType"], ENTITY_REF_TYPES) === undefined ||
    optionalEnum(ref["matchMethod"], ENTITY_MATCH_METHODS) === undefined ||
    optionalEnum(ref["matchConfidence"], PRIORITIES) === undefined
  ) {
    return undefined;
  }
  return {
    refType: ref["refType"],
    refId: ref["refId"],
    matchMethod: ref["matchMethod"],
    matchConfidence: ref["matchConfidence"],
  };
}

function normalizeRouteRoles(value: unknown): unknown {
  return recordArray(value).map((role) => {
    return {
      ...role,
      role: enumOr(role["role"], ROUTE_ROLES, "unknown"),
    };
  });
}

function normalizeEntityMentions(value: unknown): unknown {
  return recordArray(value).flatMap((mention) => {
    if (
      typeof mention["mentionId"] !== "string" ||
      typeof mention["rawText"] !== "string" ||
      mention["rawText"].trim() === ""
    ) {
      return [];
    }
    const normalizedRef = normalizeEntityRef(mention["normalizedRef"]);
    return [
      {
        mentionId: mention["mentionId"],
        evidenceSpanIds: stringArray(mention["evidenceSpanIds"]),
        rawText: mention["rawText"],
        entityKind: inferEntityKind({
          rawText: mention["rawText"],
          entityKind: mention["entityKind"],
        }),
        rawRole: enumOr(mention["rawRole"], ENTITY_ROLES, "unclear"),
        ...(normalizedRef === undefined ? {} : { normalizedRef }),
        validationState: enumOr(mention["validationState"], VALIDATION_STATES, "unvalidated"),
      },
    ];
  });
}

function normalizeTreatmentComponents(value: unknown): unknown {
  return recordArray(value).map((component) => {
    return {
      ...component,
      componentType: enumOr(component["componentType"], TREATMENT_COMPONENT_TYPES, "other"),
      status: enumOr(component["status"], EVENT_STATUSES, "unclear"),
    };
  });
}

function normalizeMetric(value: unknown): unknown {
  const metric = recordOrNull(value);
  if (metric === null || typeof metric["valueText"] !== "string") return undefined;
  const metricName = enumOr(metric["metricName"], METRIC_NAMES, "custom");
  const direction = optionalEnum(metric["direction"], METRIC_DIRECTIONS);
  const {
    metricName: _metricName,
    direction: _direction,
    metricAuthority: _metricAuthority,
    ...metricRest
  } = metric;
  return {
    ...metricRest,
    metricName,
    ...(metricName === "custom" && typeof metric["customMetricName"] !== "string"
      ? {
          customMetricName:
            typeof metric["metricName"] === "string" ? metric["metricName"] : "custom",
        }
      : {}),
    metricAuthority: enumOr(metric["metricAuthority"], METRIC_AUTHORITIES, "document_claim_only"),
    ...(direction === undefined ? {} : { direction }),
  };
}

function normalizeClaims(value: unknown): unknown {
  return recordArray(value).map((claim) => {
    const { metric: _metric, factAuthority: _factAuthority, ...claimWithoutMetric } = claim;
    const metric = normalizeMetric(claim["metric"]);
    return {
      ...claimWithoutMetric,
      factAuthority: enumOr(claim["factAuthority"], FACT_AUTHORITIES, "unknown"),
      ...(metric === undefined ? {} : { metric }),
      researchUseTags: normalizeResearchUseTags(claim["researchUseTags"]),
    };
  });
}

function normalizeTables(value: unknown): unknown {
  return recordArray(value).flatMap((table) => {
    if (typeof table["tableId"] !== "string") return [];
    const evidenceSpanIds = stringArray(table["evidenceSpanIds"]);
    if (evidenceSpanIds.length === 0) return [];
    const rows = recordArray(table["rows"]).flatMap((row, index) => {
      const cells = stringArray(row["cells"]);
      if (cells.length === 0) return [];
      return [
        {
          rowIndex:
            typeof row["rowIndex"] === "number" && Number.isInteger(row["rowIndex"])
              ? row["rowIndex"]
              : index,
          cells,
          entityMentionIds: stringArray(row["entityMentionIds"]),
          extractedClaimIds: stringArray(row["extractedClaimIds"]),
        },
      ];
    });
    return [
      {
        tableId: table["tableId"],
        evidenceSpanIds,
        ...(typeof table["title"] === "string" ? { title: table["title"] } : {}),
        tableKind: enumOr(table["tableKind"], TABLE_KINDS, "other"),
        headers: stringArray(table["headers"]),
        rows,
        footnotes: stringArray(table["footnotes"]),
        tableCompleteness: enumOr(
          table["tableCompleteness"],
          TABLE_COMPLETENESS,
          "contiguous_slice",
        ),
      },
    ];
  });
}

function normalizeInterventionEvents(value: unknown): unknown {
  return recordArray(value).flatMap((event) => {
    if (!Array.isArray(event["evidenceSpanIds"]) || event["evidenceSpanIds"].length === 0) {
      return [];
    }
    const datePrecision = optionalEnum(event["datePrecision"], DATE_PRECISIONS);
    const { datePrecision: _datePrecision, ...eventWithoutDatePrecision } = event;
    const normalized = {
      ...eventWithoutDatePrecision,
      eventFamily: enumOr(event["eventFamily"], EVENT_FAMILIES, "other"),
      status: enumOr(event["status"], EVENT_STATUSES, "unclear"),
      qualityTier: enumOr(event["qualityTier"], QUALITY_TIERS, "needs_review"),
      dateRole: enumOr(event["dateRole"], DATE_ROLES, "unknown"),
      routeRoles: normalizeRouteRoles(event["routeRoles"] ?? []),
      location: recordOrNull(event["location"]) ?? {},
      components: normalizeTreatmentComponents(event["components"] ?? []),
      researchUseTags: normalizeResearchUseTags(event["researchUseTags"]),
      duplicateFingerprint:
        typeof event["duplicateFingerprint"] === "string" &&
        event["duplicateFingerprint"].length > 0
          ? event["duplicateFingerprint"]
          : shortHash(JSON.stringify(event)),
      ...(datePrecision === undefined ? {} : { datePrecision }),
    };
    return [normalized];
  });
}

function normalizeContextSignals(value: unknown): unknown {
  return recordArray(value).flatMap((signal) => {
    const evidenceSpanIds = stringArray(signal["evidenceSpanIds"]);
    if (evidenceSpanIds.length === 0) return [];
    return [
      {
        ...signal,
        evidenceSpanIds,
        researchUseTags: normalizeResearchUseTags(signal["researchUseTags"]),
      },
    ];
  });
}

function normalizeReviewQuestions(value: unknown): unknown {
  return recordArray(value).flatMap((question) => {
    if (typeof question["question"] !== "string" || question["question"].trim() === "") {
      return [];
    }
    return [
      {
        ...question,
        questionKind: enumOr(
          question["questionKind"],
          REVIEW_QUESTION_KINDS,
          "needs_followup_source",
        ),
        question: question["question"].trim(),
        priority: enumOr(question["priority"], PRIORITIES, "medium"),
      },
    ];
  });
}

function withDeterministicExtractionEnvelope(input: {
  toolArgs: unknown;
  source: Tier2OcrPlanSource;
  pageNumbers: number[];
  pageArtifactKeys: string[];
  markdownHash: string;
  modelId: string;
  extractedAt: string;
  pageWindowId: string;
}): unknown {
  const root = recordOrNull(stripEmptyStrings(input.toolArgs));
  if (root === null) return input.toolArgs;
  const pageProfile = recordOrNull(root["pageProfile"]) ?? {};
  const extractionAudit = recordOrNull(root["extractionAudit"]) ?? {};
  const containsTable = arrayLength(root["tables"]) > 0;
  const containsInterventionEvidence =
    arrayLength(root["interventionEvents"]) > 0 || arrayLength(root["serviceChanges"]) > 0;
  const containsMetricClaim = hasRawMetricClaim(root["claims"]);
  const hasExtractedContent =
    arrayLength(root["evidenceSpans"]) > 0 ||
    arrayLength(root["entityMentions"]) > 0 ||
    arrayLength(root["claims"]) > 0 ||
    containsTable ||
    containsInterventionEvidence ||
    arrayLength(root["contextSignals"]) > 0 ||
    arrayLength(root["reviewQuestions"]) > 0;
  const candidateCounts = {
    evidenceSpans: arrayLength(root["evidenceSpans"]),
    entityMentions: arrayLength(root["entityMentions"]),
    claims: arrayLength(root["claims"]),
    tables: arrayLength(root["tables"]),
    interventionEvents: arrayLength(root["interventionEvents"]),
    serviceChanges: arrayLength(root["serviceChanges"]),
    contextSignals: arrayLength(root["contextSignals"]),
    reviewQuestions: arrayLength(root["reviewQuestions"]),
    ...(recordOrNull(extractionAudit["candidateCounts"]) ?? {}),
  };
  return {
    evidenceSpans: normalizeEvidenceSpans(root["evidenceSpans"]),
    entityMentions: normalizeEntityMentions(root["entityMentions"]),
    claims: normalizeClaims(root["claims"] ?? []),
    tables: normalizeTables(root["tables"]),
    interventionEvents: normalizeInterventionEvents(root["interventionEvents"] ?? []),
    serviceChanges: recordArray(root["serviceChanges"]),
    contextSignals: normalizeContextSignals(root["contextSignals"] ?? []),
    reviewQuestions: normalizeReviewQuestions(root["reviewQuestions"]),
    source: {
      sourceId: input.source.sourceId,
      sourceTitle: input.source.title,
      publisher: input.source.publisher,
      sourceGroup: input.source.sourceGroup,
      finalUrl: input.source.finalUrl,
      documentDateState: "unknown",
      pageNumbers: input.pageNumbers,
      pageArtifactKeys: input.pageArtifactKeys,
      markdownHash: input.markdownHash,
      sourceContentHash: input.source.sha256,
    },
    pageProfile: {
      ...pageProfile,
      documentMode: enumOr(pageProfile["documentMode"], DOCUMENT_MODES, "other"),
      pageRole: enumOr(
        pageProfile["pageRole"],
        PAGE_ROLES,
        containsTable ? "table" : hasExtractedContent ? "substantive" : "unclear",
      ),
      containsInterventionEvidence:
        typeof pageProfile["containsInterventionEvidence"] === "boolean"
          ? pageProfile["containsInterventionEvidence"]
          : containsInterventionEvidence,
      containsMetricClaim:
        typeof pageProfile["containsMetricClaim"] === "boolean"
          ? pageProfile["containsMetricClaim"]
          : containsMetricClaim,
      containsTable:
        typeof pageProfile["containsTable"] === "boolean"
          ? pageProfile["containsTable"]
          : containsTable,
      containsMapOrFigure:
        typeof pageProfile["containsMapOrFigure"] === "boolean"
          ? pageProfile["containsMapOrFigure"]
          : false,
      extractionShouldProceed:
        typeof pageProfile["extractionShouldProceed"] === "boolean"
          ? pageProfile["extractionShouldProceed"]
          : hasExtractedContent,
      ...(!hasExtractedContent && typeof pageProfile["skipReason"] !== "string"
        ? { skipReason: "No extractable structured facts found in this page window." }
        : {}),
    },
    extractionAudit: {
      ...extractionAudit,
      promptVersion: STRUCTURED_DOCUMENT_EXTRACTION_PROMPT_VERSION,
      modelId: input.modelId,
      toolSchemaVersion: "1",
      extractedAt: input.extractedAt,
      pageWindowId: input.pageWindowId,
      candidateCounts,
      skippedReasons: Array.isArray(extractionAudit["skippedReasons"])
        ? extractionAudit["skippedReasons"]
        : [],
      modelNotes:
        typeof extractionAudit["modelNotes"] === "string" ? extractionAudit["modelNotes"] : "",
    },
  };
}

function parseProviderExtraction(input: {
  result: OpenRouterCallResult;
  maxTokens: number;
  extractionId: string;
  source: Tier2OcrPlanSource;
  pageArtifactKeys: string[];
  markdownHash: string;
  modelId: string;
  extractedAt: string;
  pageWindowId: string;
  markdownBody: string;
  expectedSourceId: string;
  expectedPageNumbers: number[];
}): {
  toolArgs: unknown;
  extraction: StructuredDocumentExtraction;
  validationIssues: StructuredExtractionValidationIssue[];
} {
  const toolArgs = extractToolCallArguments(
    input.result.body,
    STRUCTURED_DOCUMENT_EXTRACTION_TOOL_NAME,
  );
  if (toolArgs === null) {
    throw new Error(
      missingToolCallErrorMessage({
        responseJson: input.result.body,
        toolName: STRUCTURED_DOCUMENT_EXTRACTION_TOOL_NAME,
        maxTokens: input.maxTokens,
      }),
    );
  }
  const canonicalToolArgs = withDeterministicExtractionEnvelope({
    toolArgs,
    source: input.source,
    pageNumbers: input.expectedPageNumbers,
    pageArtifactKeys: input.pageArtifactKeys,
    markdownHash: input.markdownHash,
    modelId: input.modelId,
    extractedAt: input.extractedAt,
    pageWindowId: input.pageWindowId,
  });
  const parsed = StructuredDocumentExtractionToolResponseSchema.safeParse(canonicalToolArgs);
  if (!parsed.success) {
    throw new Error(
      `Structured extraction tool args failed schema validation: ${parsed.error.issues
        .slice(0, 5)
        .map((current) => `${current.path.join(".") || "<root>"}: ${current.message}`)
        .join("; ")}`,
    );
  }
  const validationIssues = validateStructuredExtraction({
    extraction: parsed.data,
    markdownBody: input.markdownBody,
    expectedSourceId: input.expectedSourceId,
    expectedPageNumbers: input.expectedPageNumbers,
  });
  const extraction = extractionFromToolResponse({
    toolResponse: parsed.data,
    extractionId: input.extractionId,
    validationState: "extracted",
    validationIssues,
  });
  return { toolArgs: canonicalToolArgs, extraction, validationIssues };
}

function markLatestSuccessfulAttemptFailed(
  attempts: ProviderAttempt[],
  message: string,
): ProviderAttempt[] {
  const updated = attempts.map((attempt) => ({ ...attempt }));
  for (let index = updated.length - 1; index >= 0; index -= 1) {
    const attempt = updated[index];
    if (attempt !== undefined && attempt.ok) {
      updated[index] = { ...attempt, ok: false, error: message };
      return updated;
    }
  }
  return updated;
}

async function callProvider(input: {
  provider: "pioneer" | "deepseek";
  model: string;
  apiKey: string;
  maxTokens: number;
  messages: ToolCallMessage[];
  tool: { name: string; description: string; parameters: Record<string, unknown> };
  fetcher?: FetchLike;
}): Promise<OpenRouterCallResult> {
  const common = {
    apiKey: input.apiKey,
    model: input.model,
    maxTokens: input.maxTokens,
    toolName: STRUCTURED_DOCUMENT_EXTRACTION_TOOL_NAME,
    messages: input.messages,
    tools: [input.tool],
    ...(input.fetcher === undefined ? {} : { fetcher: input.fetcher }),
  };
  return input.provider === "pioneer"
    ? callPioneerToolCallDirect({ ...common, fetcher: input.fetcher ?? defaultFetch })
    : callDeepSeekToolCallViaPi(common);
}

async function callWithProviderFallback(input: {
  provider: StructuredExtractionProvider;
  model: string;
  fallbackModel: string;
  pioneerApiKey: string | undefined;
  deepseekApiKey: string | undefined;
  maxTokens: number;
  messages: ToolCallMessage[];
  tool: { name: string; description: string; parameters: Record<string, unknown> };
  fetcher?: FetchLike;
}): Promise<{
  provider: "pioneer" | "deepseek";
  model: string;
  result: OpenRouterCallResult;
  attempts: ProviderAttempt[];
}> {
  const providers: Array<{
    provider: "pioneer" | "deepseek";
    model: string;
    apiKey: string | undefined;
  }> =
    input.provider === "pioneer"
      ? [{ provider: "pioneer", model: input.model, apiKey: input.pioneerApiKey }]
      : input.provider === "deepseek"
        ? [{ provider: "deepseek", model: input.model, apiKey: input.deepseekApiKey }]
        : [
            { provider: "pioneer", model: input.model, apiKey: input.pioneerApiKey },
            { provider: "deepseek", model: input.fallbackModel, apiKey: input.deepseekApiKey },
          ];
  const attempts: ProviderAttempt[] = [];
  let lastError: string | null = null;
  for (const candidate of providers) {
    if (candidate.apiKey === undefined || candidate.apiKey.trim() === "") {
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        ok: false,
        error: `${candidate.provider.toUpperCase()} API key missing`,
        usage: null,
        estimatedCostUsd: 0,
      });
      lastError = `${candidate.provider.toUpperCase()} API key missing`;
      continue;
    }
    const result = await callProvider({
      provider: candidate.provider,
      model: candidate.model,
      apiKey: candidate.apiKey,
      maxTokens: input.maxTokens,
      messages: input.messages,
      tool: input.tool,
      ...(input.fetcher === undefined ? {} : { fetcher: input.fetcher }),
    });
    const usage = estimateUsageCost({
      provider: candidate.provider,
      model: candidate.model,
      body: result.body,
    });
    const providerError = openRouterErrorMessage(result.body);
    if (result.response.ok && providerError === null) {
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        ok: true,
        error: null,
        usage,
        estimatedCostUsd: usage?.estimatedCostUsd ?? 0,
      });
      return { provider: candidate.provider, model: candidate.model, result, attempts };
    }
    const error = providerError ?? `HTTP ${result.response.status} ${result.response.statusText}`;
    attempts.push({
      provider: candidate.provider,
      model: candidate.model,
      ok: false,
      error,
      usage,
      estimatedCostUsd: usage?.estimatedCostUsd ?? 0,
    });
    lastError = error;
  }
  throw new Error(lastError ?? "No structured extraction provider was available.");
}

async function extractWindow(input: {
  source: Tier2OcrPlanSource;
  sourceRoot: string;
  pages: Tier2OcrPageMarkdownAuditPage[];
  runRoot: string;
  structuredRootName: string;
  provider: StructuredExtractionProvider;
  model: string;
  fallbackModel: string;
  maxTokens: number;
  execute: boolean;
  fetcher?: FetchLike;
  pioneerApiKey: string | undefined;
  deepseekApiKey: string | undefined;
  generatedAt: string;
}): Promise<{
  window: Tier2StructuredExtractionWindow;
  extraction: StructuredDocumentExtraction | null;
}> {
  const paths = windowPaths({
    sourceRoot: input.sourceRoot,
    pages: input.pages.map((page) => page.pageNumber),
  });
  const windowId = `${input.source.sourceId}:${input.pages
    .map((page) => page.pageNumber)
    .join("-")}`;
  const extractionId = `structured_document_extraction:${input.source.sourceId}:${shortHash(
    windowId,
  )}`;

  await mkdir(paths.windowRoot, { recursive: true });
  const markdown = await readMarkdownWindow({ runRoot: input.runRoot, pages: input.pages });
  const markdownHash = sha256Hex(markdown.markdownText);
  const pageNumbers = input.pages.map((page) => page.pageNumber);
  const reused = await existingExtraction({
    path: paths.extractionPath,
    expectedPromptVersion: STRUCTURED_DOCUMENT_EXTRACTION_PROMPT_VERSION,
    expectedSourceId: input.source.sourceId,
    expectedPageNumbers: pageNumbers,
    expectedPageArtifactKeys: markdown.pageArtifactKeys,
    expectedMarkdownHash: markdownHash,
  });
  if (reused !== null) {
    const issueCounts = countIssues(reused.validationIssues);
    const usage = await existingAttemptsUsage(paths.attemptsPath);
    await deleteIfExists(paths.errorPath);
    return {
      extraction: reused,
      window: {
        windowId,
        sourceId: input.source.sourceId,
        pageNumbers: [...reused.source.pageNumbers],
        status: "reused",
        provider: null,
        model: null,
        reusedExisting: true,
        responseArtifactKey: artifactKey(paths.responsePath, input.runRoot),
        toolCallArtifactKey: artifactKey(paths.toolCallPath, input.runRoot),
        extractionArtifactKey: artifactKey(paths.extractionPath, input.runRoot),
        errorArtifactKey: null,
        estimatedCostUsd: usage?.estimatedCostUsd ?? 0,
        usage,
        validationIssueCounts: issueCounts,
        validationIssues: [...reused.validationIssues],
        evidenceSpanCount: reused.evidenceSpans.length,
        claimCount: reused.claims.length,
        tableCount: reused.tables.length,
        interventionEventCount: reused.interventionEvents.length,
        serviceChangeCount: reused.serviceChanges.length,
        contextSignalCount: reused.contextSignals.length,
        reviewQuestionCount: reused.reviewQuestions.length,
      },
    };
  }

  if (!input.execute) {
    return {
      extraction: null,
      window: {
        windowId,
        sourceId: input.source.sourceId,
        pageNumbers: input.pages.map((page) => page.pageNumber),
        status: "planned",
        provider: null,
        model: null,
        reusedExisting: false,
        responseArtifactKey: null,
        toolCallArtifactKey: null,
        extractionArtifactKey: null,
        errorArtifactKey: null,
        estimatedCostUsd: 0,
        usage: null,
        validationIssueCounts: {},
        validationIssues: [],
        evidenceSpanCount: 0,
        claimCount: 0,
        tableCount: 0,
        interventionEventCount: 0,
        serviceChangeCount: 0,
        contextSignalCount: 0,
        reviewQuestionCount: 0,
      },
    };
  }

  const tool = structuredExtractionTool();
  const messages: ToolCallMessage[] = [
    { role: "system", content: STRUCTURED_EXTRACTION_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildStructuredExtractionPrompt({
        source: input.source,
        pages: input.pages,
        markdownText: markdown.markdownText,
        pageArtifactKeys: markdown.pageArtifactKeys,
        markdownHash,
      }),
    },
  ];

  try {
    let providerResult = await callWithProviderFallback({
      provider: input.provider,
      model: input.model,
      fallbackModel: input.fallbackModel,
      pioneerApiKey: input.pioneerApiKey,
      deepseekApiKey: input.deepseekApiKey,
      maxTokens: input.maxTokens,
      messages,
      tool,
      ...(input.fetcher === undefined ? {} : { fetcher: input.fetcher }),
    });
    let attempts = [...providerResult.attempts];
    const parseInput = {
      maxTokens: input.maxTokens,
      extractionId,
      source: input.source,
      pageArtifactKeys: markdown.pageArtifactKeys,
      markdownHash,
      extractedAt: input.generatedAt,
      pageWindowId: windowId,
      markdownBody: markdown.markdownBodyText,
      expectedSourceId: input.source.sourceId,
      expectedPageNumbers: input.pages.map((page) => page.pageNumber),
    };
    let parsedProvider: ReturnType<typeof parseProviderExtraction>;
    try {
      parsedProvider = parseProviderExtraction({
        ...parseInput,
        result: providerResult.result,
        modelId: providerResult.model,
      });
    } catch (initialError) {
      await writeJson(paths.responsePath, providerResult.result.body);
      const rawToolArgs = extractToolCallArguments(
        providerResult.result.body,
        STRUCTURED_DOCUMENT_EXTRACTION_TOOL_NAME,
      );
      if (rawToolArgs !== null) {
        await writeJson(paths.toolCallPath, rawToolArgs);
      }
      const message = initialError instanceof Error ? initialError.message : String(initialError);
      attempts = markLatestSuccessfulAttemptFailed(attempts, message);
      if (
        input.provider === "auto" &&
        providerResult.provider === "pioneer" &&
        input.deepseekApiKey !== undefined &&
        input.deepseekApiKey.trim() !== ""
      ) {
        providerResult = await callWithProviderFallback({
          provider: "deepseek",
          model: input.fallbackModel,
          fallbackModel: input.fallbackModel,
          pioneerApiKey: undefined,
          deepseekApiKey: input.deepseekApiKey,
          maxTokens: input.maxTokens,
          messages,
          tool,
          ...(input.fetcher === undefined ? {} : { fetcher: input.fetcher }),
        });
        attempts = attempts.concat(providerResult.attempts);
        try {
          parsedProvider = parseProviderExtraction({
            ...parseInput,
            result: providerResult.result,
            modelId: providerResult.model,
          });
        } catch (fallbackError) {
          await writeJson(paths.responsePath, providerResult.result.body);
          const fallbackRawToolArgs = extractToolCallArguments(
            providerResult.result.body,
            STRUCTURED_DOCUMENT_EXTRACTION_TOOL_NAME,
          );
          if (fallbackRawToolArgs !== null) {
            await writeJson(paths.toolCallPath, fallbackRawToolArgs);
          }
          const fallbackMessage =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          attempts = markLatestSuccessfulAttemptFailed(attempts, fallbackMessage);
          await writeJson(paths.attemptsPath, attempts);
          throw fallbackError;
        }
      } else {
        await writeJson(paths.attemptsPath, attempts);
        throw initialError;
      }
    }
    await writeJson(paths.responsePath, providerResult.result.body);
    await writeJson(paths.attemptsPath, attempts);
    await writeJson(paths.toolCallPath, parsedProvider.toolArgs);
    const { extraction, validationIssues } = parsedProvider;
    await writeJson(paths.extractionPath, extraction);
    await deleteIfExists(paths.errorPath);
    const issueCounts = countIssues(validationIssues);
    const usage = attemptCost(attempts);
    return {
      extraction,
      window: {
        windowId,
        sourceId: input.source.sourceId,
        pageNumbers: [...extraction.source.pageNumbers],
        status: "extracted",
        provider: providerResult.provider,
        model: providerResult.model,
        reusedExisting: false,
        responseArtifactKey: artifactKey(paths.responsePath, input.runRoot),
        toolCallArtifactKey: artifactKey(paths.toolCallPath, input.runRoot),
        extractionArtifactKey: artifactKey(paths.extractionPath, input.runRoot),
        errorArtifactKey: null,
        estimatedCostUsd: usage.estimatedCostUsd,
        usage,
        validationIssueCounts: issueCounts,
        validationIssues,
        evidenceSpanCount: extraction.evidenceSpans.length,
        claimCount: extraction.claims.length,
        tableCount: extraction.tables.length,
        interventionEventCount: extraction.interventionEvents.length,
        serviceChangeCount: extraction.serviceChanges.length,
        contextSignalCount: extraction.contextSignals.length,
        reviewQuestionCount: extraction.reviewQuestions.length,
      },
    };
  } catch (error) {
    const payload = {
      reason: "structured_extraction_failed",
      message: error instanceof Error ? error.message : String(error),
      generatedAt: input.generatedAt,
    };
    await writeJson(paths.errorPath, payload);
    return {
      extraction: null,
      window: {
        windowId,
        sourceId: input.source.sourceId,
        pageNumbers: input.pages.map((page) => page.pageNumber),
        status: "failed",
        provider: null,
        model: null,
        reusedExisting: false,
        responseArtifactKey: null,
        toolCallArtifactKey: null,
        extractionArtifactKey: null,
        errorArtifactKey: artifactKey(paths.errorPath, input.runRoot),
        estimatedCostUsd: 0,
        usage: null,
        validationIssueCounts: {},
        validationIssues: [
          issue("error", "structured_extraction_failed", "window", payload.message),
        ],
        evidenceSpanCount: 0,
        claimCount: 0,
        tableCount: 0,
        interventionEventCount: 0,
        serviceChangeCount: 0,
        contextSignalCount: 0,
        reviewQuestionCount: 0,
      },
    };
  }
}

function budgetSkippedWindow(input: {
  source: Tier2OcrPlanSource;
  pages: Tier2OcrPageMarkdownAuditPage[];
  reason: string;
}): { window: Tier2StructuredExtractionWindow; extraction: null } {
  return {
    extraction: null,
    window: {
      windowId: `${input.source.sourceId}:${input.pages.map((page) => page.pageNumber).join("-")}`,
      sourceId: input.source.sourceId,
      pageNumbers: input.pages.map((page) => page.pageNumber),
      status: "budget_skipped",
      provider: null,
      model: null,
      reusedExisting: false,
      responseArtifactKey: null,
      toolCallArtifactKey: null,
      extractionArtifactKey: null,
      errorArtifactKey: null,
      estimatedCostUsd: 0,
      usage: null,
      validationIssueCounts: {},
      validationIssues: [issue("warning", "budget_limit_reached", "window", input.reason)],
      evidenceSpanCount: 0,
      claimCount: 0,
      tableCount: 0,
      interventionEventCount: 0,
      serviceChangeCount: 0,
      contextSignalCount: 0,
      reviewQuestionCount: 0,
    },
  };
}

function artifactSummary(
  windows: Tier2StructuredExtractionWindow[],
  extractions: StructuredDocumentExtraction[],
  selectedSourceCount: number,
): Tier2StructuredExtractionArtifact["summary"] {
  const usage = windows.reduce((sum, window) => addUsage(sum, window.usage), emptyUsage());
  const validationErrorCount = windows.reduce(
    (sum, window) =>
      sum + window.validationIssues.filter((current) => current.severity === "error").length,
    0,
  );
  const validationWarningCount = windows.reduce(
    (sum, window) =>
      sum + window.validationIssues.filter((current) => current.severity === "warning").length,
    0,
  );
  return {
    selectedSourceCount,
    windowCount: windows.length,
    plannedWindowCount: windows.filter((window) => window.status === "planned").length,
    extractedWindowCount: windows.filter((window) => window.status === "extracted").length,
    reusedExistingWindowCount: windows.filter((window) => window.status === "reused").length,
    budgetSkippedWindowCount: windows.filter((window) => window.status === "budget_skipped").length,
    failedWindowCount: windows.filter((window) => window.status === "failed").length,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
    validationErrorCount,
    validationWarningCount,
    evidenceSpanCount: extractions.reduce(
      (sum, extraction) => sum + extraction.evidenceSpans.length,
      0,
    ),
    claimCount: extractions.reduce((sum, extraction) => sum + extraction.claims.length, 0),
    tableCount: extractions.reduce((sum, extraction) => sum + extraction.tables.length, 0),
    interventionEventCount: extractions.reduce(
      (sum, extraction) => sum + extraction.interventionEvents.length,
      0,
    ),
    serviceChangeCount: extractions.reduce(
      (sum, extraction) => sum + extraction.serviceChanges.length,
      0,
    ),
    contextSignalCount: extractions.reduce(
      (sum, extraction) => sum + extraction.contextSignals.length,
      0,
    ),
    reviewQuestionCount: extractions.reduce(
      (sum, extraction) => sum + extraction.reviewQuestions.length,
      0,
    ),
  };
}

export async function extractTier2StructuredDocuments(
  args: ExtractTier2StructuredDocumentsArgs,
): Promise<Tier2StructuredExtractionArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const plan = await readRequiredJsonArtifact<Tier2OcrPlan>(args.ocrPlanPath);
  const audit = await readRequiredJsonArtifact<Tier2OcrPageMarkdownAudit>(
    args.pageMarkdownAuditPath,
  );
  const runRoot = dirname(args.ocrPlanPath);
  const pageMarkdownRootName = normalizeOcrPageMarkdownRootName(args.pageMarkdownRootName);
  const structuredRootName = normalizeOcrArtifactRootName({
    value: args.structuredRootName,
    defaultName: "structured-extraction",
    flagName: "--structured-root",
  });
  const provider = args.provider ?? DEFAULT_STRUCTURED_EXTRACTION_PROVIDER;
  const model = args.model ?? DEFAULT_PIONEER_STRUCTURED_MODEL;
  const fallbackModel = args.fallbackModel ?? DEFAULT_DEEPSEEK_STRUCTURED_MODEL;
  const maxTokens = args.maxTokens ?? DEFAULT_STRUCTURED_MAX_TOKENS;
  const maxEstimatedCostUsd = args.maxEstimatedCostUsd;
  const pageWindowSize = args.pageWindowSize ?? 1;
  const windowConcurrency = args.windowConcurrency ?? 1;
  const execute = args.execute ?? false;
  const fetcher = args.fetcher;
  const selected = selectedSources({
    plan,
    sourceIds: args.sourceIds,
    limitSources: args.limitSources,
  });
  const auditBySourceId = new Map(audit.sources.map((source) => [source.sourceId, source]));
  const windows: Tier2StructuredExtractionWindow[] = [];
  const extractions: StructuredDocumentExtraction[] = [];
  let runEstimatedCostUsd = 0;

  for (const source of selected) {
    const auditSource = auditBySourceId.get(source.source.sourceId);
    if (auditSource === undefined) continue;
    const candidatePages = auditSource.pages.filter(
      (page) => page.status === "ocr_complete" && !page.blankPageLikely,
    );
    const root = sourceRoot({
      runRoot,
      source: source.source,
      sourceIndex: source.sourceIndex,
      structuredRootName,
    });
    const pageWindows = chunkPages(candidatePages, pageWindowSize);
    const extracted = await mapWithConcurrency(pageWindows, windowConcurrency, async (pages) => {
      if (
        execute &&
        maxEstimatedCostUsd !== undefined &&
        runEstimatedCostUsd >= maxEstimatedCostUsd
      ) {
        return budgetSkippedWindow({
          source: source.source,
          pages,
          reason: `Estimated structured extraction cost limit $${maxEstimatedCostUsd} reached.`,
        });
      }
      const result = await extractWindow({
        source: source.source,
        sourceRoot: root,
        pages,
        runRoot,
        structuredRootName,
        provider,
        model,
        fallbackModel,
        maxTokens,
        execute,
        ...(fetcher === undefined ? {} : { fetcher }),
        pioneerApiKey: args.pioneerApiKey ?? process.env["PIONEER_API_KEY"],
        deepseekApiKey: args.deepseekApiKey ?? process.env["DEEPSEEK_API_KEY"],
        generatedAt,
      });
      runEstimatedCostUsd = roundCost(runEstimatedCostUsd + result.window.estimatedCostUsd);
      return result;
    });
    for (const result of extracted) {
      windows.push(result.window);
      if (result.extraction !== null) extractions.push(result.extraction);
    }
  }

  const artifact: Tier2StructuredExtractionArtifact = {
    version: 1,
    runId: plan.runId,
    generatedAt,
    ocrPlanPath: args.ocrPlanPath,
    pageMarkdownAuditPath: args.pageMarkdownAuditPath,
    outputPath: args.outputPath ?? null,
    provider,
    model,
    fallbackModel,
    maxTokens,
    pageMarkdownRootName,
    structuredRootName,
    promptVersion: STRUCTURED_DOCUMENT_EXTRACTION_PROMPT_VERSION,
    execute,
    pageWindowSize,
    windowConcurrency,
    maxEstimatedCostUsd: maxEstimatedCostUsd ?? null,
    summary: artifactSummary(windows, extractions, selected.length),
    windows,
    extractions,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, artifact);
  }
  return artifact;
}

function parseStructuredExtractionCliArgs(args: string[]): StructuredExtractionCliArgs {
  const options: CliOption<StructuredExtractionCliArgs>[] = [
    {
      flags: ["--ocr-plan"],
      apply: (output, value) => {
        if (value !== undefined) output.ocrPlanPath = fromCliPath(value);
      },
    },
    {
      flags: ["--page-markdown-audit"],
      apply: (output, value) => {
        if (value !== undefined) output.pageMarkdownAuditPath = fromCliPath(value);
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
      flags: ["--page-markdown-root"],
      apply: (output, value) => {
        if (value !== undefined) output.pageMarkdownRootName = value;
      },
    },
    {
      flags: ["--structured-root"],
      apply: (output, value) => {
        if (value !== undefined) output.structuredRootName = value;
      },
    },
    {
      flags: ["--provider"],
      apply: (output, value) => {
        if (value === "auto" || value === "pioneer" || value === "deepseek") {
          output.provider = value;
          return;
        }
        throw new Error("--provider must be auto, pioneer, or deepseek.");
      },
    },
    {
      flags: ["--model"],
      apply: (output, value) => {
        if (value !== undefined) output.model = value;
      },
    },
    {
      flags: ["--fallback-model"],
      apply: (output, value) => {
        if (value !== undefined) output.fallbackModel = value;
      },
    },
    {
      flags: ["--max-tokens"],
      apply: (output, value) => {
        output.maxTokens = Number(value);
      },
    },
    {
      flags: ["--max-estimated-cost-usd", "--max-cost-usd", "--budget-usd"],
      apply: (output, value) => {
        output.maxEstimatedCostUsd = Number(value);
      },
    },
    {
      flags: ["--source-ids"],
      apply: (output, value) => {
        const parsed = parseSourceIds(value);
        if (parsed !== undefined) output.sourceIds = parsed;
      },
    },
    {
      flags: ["--source-id"],
      apply: (output, value) => {
        const parsed = parseSourceIds(value);
        output.sourceIds = [...(output.sourceIds ?? []), ...(parsed ?? [])];
      },
    },
    {
      flags: ["--limit-sources"],
      apply: (output, value) => {
        output.limitSources = Number(value);
      },
    },
    {
      flags: ["--page-window-size"],
      apply: (output, value) => {
        output.pageWindowSize = Number(value);
      },
    },
    {
      flags: ["--window-concurrency"],
      apply: (output, value) => {
        output.windowConcurrency = Number(value);
      },
    },
    trueOption<StructuredExtractionCliArgs>(["--execute"], (output) => {
      output.execute = true;
    }),
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveStructuredExtractionPaths(
  args: StructuredExtractionCliArgs,
): Promise<{ ocrPlanPath: string; pageMarkdownAuditPath: string; outputPath: string }> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId =
    args.runId ?? (args.ocrPlanPath === undefined ? await latestDocsRunId(artifactRoot) : null);
  const baseDir =
    args.ocrPlanPath !== undefined
      ? dirname(args.ocrPlanPath)
      : runId === null
        ? null
        : runArtifactRoot(artifactRoot, runId);
  if (baseDir === null) {
    throw new Error("No docs run found. Provide --run-id or --ocr-plan.");
  }
  return {
    ocrPlanPath: args.ocrPlanPath ?? ocrPlanPath(artifactRoot, runId!),
    pageMarkdownAuditPath:
      args.pageMarkdownAuditPath ?? join(baseDir, "ocr-page-markdown-audit.json"),
    outputPath: args.outputPath ?? join(baseDir, "structured-extraction.json"),
  };
}

export async function extractTier2StructuredDocumentsFromCli(
  args: string[],
): Promise<Tier2StructuredExtractionArtifact> {
  const parsed = parseStructuredExtractionCliArgs(args);
  const paths = await resolveStructuredExtractionPaths(parsed);
  return extractTier2StructuredDocuments({
    ...paths,
    ...(parsed.pageMarkdownRootName !== undefined
      ? { pageMarkdownRootName: parsed.pageMarkdownRootName }
      : {}),
    ...(parsed.structuredRootName !== undefined
      ? { structuredRootName: parsed.structuredRootName }
      : {}),
    ...(parsed.provider !== undefined ? { provider: parsed.provider } : {}),
    ...(parsed.model !== undefined ? { model: parsed.model } : {}),
    ...(parsed.fallbackModel !== undefined ? { fallbackModel: parsed.fallbackModel } : {}),
    ...(parsed.maxTokens !== undefined ? { maxTokens: parsed.maxTokens } : {}),
    ...(parsed.maxEstimatedCostUsd !== undefined
      ? { maxEstimatedCostUsd: parsed.maxEstimatedCostUsd }
      : {}),
    ...(parsed.sourceIds !== undefined ? { sourceIds: parsed.sourceIds } : {}),
    ...(parsed.limitSources !== undefined ? { limitSources: parsed.limitSources } : {}),
    ...(parsed.pageWindowSize !== undefined ? { pageWindowSize: parsed.pageWindowSize } : {}),
    ...(parsed.windowConcurrency !== undefined
      ? { windowConcurrency: parsed.windowConcurrency }
      : {}),
    execute: parsed.execute ?? false,
  });
}
