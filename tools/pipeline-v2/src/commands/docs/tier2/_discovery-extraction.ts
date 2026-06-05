import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type DocumentDiscoveryExtraction,
  DocumentDiscoveryExtractionSchema,
  type DocumentDiscoveryExtractionToolResponse,
  DocumentDiscoveryExtractionToolResponseSchema,
  type DocumentDiscoveryValidationIssue,
  toProjectJsonSchema,
} from "@bp/domain";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import type { ToolCallMessage } from "../../../lib/llm.ts";
import {
  callDeepSeekToolCallDirect,
  callPioneerToolCallDirect,
  openRouterErrorMessage,
  type OpenRouterCallResult,
} from "./_llm-clients.ts";
import {
  artifactKey,
  defaultFetch,
  extractToolCallArguments,
  type FetchLike,
  latestDocsRunId,
  missingToolCallErrorMessage,
  ocrPlanPath,
  parseCliOptions,
  parseSourceIds,
  readRequiredJsonArtifact,
  runArtifactRoot,
  type CliOption,
  type Tier2OcrPageMarkdownAudit,
  type Tier2OcrPageMarkdownAuditPage,
  type Tier2OcrPlan,
  type Tier2OcrPlanSource,
  trueOption,
} from "./_shared.ts";

export const DISCOVERY_EXTRACTION_TOOL_NAME = "submit_document_discovery_candidates";
export const DISCOVERY_EXTRACTION_PROMPT_VERSION = "tier2-document-discovery-v1";
export const DEFAULT_DISCOVERY_PROVIDER = "deepseek";
export const DEFAULT_DISCOVERY_MODEL = "deepseek-v4-flash";
export const DEFAULT_DISCOVERY_MAX_TOKENS = 12_000;
export const DEFAULT_DISCOVERY_ROOT_NAME = "document-discovery-v1";

export type DiscoveryExtractionProvider = "pioneer" | "deepseek";

export type Tier2DiscoveryExtractionUsage = {
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type Tier2DiscoveryExtractionWindowStatus =
  | "planned"
  | "extracted"
  | "reused"
  | "budget_skipped"
  | "failed";

export type Tier2DiscoveryEvidenceBlock = {
  blockId: string;
  pageNumber: number;
  lineStart: number;
  lineEnd: number;
  blockHash: string;
  text: string;
};

export type Tier2DiscoveryExtractionWindow = {
  windowId: string;
  sourceId: string;
  pageNumbers: number[];
  status: Tier2DiscoveryExtractionWindowStatus;
  provider: DiscoveryExtractionProvider | null;
  model: string | null;
  reusedExisting: boolean;
  requestArtifactKey: string | null;
  blockIndexArtifactKey: string | null;
  responseArtifactKey: string | null;
  toolCallArtifactKey: string | null;
  extractionArtifactKey: string | null;
  errorArtifactKey: string | null;
  usage: Tier2DiscoveryExtractionUsage | null;
  estimatedCostUsd: number;
  validationIssueCounts: Record<string, number>;
  validationIssues: DocumentDiscoveryValidationIssue[];
  entityCount: number;
  metricCount: number;
  eventCount: number;
  tableCount: number;
  claimCount: number;
  contextSignalCount: number;
  reviewQuestionCount: number;
};

export type Tier2DiscoveryExtractionArtifact = {
  version: 1;
  runId: string;
  generatedAt: string;
  ocrPlanPath: string;
  pageMarkdownAuditPath: string;
  windowManifestPath: string | null;
  outputPath: string | null;
  provider: DiscoveryExtractionProvider;
  model: string;
  maxTokens: number;
  discoveryRootName: string;
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
    entityCount: number;
    metricCount: number;
    eventCount: number;
    tableCount: number;
    claimCount: number;
    contextSignalCount: number;
    reviewQuestionCount: number;
  };
  windows: Tier2DiscoveryExtractionWindow[];
  extractions: DocumentDiscoveryExtraction[];
};

export type ExtractTier2DocumentDiscoveriesArgs = {
  ocrPlanPath: string;
  pageMarkdownAuditPath: string;
  outputPath?: string;
  windowManifestPath?: string;
  generatedAt?: string;
  discoveryRootName?: string;
  provider?: DiscoveryExtractionProvider;
  model?: string;
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

type DiscoveryExtractionCliArgs = {
  ocrPlanPath?: string;
  pageMarkdownAuditPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  windowManifestPath?: string;
  discoveryRootName?: string;
  provider?: DiscoveryExtractionProvider;
  model?: string;
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
  requestPath: string;
  blockIndexPath: string;
  responsePath: string;
  toolCallPath: string;
  extractionPath: string;
  errorPath: string;
};

type IndexedMarkdownWindow = {
  markdownText: string;
  markdownHash: string;
  blockIndexText: string;
  blockIndexHash: string;
  blocks: Tier2DiscoveryEvidenceBlock[];
  pageArtifactKeys: string[];
};

type Tier2DiscoveryWindowManifest = {
  version: 1;
  generatedAt: string;
  runId: string;
  pageWindowSize: number;
  windows: Array<{
    windowId: string;
    sourceId: string;
    pageNumbers: number[];
    reason: string;
  }>;
};

type DiscoveryWindowErrorClass =
  | "provider_http_error"
  | "tool_arguments_unparseable"
  | "tool_call_missing"
  | "tool_schema_validation_failed"
  | "provider_or_parse_failure";

type DiscoveryWindowErrorDetails = Record<string, unknown>;

class DiscoveryWindowError extends Error {
  readonly errorClass: DiscoveryWindowErrorClass;
  readonly details: DiscoveryWindowErrorDetails;

  constructor(
    message: string,
    errorClass: DiscoveryWindowErrorClass,
    details: DiscoveryWindowErrorDetails = {},
  ) {
    super(message);
    this.name = "DiscoveryWindowError";
    this.errorClass = errorClass;
    this.details = details;
  }
}

const MODEL_PRICES: Record<
  string,
  { inputUsdPerMillion: number; outputUsdPerMillion: number; cacheReadUsdPerMillion: number }
> = {
  "deepseek:deepseek-v4-flash": {
    inputUsdPerMillion: 0.14,
    outputUsdPerMillion: 0.28,
    cacheReadUsdPerMillion: 0.0028,
  },
  "deepseek:deepseek-v4-pro": {
    inputUsdPerMillion: 0.435,
    outputUsdPerMillion: 0.87,
    cacheReadUsdPerMillion: 0.003625,
  },
  "pioneer:deepseek-ai/DeepSeek-V4-Flash": {
    inputUsdPerMillion: 0.14,
    outputUsdPerMillion: 0.28,
    cacheReadUsdPerMillion: 0.0028,
  },
};

function sha256Hex(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function markdownBody(markdown: string): string {
  if (!markdown.startsWith("---")) return markdown;
  const marker = "\n---\n";
  const end = markdown.indexOf(marker, 3);
  if (end === -1) return markdown;
  return markdown.slice(end + marker.length);
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unknownType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function firstFinishReason(responseJson: unknown): string | null {
  const root = recordOrNull(responseJson);
  const choices = root === null || !Array.isArray(root["choices"]) ? [] : root["choices"];
  for (const choice of choices) {
    const record = recordOrNull(choice);
    if (record === null) continue;
    const reason = stringOrNull(record["finish_reason"] ?? record["finishReason"]);
    if (reason !== null) return reason;
  }
  return null;
}

function inspectToolArguments(input: {
  responseJson: unknown;
  toolName: string;
}): {
  errorClass: "tool_arguments_unparseable" | "tool_call_missing";
  details: DiscoveryWindowErrorDetails;
} {
  const root = recordOrNull(input.responseJson);
  const choices = root === null || !Array.isArray(root["choices"]) ? [] : root["choices"];
  const firstReason = firstFinishReason(input.responseJson);
  for (const [choiceIndex, choice] of choices.entries()) {
    const choiceRecord = recordOrNull(choice);
    const message = recordOrNull(choiceRecord?.["message"]);
    const toolCallLists = [message?.["tool_calls"], message?.["toolCalls"]];
    for (const toolCalls of toolCallLists) {
      if (!Array.isArray(toolCalls)) continue;
      for (const [toolCallIndex, toolCall] of toolCalls.entries()) {
        const toolCallRecord = recordOrNull(toolCall);
        if (toolCallRecord === null) continue;
        const functionRecord = recordOrNull(toolCallRecord["function"]);
        const name =
          stringOrNull(functionRecord?.["name"]) ??
          stringOrNull(toolCallRecord["name"]) ??
          stringOrNull(toolCallRecord["toolName"]);
        if (name !== input.toolName) continue;
        const rawArgs =
          functionRecord?.["arguments"] ??
          toolCallRecord["arguments"] ??
          toolCallRecord["input"] ??
          null;
        const baseDetails: DiscoveryWindowErrorDetails = {
          toolName: input.toolName,
          toolCallFound: true,
          choiceIndex,
          toolCallIndex,
          toolCallId: stringOrNull(toolCallRecord["id"]),
          finishReason:
            stringOrNull(choiceRecord?.["finish_reason"] ?? choiceRecord?.["finishReason"]) ??
            firstReason,
          rawArgumentType: unknownType(rawArgs),
        };
        if (typeof rawArgs !== "string") {
          return {
            errorClass: "tool_arguments_unparseable",
            details: {
              ...baseDetails,
              argumentLength: null,
              argumentTail: null,
              parseError:
                rawArgs === null
                  ? "Tool call arguments were null."
                  : `Tool call arguments had unsupported type ${unknownType(rawArgs)}.`,
            },
          };
        }
        try {
          JSON.parse(rawArgs);
        } catch (error) {
          return {
            errorClass: "tool_arguments_unparseable",
            details: {
              ...baseDetails,
              argumentLength: rawArgs.length,
              argumentTail: rawArgs.slice(-800),
              parseError: error instanceof Error ? error.message : String(error),
            },
          };
        }
        return {
          errorClass: "tool_call_missing",
          details: {
            ...baseDetails,
            argumentLength: rawArgs.length,
            argumentTail: rawArgs.slice(-800),
            parseError: null,
            note:
              "Matching tool call arguments parsed as JSON but could not be extracted by the shared parser.",
          },
        };
      }
    }
  }
  return {
    errorClass: "tool_call_missing",
    details: {
      toolName: input.toolName,
      toolCallFound: false,
      finishReason: firstReason,
      choiceCount: choices.length,
    },
  };
}

function classifyDiscoveryError(error: unknown): {
  errorClass: DiscoveryWindowErrorClass;
  details: DiscoveryWindowErrorDetails;
} {
  if (error instanceof DiscoveryWindowError) {
    return { errorClass: error.errorClass, details: error.details };
  }
  return { errorClass: "provider_or_parse_failure", details: {} };
}

function providerRequestIdsFromAttempts(result: OpenRouterCallResult | null): string[] {
  const ids = new Set<string>();
  for (const attempt of result?.attempts ?? []) {
    for (const id of attempt.providerRequestIds) {
      ids.add(id);
    }
  }
  return [...ids].sort();
}

function stripEmptyOptionalValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== "")
      .map((item) => stripEmptyOptionalValues(item));
  }
  const record = recordOrNull(value);
  if (record === null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, current] of Object.entries(record)) {
    if (current === null || current === "") continue;
    output[key] = stripEmptyOptionalValues(current);
  }
  return output;
}

function arrayLengthField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return Array.isArray(value) ? value.length : 0;
}

function canonicalizeDiscoveryToolArgs(input: {
  toolArgs: unknown;
  model: string;
  extractedAt: string;
  pageWindowId: string;
  blocks: Tier2DiscoveryEvidenceBlock[];
}): unknown {
  const stripped = stripEmptyOptionalValues(input.toolArgs);
  const record = recordOrNull(stripped);
  if (record === null) return stripped;
  const blocksById = new Map(input.blocks.map((block) => [block.blockId, block]));
  const canonicalRecord = recordOrNull(fillCanonicalEvidenceRefs(record, blocksById)) ?? record;
  const extractionAudit = recordOrNull(record["extractionAudit"]) ?? {};
  return {
    ...canonicalRecord,
    extractionAudit: {
      ...extractionAudit,
      promptVersion: DISCOVERY_EXTRACTION_PROMPT_VERSION,
      toolSchemaVersion: "1",
      modelId: input.model,
      extractedAt: input.extractedAt,
      pageWindowId: input.pageWindowId,
      candidateCounts: {
        entities: arrayLengthField(record, "entities"),
        metrics: arrayLengthField(record, "metrics"),
        events: arrayLengthField(record, "events"),
        tables: arrayLengthField(record, "tables"),
        claims: arrayLengthField(record, "claims"),
        contextSignals: arrayLengthField(record, "contextSignals"),
        reviewQuestions: arrayLengthField(record, "reviewQuestions"),
      },
    },
  };
}

function fillCanonicalEvidenceRefs(
  value: unknown,
  blocksById: Map<string, Tier2DiscoveryEvidenceBlock>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => fillCanonicalEvidenceRefs(item, blocksById));
  }
  const record = recordOrNull(value);
  if (record === null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, current] of Object.entries(record)) {
    if (key === "evidenceRefs" && Array.isArray(current)) {
      output[key] = current.map((ref) => {
        const refRecord = recordOrNull(ref);
        if (refRecord === null) return ref;
        const blockId = typeof refRecord["blockId"] === "string" ? refRecord["blockId"] : null;
        const block = blockId === null ? undefined : blocksById.get(blockId);
        if (block === undefined) return refRecord;
        return {
          ...refRecord,
          pageNumber: block.pageNumber,
          blockHash: block.blockHash,
        };
      });
      continue;
    }
    output[key] = fillCanonicalEvidenceRefs(current, blocksById);
  }
  return output;
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

function estimateUsage(input: {
  provider: DiscoveryExtractionProvider;
  model: string;
  body: unknown;
}): Tier2DiscoveryExtractionUsage | null {
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
  const price =
    MODEL_PRICES[`${input.provider}:${input.model}`] ??
    MODEL_PRICES["deepseek:deepseek-v4-flash"]!;
  const billablePromptTokens = Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens);
  const estimatedCostUsd = roundCost(
    (billablePromptTokens * price.inputUsdPerMillion +
      completionTokens * price.outputUsdPerMillion +
      cacheReadTokens * price.cacheReadUsdPerMillion) /
      1_000_000,
  );
  return {
    promptTokens,
    completionTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    estimatedCostUsd,
  };
}

function emptyUsage(): Tier2DiscoveryExtractionUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
}

function addUsage(
  left: Tier2DiscoveryExtractionUsage,
  right: Tier2DiscoveryExtractionUsage | null,
): Tier2DiscoveryExtractionUsage {
  if (right === null) return left;
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    estimatedCostUsd: roundCost(left.estimatedCostUsd + right.estimatedCostUsd),
  };
}

function issue(
  severity: "error" | "warning",
  code: string,
  path: string,
  message: string,
): DocumentDiscoveryValidationIssue {
  return { severity, code, path, message };
}

function countIssues(
  issues: DocumentDiscoveryValidationIssue[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const current of issues) {
    counts[current.code] = (counts[current.code] ?? 0) + 1;
  }
  return counts;
}

function sanitizeToolSchemaForProviderGrammar(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeToolSchemaForProviderGrammar);
  }
  const record = recordOrNull(value);
  if (record === null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, current] of Object.entries(record)) {
    if (key === "format" || key === "propertyNames") continue;
    output[key] = sanitizeToolSchemaForProviderGrammar(current);
  }
  return output;
}

function indexMarkdownBlocks(
  pages: Array<{ pageNumber: number; markdownBody: string }>,
): Omit<IndexedMarkdownWindow, "pageArtifactKeys"> {
  const blocks: Tier2DiscoveryEvidenceBlock[] = [];
  const markdownParts: string[] = [];
  for (const page of pages) {
    markdownParts.push(`\n\n<!-- page ${page.pageNumber} -->\n\n${page.markdownBody}`);
    const lines = page.markdownBody.split(/\r?\n/);
    let blockStart = 0;
    let blockLines: string[] = [];
    const flush = (exclusiveLineIndex: number): void => {
      const text = blockLines.join("\n").trim();
      if (text.length === 0) {
        blockLines = [];
        return;
      }
      const blockId = `B${String(blocks.length + 1).padStart(4, "0")}`;
      blocks.push({
        blockId,
        pageNumber: page.pageNumber,
        lineStart: blockStart + 1,
        lineEnd: exclusiveLineIndex,
        blockHash: sha256Hex(`${page.pageNumber}:${blockStart + 1}:${exclusiveLineIndex}:${text}`),
        text,
      });
      blockLines = [];
    };
    for (const [lineIndex, line] of lines.entries()) {
      if (line.trim().length === 0) {
        flush(lineIndex);
        blockStart = lineIndex + 1;
        continue;
      }
      if (blockLines.length === 0) blockStart = lineIndex;
      blockLines.push(line);
    }
    flush(lines.length);
  }
  const markdownText = markdownParts.join("\n");
  const blockIndexText = blocks
    .map((block) =>
      [
        `[${block.blockId}] page=${block.pageNumber} lines=${block.lineStart}-${block.lineEnd} hash=${block.blockHash}`,
        block.text,
      ].join("\n"),
    )
    .join("\n\n");
  return {
    markdownText,
    markdownHash: sha256Hex(markdownText),
    blockIndexText,
    blockIndexHash: sha256Hex(blockIndexText),
    blocks,
  };
}

async function readIndexedMarkdownWindow(input: {
  runRoot: string;
  pages: Tier2OcrPageMarkdownAuditPage[];
}): Promise<IndexedMarkdownWindow> {
  const pageArtifactKeys: string[] = [];
  const pageBodies: Array<{ pageNumber: number; markdownBody: string }> = [];
  for (const page of input.pages) {
    if (page.markdownArtifactKey === null) {
      throw new Error(`Page ${page.sourceId}/${page.pageNumber} has no markdown artifact key.`);
    }
    pageArtifactKeys.push(page.markdownArtifactKey);
    const markdown = await Bun.file(join(input.runRoot, page.markdownArtifactKey)).text();
    pageBodies.push({ pageNumber: page.pageNumber, markdownBody: markdownBody(markdown) });
  }
  return { ...indexMarkdownBlocks(pageBodies), pageArtifactKeys };
}

function checkEvidenceRefs(input: {
  refs: Array<{
    blockId: string;
    pageNumber: number;
    lineStart: number;
    lineEnd: number;
    blockHash?: string | undefined;
  }>;
  path: string;
  blocksById: Map<string, Tier2DiscoveryEvidenceBlock>;
  issues: DocumentDiscoveryValidationIssue[];
}): void {
  for (const [index, ref] of input.refs.entries()) {
    const path = `${input.path}.${index}`;
    const block = input.blocksById.get(ref.blockId);
    if (block === undefined) {
      input.issues.push(
        issue("error", "unknown_evidence_block_ref", path, `Unknown blockId ${ref.blockId}.`),
      );
      continue;
    }
    if (ref.blockHash !== undefined && ref.blockHash !== block.blockHash) {
      input.issues.push(
        issue(
          "error",
          "evidence_block_hash_mismatch",
          `${path}.blockHash`,
          `Expected ${block.blockHash} for ${ref.blockId}.`,
        ),
      );
    }
    if (ref.pageNumber !== block.pageNumber) {
      input.issues.push(
        issue(
          "error",
          "evidence_block_page_mismatch",
          `${path}.pageNumber`,
          `Expected page ${block.pageNumber} for ${ref.blockId}.`,
        ),
      );
    }
    if (ref.lineStart > ref.lineEnd) {
      input.issues.push(
        issue("error", "invalid_evidence_line_range", path, "lineStart must be <= lineEnd."),
      );
    }
    if (ref.lineStart < block.lineStart || ref.lineEnd > block.lineEnd) {
      input.issues.push(
        issue(
          "error",
          "evidence_line_range_outside_block",
          path,
          `Line range must stay within ${ref.blockId} lines ${block.lineStart}-${block.lineEnd}.`,
        ),
      );
    }
  }
}

function checkDuplicateIds(
  ids: string[],
  path: string,
  issues: DocumentDiscoveryValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push(issue("error", "duplicate_candidate_id", path, `Duplicate candidate id ${id}.`));
    }
    seen.add(id);
  }
}

export function validateDiscoveryExtraction(input: {
  extraction: DocumentDiscoveryExtractionToolResponse;
  expectedSourceId: string;
  expectedPageNumbers: number[];
  expectedMarkdownHash: string;
  expectedBlockIndexHash: string;
  blocks: Tier2DiscoveryEvidenceBlock[];
}): DocumentDiscoveryValidationIssue[] {
  const issues: DocumentDiscoveryValidationIssue[] = [];
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
  if (input.extraction.source.markdownHash !== input.expectedMarkdownHash) {
    issues.push(
      issue("error", "markdown_hash_mismatch", "source.markdownHash", "Markdown hash mismatch."),
    );
  }
  if (input.extraction.source.blockIndexHash !== input.expectedBlockIndexHash) {
    issues.push(
      issue(
        "error",
        "block_index_hash_mismatch",
        "source.blockIndexHash",
        "Block index hash mismatch.",
      ),
    );
  }

  const blocksById = new Map(input.blocks.map((block) => [block.blockId, block]));
  const checkRefs = (refs: DocumentDiscoveryExtractionToolResponse["entities"][number]["evidenceRefs"], path: string) =>
    checkEvidenceRefs({ refs, path, blocksById, issues });

  checkDuplicateIds(
    input.extraction.entities.map((candidate) => candidate.entityId),
    "entities.entityId",
    issues,
  );
  checkDuplicateIds(
    input.extraction.metrics.map((candidate) => candidate.metricId),
    "metrics.metricId",
    issues,
  );
  checkDuplicateIds(
    input.extraction.events.map((candidate) => candidate.eventId),
    "events.eventId",
    issues,
  );
  checkDuplicateIds(
    input.extraction.tables.map((candidate) => candidate.tableId),
    "tables.tableId",
    issues,
  );
  checkDuplicateIds(
    input.extraction.claims.map((candidate) => candidate.claimId),
    "claims.claimId",
    issues,
  );

  for (const [index, candidate] of input.extraction.entities.entries()) {
    checkRefs(candidate.evidenceRefs, `entities.${index}.evidenceRefs`);
  }
  for (const [index, candidate] of input.extraction.metrics.entries()) {
    checkRefs(candidate.evidenceRefs, `metrics.${index}.evidenceRefs`);
  }
  for (const [index, candidate] of input.extraction.events.entries()) {
    checkRefs(candidate.evidenceRefs, `events.${index}.evidenceRefs`);
  }
  for (const [index, candidate] of input.extraction.tables.entries()) {
    checkRefs(candidate.evidenceRefs, `tables.${index}.evidenceRefs`);
  }
  for (const [index, candidate] of input.extraction.claims.entries()) {
    checkRefs(candidate.evidenceRefs, `claims.${index}.evidenceRefs`);
  }
  for (const [index, candidate] of input.extraction.contextSignals.entries()) {
    checkRefs(candidate.evidenceRefs, `contextSignals.${index}.evidenceRefs`);
  }
  for (const [index, candidate] of input.extraction.reviewQuestions.entries()) {
    checkRefs(candidate.evidenceRefs, `reviewQuestions.${index}.evidenceRefs`);
  }

  const candidateCount =
    input.extraction.entities.length +
    input.extraction.metrics.length +
    input.extraction.events.length +
    input.extraction.tables.length +
    input.extraction.claims.length +
    input.extraction.contextSignals.length +
    input.extraction.reviewQuestions.length;
  if (input.extraction.pageProfile.discoveryShouldProceed && candidateCount === 0) {
    issues.push(
      issue(
        "warning",
        "proceed_page_has_no_candidates",
        "pageProfile.discoveryShouldProceed",
        "Page profile says discovery should proceed but no candidates were submitted.",
      ),
    );
  }
  return issues;
}

function discoveryExtractionTool(): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: DISCOVERY_EXTRACTION_TOOL_NAME,
    description:
      "Submit raw, block-ref-grounded discovery candidates for one OCR Markdown page/window. Preserve source vocabulary; do not normalize beyond optional hints.",
    parameters: sanitizeToolSchemaForProviderGrammar(
      toProjectJsonSchema(DocumentDiscoveryExtractionToolResponseSchema),
    ) as Record<string, unknown>,
  };
}

const DISCOVERY_SYSTEM_PROMPT = [
  "You are the Tier 2 document discovery agent for Bus Priority Impact Studio.",
  "Stable contract: this is a discovery pass, not a normalization pass. Preserve raw source vocabulary.",
  "Use only the supplied source metadata and block-indexed OCR Markdown. Do not rely on memory.",
  `You must call the ${DISCOVERY_EXTRACTION_TOOL_NAME} tool exactly once.`,
  "Every candidate should cite evidenceRefs using blockId, pageNumber, lineStart, and lineEnd from the supplied block index. You may omit blockHash; the runner fills canonical blockHash values.",
  "Do not copy long evidence quotes. Use optional snippets only when a very short snippet clarifies the candidate.",
  "rawKind, familyRaw, tableKindRaw, claimKindRaw, contextKindRaw, and metric label fields are free-form discovery vocabulary.",
  "kindHint is optional. Use it only when obvious; never discard the rawKind.",
  "Accept subway lines, PATH, LIRR, NJ Transit, Amtrak, stations, neighborhoods, street users, design elements, and policy terms as entities when present.",
  "Do not mark subway, rail, PATH, LIRR, NJ Transit, or Amtrak as bus_route. Use transit_line or rail_service hints when obvious.",
  "Treat metrics as raw observations: preserve labelRaw, valueRaw, unitRaw, subjectRaw, geographyRaw, periodRaw, and comparisonRaw rather than forcing a canonical metric taxonomy.",
  "Document-claimed metrics are evidence/context, not deterministic Studio metrics. Preserve authorityRaw when the document states the source.",
  "For claimKindRaw, prefer meaningful raw labels such as performance_observation, methodology_note, proposed_treatment, existing_condition, project_scope, public_feedback, problem_statement, or policy_or_operations_statement over generic assertion when the page supports a clearer label.",
  "Tables are important discovery objects, but do not reproduce full large tables. Capture headers, row/column counts when available, semantic notes, and block refs.",
  "If the page/window has no useful candidates, set discoveryShouldProceed=false and explain skipReason.",
].join("\n");

function buildDiscoveryPrompt(input: {
  source: Tier2OcrPlanSource;
  pages: Tier2OcrPageMarkdownAuditPage[];
  indexed: IndexedMarkdownWindow;
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
    pageArtifactKeys: input.indexed.pageArtifactKeys,
    markdownHash: input.indexed.markdownHash,
    blockIndexHash: input.indexed.blockIndexHash,
  };
  return [
    "DISCOVERY CONTRACT",
    `Prompt version: ${DISCOVERY_EXTRACTION_PROMPT_VERSION}`,
    `Tool name: ${DISCOVERY_EXTRACTION_TOOL_NAME}`,
    "This pass collects raw candidates. Normalization happens later after we review candidate distributions.",
    "",
    "STABLE SOURCE METADATA",
    JSON.stringify(stableSourceMetadata, null, 2),
    "",
    "PAGE WINDOW METADATA",
    JSON.stringify(pageWindowMetadata, null, 2),
    "",
    "REQUIRED SOURCE OBJECT FOR TOOL CALL",
    JSON.stringify({ ...stableSourceMetadata, ...pageWindowMetadata }, null, 2),
    "",
    "REQUIRED EXTRACTION AUDIT STABLE FIELDS",
    JSON.stringify(
      {
        promptVersion: DISCOVERY_EXTRACTION_PROMPT_VERSION,
        toolSchemaVersion: "1",
      },
      null,
      2,
    ),
    "",
    "BLOCK-INDEXED OCR MARKDOWN",
    input.indexed.blockIndexText,
  ].join("\n");
}

function sourceRoot(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  sourceIndex: number;
  discoveryRootName: string;
}): string {
  return join(
    input.runRoot,
    input.discoveryRootName,
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
    requestPath: join(windowRoot, "discovery-request.json"),
    blockIndexPath: join(windowRoot, "block-index.json"),
    responsePath: join(windowRoot, "discovery-response.json"),
    toolCallPath: join(windowRoot, "discovery-tool-call.json"),
    extractionPath: join(windowRoot, "document-discovery.json"),
    errorPath: join(windowRoot, "error.json"),
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
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
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

function windowKey(input: { sourceId: string; pageNumbers: number[] }): string {
  return `${input.sourceId}:${input.pageNumbers.join("-")}`;
}

async function readWindowManifest(
  path: string | undefined,
): Promise<Tier2DiscoveryWindowManifest | null> {
  if (path === undefined) return null;
  const value = (await Bun.file(path).json()) as Tier2DiscoveryWindowManifest;
  if (value.version !== 1 || !Array.isArray(value.windows)) {
    throw new Error(`Invalid discovery window manifest at ${path}.`);
  }
  return value;
}

function sameNumberArray(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function existingExtraction(input: {
  path: string;
  expectedPromptVersion: string;
  expectedSourceId: string;
  expectedPageNumbers: number[];
  expectedPageArtifactKeys: string[];
  expectedMarkdownHash: string;
  expectedBlockIndexHash: string;
}): Promise<DocumentDiscoveryExtraction | null> {
  const file = Bun.file(input.path);
  if (!(await file.exists())) return null;
  const parsed = DocumentDiscoveryExtractionSchema.safeParse(await file.json());
  if (!parsed.success) return null;
  const extraction = parsed.data;
  if (extraction.extractionAudit.promptVersion !== input.expectedPromptVersion) return null;
  if (extraction.source.sourceId !== input.expectedSourceId) return null;
  if (!sameNumberArray(extraction.source.pageNumbers, input.expectedPageNumbers)) return null;
  if (!sameStringArray(extraction.source.pageArtifactKeys, input.expectedPageArtifactKeys)) {
    return null;
  }
  if (extraction.source.markdownHash !== input.expectedMarkdownHash) return null;
  if (extraction.source.blockIndexHash !== input.expectedBlockIndexHash) return null;
  return extraction;
}

function extractionFromToolResponse(input: {
  toolResponse: DocumentDiscoveryExtractionToolResponse;
  extractionId: string;
  validationState: "extracted" | "reused";
  validationIssues: DocumentDiscoveryValidationIssue[];
}): DocumentDiscoveryExtraction {
  return DocumentDiscoveryExtractionSchema.parse({
    ...input.toolResponse,
    extractionId: input.extractionId,
    validationState: input.validationState,
    validationIssues: input.validationIssues,
  });
}

function parseProviderDiscoveryResponse(input: {
  body: unknown;
  expectedSourceId: string;
  expectedPageNumbers: number[];
  expectedMarkdownHash: string;
  expectedBlockIndexHash: string;
  blocks: Tier2DiscoveryEvidenceBlock[];
  extractionId: string;
  maxTokens: number;
  model: string;
  extractedAt: string;
  pageWindowId: string;
}): {
  toolArgs: unknown;
  extraction: DocumentDiscoveryExtraction;
  validationIssues: DocumentDiscoveryValidationIssue[];
} {
  const toolArgs = extractToolCallArguments(input.body, DISCOVERY_EXTRACTION_TOOL_NAME);
  if (toolArgs === null) {
    const inspection = inspectToolArguments({
      responseJson: input.body,
      toolName: DISCOVERY_EXTRACTION_TOOL_NAME,
    });
    const message =
      inspection.errorClass === "tool_arguments_unparseable"
        ? `${DISCOVERY_EXTRACTION_TOOL_NAME} tool arguments were present but unparseable.`
        : missingToolCallErrorMessage({
            toolName: DISCOVERY_EXTRACTION_TOOL_NAME,
            responseJson: input.body,
            maxTokens: input.maxTokens,
          });
    throw new DiscoveryWindowError(
      message,
      inspection.errorClass,
      inspection.details,
    );
  }
  const canonicalToolArgs = canonicalizeDiscoveryToolArgs({
    toolArgs,
    model: input.model,
    extractedAt: input.extractedAt,
    pageWindowId: input.pageWindowId,
    blocks: input.blocks,
  });
  const parsed = DocumentDiscoveryExtractionToolResponseSchema.safeParse(canonicalToolArgs);
  if (!parsed.success) {
    throw new DiscoveryWindowError(
      `Discovery extraction tool args failed schema validation: ${parsed.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join(".") || "<root>"} ${issue.message}`)
        .join("; ")}`,
      "tool_schema_validation_failed",
      {
        issueCount: parsed.error.issues.length,
        issues: parsed.error.issues.slice(0, 20).map((issue) => ({
          path: issue.path.join(".") || "<root>",
          message: issue.message,
          code: issue.code,
        })),
      },
    );
  }
  const toolResponse = parsed.data;
  const validationIssues = validateDiscoveryExtraction({
    extraction: toolResponse,
    expectedSourceId: input.expectedSourceId,
    expectedPageNumbers: input.expectedPageNumbers,
    expectedMarkdownHash: input.expectedMarkdownHash,
    expectedBlockIndexHash: input.expectedBlockIndexHash,
    blocks: input.blocks,
  });
  return {
    toolArgs,
    extraction: extractionFromToolResponse({
      toolResponse,
      extractionId: input.extractionId,
      validationState: "extracted",
      validationIssues,
    }),
    validationIssues,
  };
}

function windowFromExtraction(input: {
  windowId: string;
  sourceId: string;
  pageNumbers: number[];
  status: "extracted" | "reused";
  paths: WindowPaths;
  runRoot: string;
  provider: DiscoveryExtractionProvider;
  model: string;
  reusedExisting: boolean;
  usage: Tier2DiscoveryExtractionUsage | null;
  extraction: DocumentDiscoveryExtraction;
}): Tier2DiscoveryExtractionWindow {
  return {
    windowId: input.windowId,
    sourceId: input.sourceId,
    pageNumbers: input.pageNumbers,
    status: input.status,
    provider: input.provider,
    model: input.model,
    reusedExisting: input.reusedExisting,
    requestArtifactKey: artifactKey(input.paths.requestPath, input.runRoot),
    blockIndexArtifactKey: artifactKey(input.paths.blockIndexPath, input.runRoot),
    responseArtifactKey:
      input.status === "reused" ? null : artifactKey(input.paths.responsePath, input.runRoot),
    toolCallArtifactKey:
      input.status === "reused" ? null : artifactKey(input.paths.toolCallPath, input.runRoot),
    extractionArtifactKey: artifactKey(input.paths.extractionPath, input.runRoot),
    errorArtifactKey: null,
    usage: input.usage,
    estimatedCostUsd: input.usage?.estimatedCostUsd ?? 0,
    validationIssueCounts: countIssues(input.extraction.validationIssues),
    validationIssues: input.extraction.validationIssues,
    entityCount: input.extraction.entities.length,
    metricCount: input.extraction.metrics.length,
    eventCount: input.extraction.events.length,
    tableCount: input.extraction.tables.length,
    claimCount: input.extraction.claims.length,
    contextSignalCount: input.extraction.contextSignals.length,
    reviewQuestionCount: input.extraction.reviewQuestions.length,
  };
}

async function callDiscoveryProvider(input: {
  provider: DiscoveryExtractionProvider;
  model: string;
  maxTokens: number;
  messages: ToolCallMessage[];
  tool: { name: string; description: string; parameters: Record<string, unknown> };
  fetcher: FetchLike;
  pioneerApiKey?: string;
  deepseekApiKey?: string;
}) {
  if (input.provider === "pioneer") {
    const apiKey = input.pioneerApiKey ?? process.env["PIONEER_API_KEY"];
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error("PIONEER_API_KEY is required for --provider pioneer.");
    }
    return callPioneerToolCallDirect({
      apiKey,
      model: input.model,
      maxTokens: input.maxTokens,
      toolName: DISCOVERY_EXTRACTION_TOOL_NAME,
      messages: input.messages,
      tools: [input.tool],
      fetcher: input.fetcher,
    });
  }
  const apiKey = input.deepseekApiKey ?? process.env["DEEPSEEK_API_KEY"];
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new Error("DEEPSEEK_API_KEY is required for --provider deepseek.");
  }
  return callDeepSeekToolCallDirect({
    apiKey,
    model: input.model,
    maxTokens: input.maxTokens,
    toolName: DISCOVERY_EXTRACTION_TOOL_NAME,
    messages: input.messages,
    tools: [input.tool],
    fetcher: input.fetcher,
  });
}

async function processWindow(input: {
  runRoot: string;
  source: Tier2OcrPlanSource;
  sourceIndex: number;
  pages: Tier2OcrPageMarkdownAuditPage[];
  discoveryRootName: string;
  provider: DiscoveryExtractionProvider;
  model: string;
  maxTokens: number;
  execute: boolean;
  generatedAt: string;
  maxEstimatedCostUsd?: number;
  currentEstimatedCostUsd: () => number;
  fetcher: FetchLike;
  pioneerApiKey?: string;
  deepseekApiKey?: string;
}): Promise<{
  window: Tier2DiscoveryExtractionWindow;
  extraction: DocumentDiscoveryExtraction | null;
  usage: Tier2DiscoveryExtractionUsage | null;
}> {
  const pageNumbers = input.pages.map((page) => page.pageNumber);
  const windowId = `${input.source.sourceId}:${pageNumbers.join("-")}`;
  const paths = windowPaths({
    sourceRoot: sourceRoot({
      runRoot: input.runRoot,
      source: input.source,
      sourceIndex: input.sourceIndex,
      discoveryRootName: input.discoveryRootName,
    }),
    pages: pageNumbers,
  });
  await mkdir(paths.windowRoot, { recursive: true });

  const indexed = await readIndexedMarkdownWindow({
    runRoot: input.runRoot,
    pages: input.pages,
  });
  await writeJson(paths.blockIndexPath, {
    version: 1,
    promptVersion: DISCOVERY_EXTRACTION_PROMPT_VERSION,
    sourceId: input.source.sourceId,
    pageNumbers,
    markdownHash: indexed.markdownHash,
    blockIndexHash: indexed.blockIndexHash,
    pageArtifactKeys: indexed.pageArtifactKeys,
    blocks: indexed.blocks,
  });

  const tool = discoveryExtractionTool();
  const messages: ToolCallMessage[] = [
    { role: "system", content: DISCOVERY_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildDiscoveryPrompt({
        source: input.source,
        pages: input.pages,
        indexed,
      }),
    },
  ];
  await writeJson(paths.requestPath, {
    version: 1,
    promptVersion: DISCOVERY_EXTRACTION_PROMPT_VERSION,
    toolName: DISCOVERY_EXTRACTION_TOOL_NAME,
    provider: input.provider,
    model: input.model,
    maxTokens: input.maxTokens,
    messages,
    tool,
  });

  const existing = await existingExtraction({
    path: paths.extractionPath,
    expectedPromptVersion: DISCOVERY_EXTRACTION_PROMPT_VERSION,
    expectedSourceId: input.source.sourceId,
    expectedPageNumbers: pageNumbers,
    expectedPageArtifactKeys: indexed.pageArtifactKeys,
    expectedMarkdownHash: indexed.markdownHash,
    expectedBlockIndexHash: indexed.blockIndexHash,
  });
  if (existing !== null) {
    return {
      window: windowFromExtraction({
        windowId,
        sourceId: input.source.sourceId,
        pageNumbers,
        status: "reused",
        paths,
        runRoot: input.runRoot,
        provider: input.provider,
        model: input.model,
        reusedExisting: true,
        usage: null,
        extraction: existing,
      }),
      extraction: existing,
      usage: null,
    };
  }

  if (!input.execute) {
    return {
      window: {
        windowId,
        sourceId: input.source.sourceId,
        pageNumbers,
        status: "planned",
        provider: null,
        model: null,
        reusedExisting: false,
        requestArtifactKey: artifactKey(paths.requestPath, input.runRoot),
        blockIndexArtifactKey: artifactKey(paths.blockIndexPath, input.runRoot),
        responseArtifactKey: null,
        toolCallArtifactKey: null,
        extractionArtifactKey: null,
        errorArtifactKey: null,
        usage: null,
        estimatedCostUsd: 0,
        validationIssueCounts: {},
        validationIssues: [],
        entityCount: 0,
        metricCount: 0,
        eventCount: 0,
        tableCount: 0,
        claimCount: 0,
        contextSignalCount: 0,
        reviewQuestionCount: 0,
      },
      extraction: null,
      usage: null,
    };
  }

  if (
    input.maxEstimatedCostUsd !== undefined &&
    input.currentEstimatedCostUsd() >= input.maxEstimatedCostUsd
  ) {
    return {
      window: {
        windowId,
        sourceId: input.source.sourceId,
        pageNumbers,
        status: "budget_skipped",
        provider: input.provider,
        model: input.model,
        reusedExisting: false,
        requestArtifactKey: artifactKey(paths.requestPath, input.runRoot),
        blockIndexArtifactKey: artifactKey(paths.blockIndexPath, input.runRoot),
        responseArtifactKey: null,
        toolCallArtifactKey: null,
        extractionArtifactKey: null,
        errorArtifactKey: null,
        usage: null,
        estimatedCostUsd: 0,
        validationIssueCounts: {},
        validationIssues: [],
        entityCount: 0,
        metricCount: 0,
        eventCount: 0,
        tableCount: 0,
        claimCount: 0,
        contextSignalCount: 0,
        reviewQuestionCount: 0,
      },
      extraction: null,
      usage: null,
    };
  }

  let providerResult: OpenRouterCallResult | null = null;
  try {
    providerResult = await callDiscoveryProvider({
      provider: input.provider,
      model: input.model,
      maxTokens: input.maxTokens,
      messages,
      tool,
      fetcher: input.fetcher,
      ...(input.pioneerApiKey === undefined ? {} : { pioneerApiKey: input.pioneerApiKey }),
      ...(input.deepseekApiKey === undefined ? {} : { deepseekApiKey: input.deepseekApiKey }),
    });
    const result = providerResult;
    await writeJson(paths.responsePath, result.body);
    if (!result.response.ok) {
      throw new DiscoveryWindowError(
        openRouterErrorMessage(result.body) ?? result.response.statusText,
        "provider_http_error",
        {
          httpStatus: result.response.status,
          statusText: result.response.statusText,
        },
      );
    }
    const usage = estimateUsage({
      provider: input.provider,
      model: input.model,
      body: result.body,
    });
    const parsed = parseProviderDiscoveryResponse({
      body: result.body,
      expectedSourceId: input.source.sourceId,
      expectedPageNumbers: pageNumbers,
      expectedMarkdownHash: indexed.markdownHash,
      expectedBlockIndexHash: indexed.blockIndexHash,
      blocks: indexed.blocks,
      extractionId: `discovery_${input.source.sourceId}_${shortHash(
        `${windowId}:${indexed.blockIndexHash}`,
      )}`,
      maxTokens: input.maxTokens,
      model: input.model,
      extractedAt: input.generatedAt,
      pageWindowId: windowId,
    });
    await writeJson(paths.toolCallPath, parsed.toolArgs);
    await writeJson(paths.extractionPath, parsed.extraction);
    return {
      window: windowFromExtraction({
        windowId,
        sourceId: input.source.sourceId,
        pageNumbers,
        status: "extracted",
        paths,
        runRoot: input.runRoot,
        provider: input.provider,
        model: input.model,
        reusedExisting: false,
        usage,
        extraction: parsed.extraction,
      }),
      extraction: parsed.extraction,
      usage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const classified = classifyDiscoveryError(error);
    const responseArtifactKey =
      providerResult === null ? null : artifactKey(paths.responsePath, input.runRoot);
    await writeJson(paths.errorPath, {
      version: 1,
      promptVersion: DISCOVERY_EXTRACTION_PROMPT_VERSION,
      sourceId: input.source.sourceId,
      pageNumbers,
      provider: input.provider,
      model: input.model,
      windowId,
      error: message,
      errorClass: classified.errorClass,
      details: classified.details,
      attempts: providerResult?.attempts ?? [],
      providerRequestIds: providerRequestIdsFromAttempts(providerResult),
      finalHttpStatus: providerResult?.response.status ?? null,
      finalStatusText: providerResult?.response.statusText ?? null,
      finalHeaders:
        providerResult === null
          ? null
          : Object.fromEntries(
              [...providerResult.response.headers.entries()].sort(([left], [right]) =>
                left.localeCompare(right),
              ),
            ),
      requestArtifactKey: artifactKey(paths.requestPath, input.runRoot),
      blockIndexArtifactKey: artifactKey(paths.blockIndexPath, input.runRoot),
      responseArtifactKey,
    });
    return {
      window: {
        windowId,
        sourceId: input.source.sourceId,
        pageNumbers,
        status: "failed",
        provider: input.provider,
        model: input.model,
        reusedExisting: false,
        requestArtifactKey: artifactKey(paths.requestPath, input.runRoot),
        blockIndexArtifactKey: artifactKey(paths.blockIndexPath, input.runRoot),
        responseArtifactKey,
        toolCallArtifactKey: null,
        extractionArtifactKey: null,
        errorArtifactKey: artifactKey(paths.errorPath, input.runRoot),
        usage: null,
        estimatedCostUsd: 0,
        validationIssueCounts: {},
        validationIssues: [issue("error", classified.errorClass, "window", message)],
        entityCount: 0,
        metricCount: 0,
        eventCount: 0,
        tableCount: 0,
        claimCount: 0,
        contextSignalCount: 0,
        reviewQuestionCount: 0,
      },
      extraction: null,
      usage: null,
    };
  }
}

function summarizeWindows(input: {
  selectedSourceCount: number;
  windows: Tier2DiscoveryExtractionWindow[];
  usage: Tier2DiscoveryExtractionUsage;
}): Tier2DiscoveryExtractionArtifact["summary"] {
  let validationErrorCount = 0;
  let validationWarningCount = 0;
  for (const window of input.windows) {
    for (const issue of window.validationIssues) {
      if (issue.severity === "error") validationErrorCount += 1;
      else validationWarningCount += 1;
    }
  }
  return {
    selectedSourceCount: input.selectedSourceCount,
    windowCount: input.windows.length,
    plannedWindowCount: input.windows.filter((window) => window.status === "planned").length,
    extractedWindowCount: input.windows.filter((window) => window.status === "extracted").length,
    reusedExistingWindowCount: input.windows.filter((window) => window.status === "reused").length,
    budgetSkippedWindowCount: input.windows.filter((window) => window.status === "budget_skipped")
      .length,
    failedWindowCount: input.windows.filter((window) => window.status === "failed").length,
    promptTokens: input.usage.promptTokens,
    completionTokens: input.usage.completionTokens,
    cacheReadTokens: input.usage.cacheReadTokens,
    cacheWriteTokens: input.usage.cacheWriteTokens,
    totalTokens: input.usage.totalTokens,
    estimatedCostUsd: input.usage.estimatedCostUsd,
    validationErrorCount,
    validationWarningCount,
    entityCount: input.windows.reduce((sum, window) => sum + window.entityCount, 0),
    metricCount: input.windows.reduce((sum, window) => sum + window.metricCount, 0),
    eventCount: input.windows.reduce((sum, window) => sum + window.eventCount, 0),
    tableCount: input.windows.reduce((sum, window) => sum + window.tableCount, 0),
    claimCount: input.windows.reduce((sum, window) => sum + window.claimCount, 0),
    contextSignalCount: input.windows.reduce((sum, window) => sum + window.contextSignalCount, 0),
    reviewQuestionCount: input.windows.reduce((sum, window) => sum + window.reviewQuestionCount, 0),
  };
}

export async function extractTier2DocumentDiscoveries(
  args: ExtractTier2DocumentDiscoveriesArgs,
): Promise<Tier2DiscoveryExtractionArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const runRoot = dirname(args.ocrPlanPath);
  const plan = await readRequiredJsonArtifact<Tier2OcrPlan>(args.ocrPlanPath);
  const audit = await readRequiredJsonArtifact<Tier2OcrPageMarkdownAudit>(
    args.pageMarkdownAuditPath,
  );
  const provider = args.provider ?? DEFAULT_DISCOVERY_PROVIDER;
  const model = args.model ?? DEFAULT_DISCOVERY_MODEL;
  const maxTokens = args.maxTokens ?? DEFAULT_DISCOVERY_MAX_TOKENS;
  const discoveryRootName = args.discoveryRootName ?? DEFAULT_DISCOVERY_ROOT_NAME;
  const windowManifest = await readWindowManifest(args.windowManifestPath);
  const pageWindowSize = args.pageWindowSize ?? windowManifest?.pageWindowSize ?? 1;
  if (windowManifest !== null && windowManifest.pageWindowSize !== pageWindowSize) {
    throw new Error(
      `Window manifest pageWindowSize=${windowManifest.pageWindowSize} does not match requested pageWindowSize=${pageWindowSize}.`,
    );
  }
  const manifestWindowKeys =
    windowManifest === null
      ? null
      : new Set(
          windowManifest.windows.map((window) =>
            windowKey({ sourceId: window.sourceId, pageNumbers: window.pageNumbers }),
          ),
        );
  const windowConcurrency = args.windowConcurrency ?? 1;
  const execute = args.execute ?? false;
  const fetcher = args.fetcher ?? defaultFetch;
  const selected = selectedSources({
    plan,
    sourceIds: args.sourceIds,
    limitSources: args.limitSources,
  });

  const auditSourcesById = new Map(audit.sources.map((source) => [source.sourceId, source]));
  const work: Array<{
    source: Tier2OcrPlanSource;
    sourceIndex: number;
    pages: Tier2OcrPageMarkdownAuditPage[];
  }> = [];
  for (const current of selected) {
    const auditSource = auditSourcesById.get(current.source.sourceId);
    if (auditSource === undefined) continue;
    const pages = auditSource.pages
      .filter((page) => page.status === "ocr_complete" && page.markdownArtifactKey !== null)
      .toSorted((left, right) => left.pageNumber - right.pageNumber);
    for (const pagesWindow of chunkPages(pages, pageWindowSize)) {
      if (
        manifestWindowKeys !== null &&
        !manifestWindowKeys.has(
          windowKey({
            sourceId: current.source.sourceId,
            pageNumbers: pagesWindow.map((page) => page.pageNumber),
          }),
        )
      ) {
        continue;
      }
      work.push({ ...current, pages: pagesWindow });
    }
  }

  let usage = emptyUsage();
  const results = await mapWithConcurrency(work, windowConcurrency, async (item) => {
    const result = await processWindow({
      runRoot,
      source: item.source,
      sourceIndex: item.sourceIndex,
      pages: item.pages,
      discoveryRootName,
      provider,
      model,
      maxTokens,
      execute,
      generatedAt,
      currentEstimatedCostUsd: () => usage.estimatedCostUsd,
      fetcher,
      ...(args.maxEstimatedCostUsd === undefined
        ? {}
        : { maxEstimatedCostUsd: args.maxEstimatedCostUsd }),
      ...(args.pioneerApiKey === undefined ? {} : { pioneerApiKey: args.pioneerApiKey }),
      ...(args.deepseekApiKey === undefined ? {} : { deepseekApiKey: args.deepseekApiKey }),
    });
    usage = addUsage(usage, result.usage);
    return result;
  });

  const windows = results.map((result) => result.window);
  const extractions = results
    .map((result) => result.extraction)
    .filter((extraction): extraction is DocumentDiscoveryExtraction => extraction !== null);
  const artifact: Tier2DiscoveryExtractionArtifact = {
    version: 1,
    runId: plan.runId,
    generatedAt,
    ocrPlanPath: args.ocrPlanPath,
    pageMarkdownAuditPath: args.pageMarkdownAuditPath,
    windowManifestPath: args.windowManifestPath ?? null,
    outputPath: args.outputPath ?? null,
    provider,
    model,
    maxTokens,
    discoveryRootName,
    promptVersion: DISCOVERY_EXTRACTION_PROMPT_VERSION,
    execute,
    pageWindowSize,
    windowConcurrency,
    maxEstimatedCostUsd: args.maxEstimatedCostUsd ?? null,
    summary: summarizeWindows({
      selectedSourceCount: selected.length,
      windows,
      usage,
    }),
    windows,
    extractions,
  };
  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, artifact);
  }
  return artifact;
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  if (value === undefined) throw new Error(`${flag} requires a value.`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function parsePositiveNumber(value: string | undefined, flag: string): number {
  if (value === undefined) throw new Error(`${flag} requires a value.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number.`);
  }
  return parsed;
}

function parseProvider(value: string | undefined): DiscoveryExtractionProvider {
  if (value === "pioneer" || value === "deepseek") return value;
  throw new Error("--provider must be pioneer or deepseek.");
}

function parseDiscoveryExtractionCliArgs(args: string[]): DiscoveryExtractionCliArgs {
  return parseCliOptions<DiscoveryExtractionCliArgs>(args, {}, [
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
      flags: ["--window-manifest"],
      apply: (output, value) => {
        if (value !== undefined) output.windowManifestPath = fromCliPath(value);
      },
    },
    {
      flags: ["--discovery-root"],
      apply: (output, value) => {
        if (value !== undefined) output.discoveryRootName = value;
      },
    },
    {
      flags: ["--provider"],
      apply: (output, value) => {
        output.provider = parseProvider(value);
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
        output.maxTokens = parsePositiveInteger(value, "--max-tokens");
      },
    },
    {
      flags: ["--max-estimated-cost-usd", "--max-cost-usd", "--budget-usd"],
      apply: (output, value) => {
        output.maxEstimatedCostUsd = parsePositiveNumber(value, "--max-estimated-cost-usd");
      },
    },
    {
      flags: ["--page-window-size"],
      apply: (output, value) => {
        output.pageWindowSize = parsePositiveInteger(value, "--page-window-size");
      },
    },
    {
      flags: ["--window-concurrency"],
      apply: (output, value) => {
        output.windowConcurrency = parsePositiveInteger(value, "--window-concurrency");
      },
    },
    {
      flags: ["--source-id"],
      apply: (output, value) => {
        if (value !== undefined) output.sourceIds = [value];
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
      flags: ["--limit-sources"],
      apply: (output, value) => {
        output.limitSources = parsePositiveInteger(value, "--limit-sources");
      },
    },
    trueOption(["--execute"], (output) => {
      output.execute = true;
    }),
  ] satisfies CliOption<DiscoveryExtractionCliArgs>[]);
}

async function resolveDiscoveryExtractionCliPaths(
  args: DiscoveryExtractionCliArgs,
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
    outputPath: args.outputPath ?? join(baseDir, "document-discovery-extraction.json"),
  };
}

export async function extractTier2DocumentDiscoveriesFromCli(args: string[]) {
  const parsed = parseDiscoveryExtractionCliArgs(args);
  const paths = await resolveDiscoveryExtractionCliPaths(parsed);
  return extractTier2DocumentDiscoveries({
    ...paths,
    ...(parsed.discoveryRootName !== undefined
      ? { discoveryRootName: parsed.discoveryRootName }
      : {}),
    ...(parsed.windowManifestPath !== undefined
      ? { windowManifestPath: parsed.windowManifestPath }
      : {}),
    ...(parsed.provider !== undefined ? { provider: parsed.provider } : {}),
    ...(parsed.model !== undefined ? { model: parsed.model } : {}),
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
    ...(parsed.execute !== undefined ? { execute: parsed.execute } : {}),
  });
}
