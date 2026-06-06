import { createHash } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { type Api, type Model, type Static, Type } from "@earendil-works/pi-ai";
import { readJsonIfExists, writeJson } from "../../../lib/json.ts";
import {
  deepSeekModel,
  getDeepSeekCatalogModel,
  pioneerModel,
  type ToolCallMessage,
} from "../../../lib/llm.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../../lib/paths.ts";
import {
  buildStderrEventSink,
  makeToolLoopRunner,
  type CodemodeTerminationSignal,
  type ModelToolLoop,
  type ToolLoopResult,
} from "../../../lib/codemode/index.ts";
import {
  callDeepSeekToolCallViaPi,
  callPioneerToolCallDirect,
  openRouterErrorMessage,
} from "./_llm-clients.ts";
import {
  defaultFetch,
  extractToolCallArguments,
  missingToolCallErrorMessage,
  parseCliOptions,
  trueOption,
  type CliOption,
  type FetchLike,
} from "./_shared.ts";

const ARTIFACT_KIND = "bp.tier2_vocab_synthesis_run.v1";
const VOCAB_MAP_KIND = "bp.tier2_vocab_map.v1";
const SOURCE_AUDIT_KIND = "bp.tier2_vocab_source_audit.v1";
const PROMPT_VERSION = "tier2-vocab-synthesis-v2";
const TOOL_NAME = "submit_tier2_vocab_map";
const V2_TOOL_NAME = "submit_tier2_vocab_decisions";
const DEFAULT_MODEL = "claude-opus-4-5";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_MAX_TOKENS = 20_000;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_EXAMPLES_PER_VALUE = 4;
const DEFAULT_SOURCE_AUDIT_EXAMPLES_PER_VALUE = 2;
const DEFAULT_AGENTIC_MAX_TOOL_CALLS = 40;
const DEFAULT_AGENTIC_WALL_TIME_MS = 6 * 60 * 1000;
const DEFAULT_V2_MAX_CONTEXT_CALLS = 12;
const DEFAULT_PROVIDER_RETRY_COUNT = 4;
const DEFAULT_PROVIDER_RETRY_BASE_DELAY_MS = 60_000;
const INLINE_EXAMPLES_PER_VALUE = 2;

const MEASUREMENT_DIMENSIONS = [
  "count",
  "ratio_or_share",
  "duration",
  "distance",
  "speed",
  "currency",
  "score_or_rating",
  "ordinal",
  "temporal",
  "binary",
  "qualitative",
  "compound",
  "unknown",
] as const;

const METRIC_FAMILIES = [
  "ridership",
  "safety",
  "travel_time_speed",
  "service_frequency",
  "street_geometry",
  "traffic_parking",
  "demographics_equity",
  "community_feedback",
  "project_delivery",
  "cost_funding",
  "network_service",
  "environment",
  "generic_count",
  "generic_score",
  "generic_unit",
  "other",
  "unknown",
] as const;

const MERGE_POLICIES = [
  "same_leaf_only",
  "family_rollup_allowed",
  "preserve_raw_preferred",
] as const;

const MEASUREMENT_DIMENSION_SET = new Set<string>(MEASUREMENT_DIMENSIONS);
const METRIC_FAMILY_SET = new Set<string>(METRIC_FAMILIES);
const MERGE_POLICY_SET = new Set<string>(MERGE_POLICIES);

type SourceFieldCounts = Record<string, number>;
type VocabLlmProvider = "pioneer" | "deepseek";
type VocabHarnessVersion = "v1" | "v2";

type GraduationExample = {
  artifactPath: string;
  sourceId?: string;
  sourceGroup?: string;
  pageNumbers?: number[];
  surfaceId?: string;
  surfaceKind: string;
  payloadSchemaId?: string;
  displayLabel?: string;
  sourceFieldPath: string;
};

type GraduationValue = {
  value: string;
  count: number;
  sourceFieldCounts: SourceFieldCounts;
  surfaceKindCounts: SourceFieldCounts;
  examples: GraduationExample[];
};

type GraduationKey = {
  id: string;
  tier: "core" | "secondary";
  targetPayloadPath: string;
  sourceFieldPaths: string[];
  mode: string;
  description: string;
  instanceCount: number;
  distinctValueCount: number;
  repeatedDistinctValueCount: number;
  topValues: GraduationValue[];
};

type GraduationPlan = {
  artifactKind: string;
  schemaVersion: number;
  generatedAt: string;
  sourceRoots?: string[];
  sourceCanonicalMergePaths?: string[];
  summary: {
    acceptedSurfaceCount: number;
    totalGraduationDistinctValues: number;
  };
  graduationKeys: GraduationKey[];
};

type VocabInputValue = {
  rawValue: string;
  normalizedRawValue: string;
  inputCount: number;
  sourceFieldCounts: SourceFieldCounts;
  surfaceKindCounts: SourceFieldCounts;
  examples: GraduationExample[];
};

type PromptEvidenceQuote = {
  pageArtifactKey?: string;
  lineStart?: number;
  lineEnd?: number;
  quoteText: string;
};

type PromptExampleContext = GraduationExample & {
  artifactRef: string;
  artifactFound: boolean;
  fieldSupportVerified: boolean | null;
  rawText: string | null;
  rawPayloadContext: Record<string, unknown>;
  evidenceQuotes: PromptEvidenceQuote[];
  pageMarkdownExcerpt: string | null;
};

type PromptValueContext = {
  rawValue: string;
  normalizedRawValue: string;
  inputCount: number;
  sourceFieldCounts: SourceFieldCounts;
  surfaceKindCounts: SourceFieldCounts;
  usageExamples: PromptExampleContext[];
};

type VocabChunk = {
  chunkId: string;
  keyId: string;
  chunkIndex: number;
  chunkCount: number;
  valueCount: number;
  values: VocabInputValue[];
  chunkPath: string;
};

type CanonicalValue = {
  canonicalId: string;
  label: string;
  description: string;
  measurementDimension: string;
  metricFamily: string;
  mergePolicy: "same_leaf_only" | "family_rollup_allowed" | "preserve_raw_preferred";
  countedEntityFamily?: string;
  coarseGroup?: string;
  semanticTags: string[];
  downstreamUses: string[];
  positiveExamples: string[];
  negativeExamples: string[];
};

type ModelAlias = {
  rawValue: string;
  normalizedRawValue: string;
  decision: "mapped" | "unresolved" | "preserve_raw";
  canonicalId?: string;
  confidence: number;
  rationale: string;
  reviewFlags: string[];
};

type ModelVocabResponse = {
  keyId: string;
  canonicalValues: CanonicalValue[];
  aliases: ModelAlias[];
  reviewNotes: Array<{
    note: string;
    rawValues: string[];
  }>;
};

type EnrichedAlias = ModelAlias & {
  inputCount: number;
  sourceFieldCounts: SourceFieldCounts;
  surfaceKindCounts: SourceFieldCounts;
  examples: GraduationExample[];
};

type ChunkValidation = {
  artifactKind: "bp.tier2_vocab_chunk_validation.v1";
  schemaVersion: 1;
  generatedAt: string;
  chunkId: string;
  keyId: string;
  status: "accepted" | "rejected";
  blockerCount: number;
  blockers: Array<{
    code: string;
    message: string;
    rawValue?: string;
  }>;
  summary: {
    inputValueCount: number;
    aliasCount: number;
    canonicalValueCount: number;
    mappedCount: number;
    unresolvedCount: number;
    preserveRawCount: number;
  };
};

type VocabMapArtifact = {
  artifactKind: typeof VOCAB_MAP_KIND;
  schemaVersion: 1;
  generatedAt: string;
  promptVersion: typeof PROMPT_VERSION;
  sourceGraduationPlanPath: string;
  keyId: string;
  targetPayloadPath: string;
  model: string | null;
  temperature: number | null;
  summary: {
    inputValueCount: number;
    canonicalValueCount: number;
    aliasCount: number;
    mappedCount: number;
    unresolvedCount: number;
    preserveRawCount: number;
    instanceCoverageCount: number;
  };
  canonicalValues: CanonicalValue[];
  aliases: EnrichedAlias[];
  reviewNotes: ModelVocabResponse["reviewNotes"];
};

type SourceAudit = {
  artifactKind: typeof SOURCE_AUDIT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceVocabMapPath: string;
  sourceGraduationPlanPath: string;
  keyId: string;
  linkedEvidence: {
    checkedExampleCount: number;
    artifactFoundCount: number;
    fieldSupportVerifiedCount: number;
    evidencePointerQuoteCount: number;
    pageMarkdownFoundCount: number;
    pageTextMatchCount: number;
    sampleFailures: Array<{
      rawValue: string;
      displayLabel?: string;
      artifactPath: string;
      sourceId?: string;
      reason: string;
    }>;
  };
  externalMtaSourceScan: {
    sourceRoot: string | null;
    scannedDocumentCount: number;
    documentWithMatchCount: number;
    matchedAliasCount: number;
    matchedCanonicalIds: Record<string, number>;
    samples: Array<{
      sourceId: string;
      sourcePath: string;
      rawValue: string;
      canonicalId: string;
      snippet: string;
    }>;
  };
};

export type Tier2VocabSynthesisRun = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  promptVersion: typeof PROMPT_VERSION;
  sourceGraduationPlanPath: string;
  outputRoot: string;
  keyIds: string[];
  chunkSize: number;
  examplesPerValue: number;
  execute: boolean;
  harness: VocabHarnessVersion;
  provider: VocabLlmProvider | null;
  model: string | null;
  temperature: number | null;
  summary: {
    keyCount: number;
    chunkCount: number;
    inputValueCount: number;
    executedChunkCount: number;
    acceptedChunkCount: number;
    rejectedChunkCount: number;
  };
  keys: Array<{
    keyId: string;
    tier: "core" | "secondary";
    targetPayloadPath: string;
    description: string;
    inputValueCount: number;
    instanceCount: number;
    distinctValueCount: number;
    chunks: VocabChunk[];
  }>;
  chunkResults: Array<{
    chunkId: string;
    promptPath: string | null;
    executionMode: "not_executed" | "direct_tool_call" | "agentic_tool_loop";
    requestPath: string | null;
    responsePath: string | null;
    toolCallPath: string | null;
    validationPath: string | null;
    toolLoopPath: string | null;
    sessionPath: string | null;
    status: "not_executed" | "accepted" | "rejected" | "provider_failed";
    errorPath: string | null;
  }>;
  vocabMapPath: string | null;
  sourceAuditPath: string | null;
};

export type RunTier2VocabSynthesisArgs = {
  graduationPlanPath: string;
  outputRoot?: string;
  keyIds?: readonly string[];
  chunkSize?: number;
  maxValuesPerKey?: number;
  examplesPerValue?: number;
  execute?: boolean;
  agenticLoop?: boolean;
  provider?: VocabLlmProvider;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  pioneerApiKey?: string;
  deepseekApiKey?: string;
  fetcher?: FetchLike;
  modelToolLoop?: ModelToolLoop;
  harness?: VocabHarnessVersion;
  agenticMaxToolCalls?: number;
  maxContextToolCalls?: number;
  agenticWallTimeMs?: number;
  persistSessions?: boolean;
  sourceAuditRoot?: string;
  sourceAuditExamplesPerValue?: number;
  generatedAt?: string;
};

type CliArgs = {
  graduationPlanPath?: string;
  outputRoot?: string;
  keyIds?: string[];
  chunkSize?: number;
  maxValuesPerKey?: number;
  examplesPerValue?: number;
  execute?: boolean;
  agenticLoop?: boolean;
  provider?: VocabLlmProvider;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  harness?: VocabHarnessVersion;
  agenticMaxToolCalls?: number;
  maxContextToolCalls?: number;
  agenticWallTimeMs?: number;
  persistSessions?: boolean;
  sourceAuditRoot?: string;
  sourceAuditExamplesPerValue?: number;
  generatedAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function normalizeRawValue(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function canonicalIdCandidate(value: string): string {
  const symbolAliases: Record<string, string> = {
    "%": "percent",
    "$": "usd",
    "#": "number",
  };
  const trimmed = value.trim();
  if (symbolAliases[trimmed] !== undefined) return symbolAliases[trimmed];
  const compact = normalizeRawValue(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return compact.endsWith("s") && compact.length > 4 ? compact.slice(0, -1) : compact;
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function parseGraduationPlan(raw: unknown, path: string): GraduationPlan {
  if (!isRecord(raw)) throw new Error(`Graduation plan is not an object: ${path}`);
  const graduationKeysRaw = Array.isArray(raw["graduationKeys"]) ? raw["graduationKeys"] : [];
  const graduationKeys = graduationKeysRaw.flatMap((key): GraduationKey[] => {
    if (!isRecord(key)) return [];
    const id = typeof key["id"] === "string" ? key["id"] : null;
    if (id === null) return [];
    const topValuesRaw = Array.isArray(key["topValues"]) ? key["topValues"] : [];
    return [{
      id,
      tier: key["tier"] === "secondary" ? "secondary" : "core",
      targetPayloadPath: typeof key["targetPayloadPath"] === "string" ? key["targetPayloadPath"] : "",
      sourceFieldPaths: Array.isArray(key["sourceFieldPaths"])
        ? key["sourceFieldPaths"].filter((item): item is string => typeof item === "string")
        : [],
      mode: typeof key["mode"] === "string" ? key["mode"] : "",
      description: typeof key["description"] === "string" ? key["description"] : "",
      instanceCount: typeof key["instanceCount"] === "number" ? key["instanceCount"] : 0,
      distinctValueCount: typeof key["distinctValueCount"] === "number" ? key["distinctValueCount"] : 0,
      repeatedDistinctValueCount: typeof key["repeatedDistinctValueCount"] === "number" ? key["repeatedDistinctValueCount"] : 0,
      topValues: topValuesRaw.flatMap((value): GraduationValue[] => {
        if (!isRecord(value) || typeof value["value"] !== "string") return [];
        return [{
          value: value["value"],
          count: typeof value["count"] === "number" ? value["count"] : 0,
          sourceFieldCounts: numericRecord(value["sourceFieldCounts"]),
          surfaceKindCounts: numericRecord(value["surfaceKindCounts"]),
          examples: Array.isArray(value["examples"])
            ? value["examples"].flatMap((example): GraduationExample[] => {
                if (!isRecord(example) || typeof example["artifactPath"] !== "string") return [];
                return [{
                  artifactPath: fromCliPath(example["artifactPath"]),
                  ...(typeof example["sourceId"] === "string" ? { sourceId: example["sourceId"] } : {}),
                  ...(typeof example["sourceGroup"] === "string" ? { sourceGroup: example["sourceGroup"] } : {}),
                  ...(Array.isArray(example["pageNumbers"])
                    ? { pageNumbers: example["pageNumbers"].filter((page): page is number => typeof page === "number") }
                    : {}),
                  ...(typeof example["surfaceId"] === "string" ? { surfaceId: example["surfaceId"] } : {}),
                  surfaceKind: typeof example["surfaceKind"] === "string" ? example["surfaceKind"] : "unknown",
                  ...(typeof example["payloadSchemaId"] === "string" ? { payloadSchemaId: example["payloadSchemaId"] } : {}),
                  ...(typeof example["displayLabel"] === "string" ? { displayLabel: example["displayLabel"] } : {}),
                  sourceFieldPath: typeof example["sourceFieldPath"] === "string" ? example["sourceFieldPath"] : "",
                }];
              })
            : [],
        }];
      }),
    }];
  });
  const summary = isRecord(raw["summary"]) ? raw["summary"] : {};
  return {
    artifactKind: typeof raw["artifactKind"] === "string" ? raw["artifactKind"] : "unknown",
    schemaVersion: typeof raw["schemaVersion"] === "number" ? raw["schemaVersion"] : 0,
    generatedAt: typeof raw["generatedAt"] === "string" ? raw["generatedAt"] : "",
    sourceRoots: Array.isArray(raw["sourceRoots"]) ? raw["sourceRoots"].filter((item): item is string => typeof item === "string") : [],
    sourceCanonicalMergePaths: Array.isArray(raw["sourceCanonicalMergePaths"])
      ? raw["sourceCanonicalMergePaths"].filter((item): item is string => typeof item === "string")
      : [],
    summary: {
      acceptedSurfaceCount: typeof summary["acceptedSurfaceCount"] === "number" ? summary["acceptedSurfaceCount"] : 0,
      totalGraduationDistinctValues: typeof summary["totalGraduationDistinctValues"] === "number" ? summary["totalGraduationDistinctValues"] : 0,
    },
    graduationKeys,
  };
}

function numericRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, count]) =>
      typeof count === "number" && Number.isFinite(count) ? [[key, count]] : [],
    ),
  );
}

function selectKeys(plan: GraduationPlan, keyIds: readonly string[] | undefined): GraduationKey[] {
  const selected = keyIds === undefined || keyIds.length === 0
    ? plan.graduationKeys
    : keyIds.flatMap((keyId) => {
        const key = plan.graduationKeys.find((candidate) => candidate.id === keyId);
        if (key === undefined) throw new Error(`Graduation key not found: ${keyId}`);
        return [key];
      });
  if (selected.length === 0) throw new Error("No graduation keys selected.");
  return selected;
}

function chunkValues(key: GraduationKey, input: {
  chunkSize: number;
  maxValuesPerKey?: number;
  examplesPerValue: number;
  outputRoot: string;
}): VocabChunk[] {
  const chunks: VocabChunk[] = [];
  const selectedValues = input.maxValuesPerKey === undefined
    ? key.topValues
    : key.topValues.slice(0, input.maxValuesPerKey);
  const chunkCount = Math.max(1, Math.ceil(selectedValues.length / input.chunkSize));
  for (let index = 0; index < chunkCount; index += 1) {
    const values = selectedValues.slice(index * input.chunkSize, (index + 1) * input.chunkSize).map((value) => ({
      rawValue: value.value,
      normalizedRawValue: normalizeRawValue(value.value),
      inputCount: value.count,
      sourceFieldCounts: value.sourceFieldCounts,
      surfaceKindCounts: value.surfaceKindCounts,
      examples: value.examples.slice(0, input.examplesPerValue),
    }));
    const chunkId = `${key.id}-chunk-${String(index + 1).padStart(4, "0")}`;
    chunks.push({
      chunkId,
      keyId: key.id,
      chunkIndex: index + 1,
      chunkCount,
      valueCount: values.length,
      values,
      chunkPath: join(input.outputRoot, "chunks", key.id, chunkId, "input.json"),
    });
  }
  return chunks;
}

function modelTool() {
  return {
    name: TOOL_NAME,
    description:
      "Submit a canonical taxonomy and alias decisions for one Tier 2 raw-value vocabulary chunk.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["keyId", "canonicalValues", "aliases", "reviewNotes"],
      properties: {
        keyId: { type: "string" },
        canonicalValues: {
          type: "array",
          minItems: 1,
          maxItems: 80,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "canonicalId",
              "label",
              "description",
              "measurementDimension",
              "metricFamily",
              "mergePolicy",
              "semanticTags",
              "downstreamUses",
              "positiveExamples",
              "negativeExamples",
            ],
            properties: {
              canonicalId: { type: "string" },
              label: { type: "string" },
              description: { type: "string" },
              measurementDimension: { type: "string", enum: [...MEASUREMENT_DIMENSIONS] },
              metricFamily: { type: "string", enum: [...METRIC_FAMILIES] },
              mergePolicy: { type: "string", enum: [...MERGE_POLICIES] },
              countedEntityFamily: { type: "string" },
              coarseGroup: { type: "string" },
              semanticTags: { type: "array", items: { type: "string" } },
              downstreamUses: { type: "array", items: { type: "string" } },
              positiveExamples: { type: "array", items: { type: "string" } },
              negativeExamples: { type: "array", items: { type: "string" } },
            },
          },
        },
        aliases: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "rawValue",
              "normalizedRawValue",
              "decision",
              "confidence",
              "rationale",
              "reviewFlags",
            ],
            properties: {
              rawValue: { type: "string" },
              normalizedRawValue: { type: "string" },
              decision: { type: "string", enum: ["mapped", "unresolved", "preserve_raw"] },
              canonicalId: { type: "string" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string" },
              reviewFlags: { type: "array", items: { type: "string" } },
            },
          },
        },
        reviewNotes: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["note", "rawValues"],
            properties: {
              note: { type: "string" },
              rawValues: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  };
}

function defaultModelForProvider(provider: VocabLlmProvider): string {
  return provider === "deepseek" ? DEFAULT_DEEPSEEK_MODEL : DEFAULT_MODEL;
}

function apiKeyForProvider(input: {
  provider: VocabLlmProvider;
  pioneerApiKey?: string;
  deepseekApiKey?: string;
}): string | undefined {
  if (input.provider === "deepseek") {
    return input.deepseekApiKey ?? process.env["DEEPSEEK_API_KEY"];
  }
  return input.pioneerApiKey ?? process.env["PIONEER_API_KEY"];
}

function envNameForProvider(provider: VocabLlmProvider): "PIONEER_API_KEY" | "DEEPSEEK_API_KEY" {
  return provider === "deepseek" ? "DEEPSEEK_API_KEY" : "PIONEER_API_KEY";
}

function resolveVocabModel(provider: VocabLlmProvider, modelId: string): Model<Api> {
  if (provider === "deepseek") {
    return getDeepSeekCatalogModel(modelId) ?? deepSeekModel(modelId);
  }
  return pioneerModel(modelId);
}

function systemPrompt(): string {
  return [
    "You are designing a deterministic vocabulary map for a NYC bus reliability document corpus.",
    "You are not extracting facts from source documents.",
    "You only classify raw category/unit labels that were already extracted and evidence-gated elsewhere.",
    "The runner owns counts, source paths, evidence, and examples; do not invent or modify those.",
    "Return one alias decision for every input rawValue exactly once.",
    "Use stable lowercase snake_case canonicalId values.",
    "Use mapped only when the raw value cleanly belongs to a canonical value.",
    "Use preserve_raw for compound, highly specific, or lossy values.",
    "Use unresolved when the value is unclear or likely extraction noise.",
    "Never normalize route ids, dates, numeric values, geography ids, or evidence handles.",
    "Call the tool exactly once.",
  ].join("\n");
}

function systemPromptV2(): string {
  return [
    "You are designing a deterministic vocabulary map for a NYC bus reliability document corpus.",
    "You are not extracting facts from source documents.",
    "You only classify raw category/unit labels that were already extracted and evidence-gated elsewhere.",
    "The runner owns counts, source paths, evidence, and examples; do not invent or modify those.",
    "Return one alias decision for every input rawValue exactly once.",
    "Use stable lowercase snake_case canonicalId values.",
    "Use mapped only when the raw value cleanly belongs to a canonical value.",
    "Use preserve_raw for compound, highly specific, or lossy values.",
    "Use unresolved when the value is unclear or likely extraction noise.",
    "Never normalize route ids, dates, numeric values, geography ids, or evidence handles.",
    "Review the compact input table and deterministic hints first.",
    "Do not call context tools unless the compact table and hints are insufficient for a specific ambiguity.",
    "Prefer batch context calls over one call per value.",
    `Call ${V2_TOOL_NAME} when ready. If rejected, fix the blockers and call it again.`,
    "In compact submissions, aliases include rawValue, decision, optional canonicalId, confidence, rationale, reviewFlags.",
    "Include canonicalId only when decision=mapped.",
    "newCanonicalValues contains only newly introduced canonical definitions for this chunk.",
    "Aliases may reference prior canonicalIds without re-sending their canonical definitions.",
    "Every new canonical value must include measurementDimension, metricFamily, mergePolicy, semanticTags, downstreamUses, positiveExamples, negativeExamples, and countedEntityFamily when it counts a known entity.",
    "Allowed measurementDimension values:",
    MEASUREMENT_DIMENSIONS.join(", "),
    "Allowed metricFamily values:",
    METRIC_FAMILIES.join(", "),
    "Allowed mergePolicy values:",
    MERGE_POLICIES.join(", "),
    "Leaf vs family guidance:",
    taxonomyGuidance("metricUnit"),
  ].join("\n");
}

const PROMPT_CONTEXT_RAW_PAYLOAD_KEYS = [
  "labelRaw",
  "metricLabelRaw",
  "metricNameRaw",
  "subjectRaw",
  "metricSubjectRaw",
  "valueRaw",
  "metricValueRaw",
  "unitRaw",
  "metricUnitRaw",
  "periodRaw",
  "geographyRaw",
  "comparisonRaw",
  "directionRaw",
  "statusRaw",
  "routeTextRaw",
  "claimTextRaw",
  "tableKindRaw",
  "contextKindRaw",
] as const;

function rawPayloadContext(surface: Record<string, unknown>): Record<string, unknown> {
  const rawPayload = isRecord(surface["rawPayload"]) ? surface["rawPayload"] : {};
  return Object.fromEntries(PROMPT_CONTEXT_RAW_PAYLOAD_KEYS.flatMap((key) => {
    const value = rawPayload[key];
    if (value === undefined || value === null || value === "") return [];
    if (Array.isArray(value)) return [[key, value.slice(0, 8)]];
    if (typeof value === "object") return [];
    return [[key, value]];
  }));
}

function evidenceQuoteContexts(item: Record<string, unknown> | null): Array<{
  pageArtifactKey?: string;
  lineStart?: number;
  lineEnd?: number;
  quoteText: string;
}> {
  if (item === null || !Array.isArray(item["evidencePointers"])) return [];
  return item["evidencePointers"].flatMap((pointer) => {
    if (!isRecord(pointer) || typeof pointer["quoteText"] !== "string") return [];
    return [{
      ...(typeof pointer["pageArtifactKey"] === "string" ? { pageArtifactKey: pointer["pageArtifactKey"] } : {}),
      ...(typeof pointer["lineStart"] === "number" ? { lineStart: pointer["lineStart"] } : {}),
      ...(typeof pointer["lineEnd"] === "number" ? { lineEnd: pointer["lineEnd"] } : {}),
      quoteText: pointer["quoteText"],
    }];
  }).slice(0, 3);
}

function compactText(value: string, maxChars: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars - 3)}...`;
}

function quoteInline(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function providerRetryDelayMs(chunkId: string, retryIndex: number): number {
  const baseDelayMs = Math.min(
    8 * 60_000,
    DEFAULT_PROVIDER_RETRY_BASE_DELAY_MS * (2 ** retryIndex),
  );
  const jitterMs = Number.parseInt(shortHash(`${chunkId}:${retryIndex}`).slice(0, 4), 16) % 20_000;
  return baseDelayMs + jitterMs;
}

function formatCountMap(counts: SourceFieldCounts): string {
  const entries = Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => `${key}=${count}`);
  return entries.length === 0 ? "(none)" : entries.join(", ");
}

function formatRawPayloadContext(context: Record<string, unknown>, maxValueChars = 180): string {
  const entries = Object.entries(context);
  if (entries.length === 0) return "(none)";
  return entries.map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}=[${value.map((item) => compactText(String(item), maxValueChars)).join("; ")}]`;
    }
    return `${key}=${quoteInline(compactText(String(value), maxValueChars))}`;
  }).join("; ");
}

function exampleArtifactRef(example: GraduationExample): string {
  const pathBits = example.artifactPath.split("/");
  const runIndex = pathBits.findIndex((part) => part === "agentic-runs-20260604");
  const tail = runIndex >= 0 ? pathBits.slice(runIndex + 1).join("/") : example.artifactPath;
  return compactText(tail, 220);
}

function excerptAroundNeedles(text: string, needles: string[], maxChars: number): string | null {
  const lower = text.toLowerCase();
  const needle = needles
    .map((item) => item.trim())
    .filter((item) => item.length > 1)
    .find((item) => lower.includes(item.toLowerCase()));
  if (needle === undefined) {
    return text.trim().length === 0 ? null : compactText(text, maxChars);
  }
  const index = lower.indexOf(needle.toLowerCase());
  const radius = Math.floor(maxChars / 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + needle.length + radius);
  return compactText(text.slice(start, end), maxChars);
}

function snippetFor(text: string, needle: string): string {
  return excerptAroundNeedles(text, [needle], 240) ?? compactText(text, 240);
}

async function promptExampleContext(
  example: GraduationExample,
  input: {
    rawValue: string;
    includePageMarkdownExcerpt: boolean;
  },
): Promise<PromptExampleContext> {
  const base: PromptExampleContext = {
    ...example,
    artifactRef: exampleArtifactRef(example),
    artifactFound: false,
    fieldSupportVerified: null,
    rawText: null,
    rawPayloadContext: {},
    evidenceQuotes: [],
    pageMarkdownExcerpt: null,
  };
  try {
    const artifact = await Bun.file(example.artifactPath).json();
    if (!isRecord(artifact)) return base;
    const item = findAcceptedSurface(artifact, example.surfaceId);
    const surface = item !== null && isRecord(item["surface"]) ? item["surface"] : {};
    const pageMarkdown = input.includePageMarkdownExcerpt
      ? await readPageMarkdown(pageArtifactKeyFor(artifact, item))
      : null;
    return {
      ...base,
      artifactFound: true,
      fieldSupportVerified: item === null ? null : supportVerifiedFor(item, example.sourceFieldPath),
      rawText: typeof surface["rawText"] === "string" ? surface["rawText"] : null,
      rawPayloadContext: rawPayloadContext(surface),
      evidenceQuotes: evidenceQuoteContexts(item),
      pageMarkdownExcerpt: pageMarkdown === null
        ? null
        : excerptAroundNeedles(pageMarkdown, [
            input.rawValue,
            example.displayLabel ?? "",
            typeof surface["rawText"] === "string" ? surface["rawText"] : "",
          ], 900),
    };
  } catch {
    return base;
  }
}

async function promptValues(
  input: VocabChunk,
  options: { includePageMarkdownExcerpt: boolean },
): Promise<PromptValueContext[]> {
  const out: PromptValueContext[] = [];
  for (const value of input.values) {
    out.push({
      rawValue: value.rawValue,
      normalizedRawValue: value.normalizedRawValue,
      inputCount: value.inputCount,
      sourceFieldCounts: value.sourceFieldCounts,
      surfaceKindCounts: value.surfaceKindCounts,
      usageExamples: await Promise.all(value.examples.map((example) => promptExampleContext(example, {
        rawValue: value.rawValue,
        includePageMarkdownExcerpt: options.includePageMarkdownExcerpt,
      }))),
    });
  }
  return out;
}

function renderPromptValuesToMarkdown(values: PromptValueContext[], options: {
  detail: "inline_compact" | "tool_full";
}): string {
  const inlineCompact = options.detail === "inline_compact";
  const lines: string[] = [];
  lines.push(`values[count=${values.length}]:`);
  values.forEach((value, valueIndex) => {
    const valueRef = `v${String(valueIndex + 1).padStart(3, "0")}`;
    lines.push(`- ref: ${valueRef}`);
    lines.push(`  raw: ${quoteInline(value.rawValue)}`);
    lines.push(`  normalized: ${quoteInline(value.normalizedRawValue)}`);
    lines.push(`  count: ${value.inputCount}`);
    lines.push(`  fields: ${formatCountMap(value.sourceFieldCounts)}`);
    lines.push(`  surfaceKinds: ${formatCountMap(value.surfaceKindCounts)}`);
    const usageExamples = inlineCompact
      ? value.usageExamples.slice(0, INLINE_EXAMPLES_PER_VALUE)
      : value.usageExamples;
    if (usageExamples.length === 0) {
      lines.push("  examples: []");
      return;
    }
    const exampleCountLabel = inlineCompact && value.usageExamples.length > usageExamples.length
      ? `${usageExamples.length} of ${value.usageExamples.length}`
      : String(usageExamples.length);
    lines.push(`  examples[count=${exampleCountLabel}]:`);
    usageExamples.forEach((example, exampleIndex) => {
      const exampleRef = `${valueRef}.e${String(exampleIndex + 1).padStart(2, "0")}`;
      lines.push(`    - ref: ${exampleRef}`);
      lines.push(`      sourceId: ${example.sourceId ?? "(unknown)"}`);
      lines.push(`      pages: ${(example.pageNumbers ?? []).join(", ") || "(unknown)"}`);
      lines.push(`      field: ${example.sourceFieldPath}`);
      const supportVerified = example.fieldSupportVerified === null
        ? "unknown"
        : example.fieldSupportVerified ? "yes" : "no";
      lines.push(`      supportVerified: ${supportVerified}`);
      if (!inlineCompact) lines.push(`      surfaceId: ${example.surfaceId ?? "(unknown)"}`);
      if (example.displayLabel !== undefined) {
        lines.push(`      label: ${quoteInline(compactText(example.displayLabel, inlineCompact ? 160 : 260))}`);
      }
      if (example.rawText !== null) {
        lines.push(`      rawText: ${quoteInline(compactText(example.rawText, inlineCompact ? 220 : 360))}`);
      }
      lines.push(
        `      payload: ${formatRawPayloadContext(example.rawPayloadContext, inlineCompact ? 120 : 180)}`,
      );
      if (!inlineCompact && example.evidenceQuotes.length > 0) {
        lines.push("      evidence:");
        for (const quote of example.evidenceQuotes) {
          const linePart = quote.lineStart === undefined
            ? ""
            : `L${quote.lineStart}${
                quote.lineEnd === undefined || quote.lineEnd === quote.lineStart ? "" : `-L${quote.lineEnd}`
              } `;
          lines.push(`        - ${linePart}${quoteInline(compactText(quote.quoteText, 360))}`);
        }
      }
      if (example.pageMarkdownExcerpt !== null) {
        lines.push(`      pageExcerpt: ${quoteInline(compactText(example.pageMarkdownExcerpt, 900))}`);
      }
      if (!inlineCompact) lines.push(`      artifactRef: ${example.artifactRef}`);
    });
    if (inlineCompact && value.usageExamples.length > usageExamples.length) {
      lines.push(`  moreExamplesAvailable: ${value.usageExamples.length - usageExamples.length}`);
    }
  });
  return lines.join("\n");
}

function collectCanonicalValues(responses: readonly ModelVocabResponse[]): CanonicalValue[] {
  const byId = new Map<string, CanonicalValue>();
  for (const response of responses) {
    for (const canonical of response.canonicalValues) {
      if (!byId.has(canonical.canonicalId)) byId.set(canonical.canonicalId, canonical);
    }
  }
  return [...byId.values()].sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
}

function renderPriorCanonicalValuesToMarkdown(values: readonly CanonicalValue[]): string {
  if (values.length === 0) {
    return "No prior canonical values have been accepted for this key yet.";
  }
  const lines: string[] = [`priorCanonicalValues[count=${values.length}]:`];
  for (const canonical of values) {
    lines.push(`- id: ${canonical.canonicalId}`);
    lines.push(`  label: ${quoteInline(canonical.label)}`);
    lines.push(`  description: ${quoteInline(compactText(canonical.description, 260))}`);
    lines.push(`  measurementDimension: ${canonical.measurementDimension}`);
    lines.push(`  metricFamily: ${canonical.metricFamily}`);
    lines.push(`  mergePolicy: ${canonical.mergePolicy}`);
    if (canonical.countedEntityFamily !== undefined) lines.push(`  countedEntityFamily: ${canonical.countedEntityFamily}`);
    if (canonical.coarseGroup !== undefined) lines.push(`  coarseGroup: ${canonical.coarseGroup}`);
    if (canonical.semanticTags.length > 0) lines.push(`  semanticTags: ${canonical.semanticTags.join(", ")}`);
    if (canonical.positiveExamples.length > 0) {
      lines.push(`  positiveExamples: ${canonical.positiveExamples.slice(0, 5).map((item) => quoteInline(compactText(item, 120))).join(", ")}`);
    }
    if (canonical.negativeExamples.length > 0) {
      lines.push(`  negativeExamples: ${canonical.negativeExamples.slice(0, 5).map((item) => quoteInline(compactText(item, 120))).join(", ")}`);
    }
  }
  return lines.join("\n");
}

function renderPriorCanonicalIdIndex(values: readonly CanonicalValue[]): string {
  if (values.length === 0) return "No prior canonical values have been accepted for this key yet.";
  const lines: string[] = [`priorCanonicalIds[count=${values.length}]:`];
  for (const canonical of values.slice(0, 160)) {
    lines.push(
      `- ${canonical.canonicalId}: ${quoteInline(compactText(canonical.label, 80))}; ${canonical.measurementDimension}; ${canonical.metricFamily}; ${canonical.mergePolicy}`,
    );
  }
  if (values.length > 160) lines.push(`- ... ${values.length - 160} more prior canonical id(s) omitted`);
  return lines.join("\n");
}

function renderDeterministicHints(input: {
  chunk: VocabChunk;
  priorCanonicalValues: readonly CanonicalValue[];
}): string {
  const lines: string[] = [];
  const priorById = new Map(input.priorCanonicalValues.map((value) => [value.canonicalId, value]));
  const priorBySignature = new Map<string, CanonicalValue>();
  for (const canonical of input.priorCanonicalValues) {
    const idSignature = canonicalIdCandidate(canonical.canonicalId);
    const labelSignature = canonicalIdCandidate(canonical.label);
    if (idSignature.length > 0 && !priorBySignature.has(idSignature)) priorBySignature.set(idSignature, canonical);
    if (labelSignature.length > 0 && !priorBySignature.has(labelSignature)) priorBySignature.set(labelSignature, canonical);
  }

  const priorMatches: string[] = [];
  for (const value of input.chunk.values) {
    const signature = canonicalIdCandidate(value.rawValue);
    const prior = priorById.get(signature) ?? priorBySignature.get(signature);
    if (prior !== undefined) priorMatches.push(`${quoteInline(value.rawValue)} -> ${prior.canonicalId}`);
  }
  if (priorMatches.length > 0) {
    lines.push("priorIdMatches:");
    for (const match of priorMatches.slice(0, 40)) lines.push(`- ${match}`);
    if (priorMatches.length > 40) lines.push(`- ... ${priorMatches.length - 40} more`);
  }

  const signatureGroups = new Map<string, string[]>();
  for (const value of input.chunk.values) {
    const signature = canonicalIdCandidate(value.rawValue);
    if (signature.length === 0) continue;
    const group = signatureGroups.get(signature) ?? [];
    group.push(value.rawValue);
    signatureGroups.set(signature, group);
  }
  const sameSignatureGroups = [...signatureGroups.entries()]
    .filter(([, values]) => values.length > 1)
    .slice(0, 25);
  if (sameSignatureGroups.length > 0) {
    lines.push("sameSignatureGroups:");
    for (const [signature, values] of sameSignatureGroups) {
      lines.push(`- ${signature}: ${values.map((value) => quoteInline(value)).join(", ")}`);
    }
  }

  const compoundCandidates = input.chunk.values
    .filter((value) => /[;/]|,\s|\b(and|or)\b/i.test(value.rawValue))
    .map((value) => value.rawValue)
    .slice(0, 40);
  if (compoundCandidates.length > 0) {
    lines.push("compoundOrLossyCandidates:");
    for (const rawValue of compoundCandidates) {
      lines.push(`- ${quoteInline(rawValue)} -> consider preserve_raw unless one meaning dominates`);
    }
  }

  if (lines.length === 0) return "No deterministic suggestions for this chunk.";
  return [
    "Host-generated suggestions. Treat these as cheap hints, not automatic decisions.",
    ...lines,
  ].join("\n");
}

function taxonomyGuidance(keyId: string): string {
  const common = [
    "Each canonical value is a leaf plus a rollup layer.",
    "canonicalId should preserve meaning needed for evidence-backed claims.",
    "measurementDimension is the physical/logical measurement type.",
    "metricFamily is the downstream analysis family for briefs, findings, and detectors.",
    "countedEntityFamily is required when measurementDimension=count and the thing counted is knowable.",
    "semanticTags can add cross-cutting rollups but must be lowercase snake_case.",
    "mergePolicy=same_leaf_only means do not merge siblings, but downstream may group by metricFamily/tags.",
    "mergePolicy=family_rollup_allowed means same-family aliases can reasonably share this leaf.",
    "mergePolicy=preserve_raw_preferred means the value is phrase-like or compound and should rarely absorb aliases.",
  ];
  if (keyId !== "metricUnit") return common.map((line) => `- ${line}`).join("\n");
  return [
    ...common,
    "For metricUnit, do not force all count units into one 'count' canonicalId.",
    "For count units, countedEntityFamily should be as specific as the usage supports: transit_rider, transit_passenger, resident, survey_respondent, crash_event, injury_event, fatality_event, vehicle, bus_route, bus_stop, lane, parking_space, job, comment, etc. Avoid generic person unless the source truly only says people/persons.",
    "crashes, injuries, fatalities, and KSI are related safety outcomes; keep distinct leaves unless source usage is truly interchangeable, and group them with metricFamily=safety plus tags such as safety_outcome_count.",
    "riders and passengers may merge only when usage is transit ridership/passenger-count; people, persons, residents, and respondents are sibling person-count concepts, not automatic aliases.",
    "boardings is an event/count activity and should not automatically merge with riders/passengers.",
    "routes and bus routes can merge; stops and bus stops can merge when usage is stop count.",
    "compound values such as 'residents; jobs' or 'feet / acres / cars' should usually be preserve_raw with metricFamily=other or the dominant family only if clear.",
    "score, rank, rating_scale, and ordinal_score are score/rating families, not literal physical units.",
    "date, year, month_year, and year_range are temporal markers; preserve or map carefully by usage.",
  ].map((line) => `- ${line}`).join("\n");
}

async function userPrompt(input: {
  key: GraduationKey;
  chunk: VocabChunk;
  sourceAuditRoot?: string;
  priorCanonicalValues?: readonly CanonicalValue[];
}): Promise<string> {
  const values = await promptValues(input.chunk, { includePageMarkdownExcerpt: false });
  const priorCanonicalValues = input.priorCanonicalValues ?? [];
  return [
    "# Tier 2 Vocabulary Synthesis",
    "",
    "context_format: markdown/toon-style",
    `key: ${input.key.id}`,
    `targetPayloadPath: ${input.key.targetPayloadPath}`,
    `description: ${input.key.description}`,
    `chunk: ${input.chunk.chunkIndex}/${input.chunk.chunkCount}`,
    `sourceSearchRoot: ${input.sourceAuditRoot ?? "(not configured)"}`,
    "",
    "## Task",
    "",
    "Design the canonical taxonomy and alias decisions for this chunk.",
    "You are clustering already-extracted raw labels, not extracting new facts.",
    "Use the compact usage examples to decide whether labels are genuinely equivalent in the corpus.",
    "Do not call read_vocab_context unless the compact examples are insufficient for a specific ambiguous value.",
    "For ambiguous merges, inspect fuller source-linked examples with read_vocab_context before submitting.",
    "",
    "## Rules",
    "",
    "- Return exactly one alias decision for every raw value in this chunk.",
    "- Use mapped only when the raw value cleanly belongs to a canonical value.",
    "- Use preserve_raw for compound, highly specific, or lossy values.",
    "- Use unresolved when the value is unclear or likely extraction noise.",
    "- For metricUnit, canonical values should represent units only, not metric values or subjects.",
    "- Reuse a prior canonicalId when a raw value is equivalent to an already accepted canonical value.",
    "- When reusing a prior canonicalId in this chunk, include that canonical value object again in your submission.",
    "- Every canonical value must include measurementDimension, metricFamily, mergePolicy, semanticTags, and countedEntityFamily when it counts a known entity.",
    "- Never normalize route ids, dates, numeric values, geography ids, or evidence handles.",
    "- Call submit_tier2_vocab_map when ready. If it rejects your submission, fix the listed errors and call it again.",
    "- Avoid context-tool calls for ordinary aliases; the inline examples are the default evidence for this task.",
    "",
    "## Leaf Vs Family Guidance",
    "",
    taxonomyGuidance(input.key.id),
    "",
    "Allowed measurementDimension values:",
    MEASUREMENT_DIMENSIONS.join(", "),
    "",
    "Allowed metricFamily values:",
    METRIC_FAMILIES.join(", "),
    "",
    "Allowed mergePolicy values:",
    MERGE_POLICIES.join(", "),
    "",
    "## Tool Notes",
    "",
    "- read_vocab_context(rawValue) returns fuller source-linked usage for one input value, including handles/evidence and page excerpts on request.",
    "- search_source_text(query) searches configured MTA source text/PDF captures when source-level backing matters.",
    "",
    "## Prior Accepted Taxonomy",
    "",
    renderPriorCanonicalValuesToMarkdown(priorCanonicalValues),
    "",
    "## Input Values",
    "",
    renderPromptValuesToMarkdown(values, { detail: "inline_compact" }),
  ].join("\n");
}

async function userPromptV2(input: {
  key: GraduationKey;
  chunk: VocabChunk;
  sourceAuditRoot?: string;
  priorCanonicalValues?: readonly CanonicalValue[];
  maxContextToolCalls: number;
}): Promise<string> {
  const values = await promptValues(input.chunk, { includePageMarkdownExcerpt: false });
  const priorCanonicalValues = input.priorCanonicalValues ?? [];
  return [
    "# Tier 2 Vocabulary Synthesis V2",
    "",
    "context_format: markdown/toon-style",
    `key: ${input.key.id}`,
    `targetPayloadPath: ${input.key.targetPayloadPath}`,
    `description: ${input.key.description}`,
    `chunk: ${input.chunk.chunkIndex}/${input.chunk.chunkCount}`,
    `sourceSearchRoot: ${input.sourceAuditRoot ?? "(not configured)"}`,
    `contextToolBudget: ${input.maxContextToolCalls} calls`,
    "",
    "## Task",
    "",
    "Classify this raw-value chunk into canonical vocabulary aliases.",
    "Use the compact table and host suggestions first; most values should be decidable without tools.",
    "Only call context tools for a specific ambiguity that changes a mapped/preserve_raw/unresolved decision.",
    `When ready, submit compact decisions with ${V2_TOOL_NAME}.`,
    "",
    "## Compact Submit Shape",
    "",
    "- newCanonicalValues: only canonical definitions newly introduced by this chunk; use [] when all mapped IDs are prior IDs.",
    "- aliases: one item per rawValue with rawValue, decision, and canonicalId only for mapped aliases.",
    "- Omit canonicalId for preserve_raw and unresolved aliases.",
    "- If a prior canonicalId is right, reference it in the alias and do not copy its canonical object.",
    "",
    "## Available Context Tools",
    "",
    "- get_value_profiles(rawValues, includePageMarkdown?) returns fuller usage for up to 12 exact chunk values.",
    "- compare_values(rawValues) returns compact side-by-side profiles for a possible merge.",
    "- search_value_inventory(query) searches the full inventory for this key.",
    "- search_source_snippets(query, limit?) searches configured source captures.",
    "- read_source_excerpt(sourceId, query?, maxChars?) reads a bounded excerpt from one source.",
    "",
    "## Prior Canonical IDs",
    "",
    renderPriorCanonicalIdIndex(priorCanonicalValues),
    "",
    "## Deterministic Hints",
    "",
    renderDeterministicHints({ chunk: input.chunk, priorCanonicalValues }),
    "",
    "## Input Values",
    "",
    renderPromptValuesToMarkdown(values, { detail: "inline_compact" }),
  ].join("\n");
}

function parseModelResponse(raw: unknown): ModelVocabResponse {
  const record = isRecord(raw) ? raw : {};
  return {
    keyId: typeof record["keyId"] === "string" ? record["keyId"] : "",
    canonicalValues: Array.isArray(record["canonicalValues"])
      ? record["canonicalValues"].flatMap((value): CanonicalValue[] => {
          if (!isRecord(value)) return [];
          const canonicalId = typeof value["canonicalId"] === "string" ? value["canonicalId"] : "";
          const label = typeof value["label"] === "string" ? value["label"] : "";
          const description = typeof value["description"] === "string" ? value["description"] : "";
          const mergePolicy = value["mergePolicy"];
          return [{
            canonicalId,
            label,
            description,
            measurementDimension: typeof value["measurementDimension"] === "string" ? value["measurementDimension"] : "",
            metricFamily: typeof value["metricFamily"] === "string" ? value["metricFamily"] : "",
            mergePolicy: mergePolicy === "same_leaf_only" || mergePolicy === "family_rollup_allowed" || mergePolicy === "preserve_raw_preferred"
              ? mergePolicy
              : "same_leaf_only",
            ...(typeof value["countedEntityFamily"] === "string" ? { countedEntityFamily: value["countedEntityFamily"] } : {}),
            ...(typeof value["coarseGroup"] === "string" ? { coarseGroup: value["coarseGroup"] } : {}),
            semanticTags: Array.isArray(value["semanticTags"])
              ? value["semanticTags"].filter((item): item is string => typeof item === "string")
              : [],
            downstreamUses: Array.isArray(value["downstreamUses"])
              ? value["downstreamUses"].filter((item): item is string => typeof item === "string")
              : [],
            positiveExamples: Array.isArray(value["positiveExamples"])
              ? value["positiveExamples"].filter((item): item is string => typeof item === "string")
              : [],
            negativeExamples: Array.isArray(value["negativeExamples"])
              ? value["negativeExamples"].filter((item): item is string => typeof item === "string")
              : [],
          }];
        })
      : [],
    aliases: Array.isArray(record["aliases"])
      ? record["aliases"].flatMap((alias): ModelAlias[] => {
          if (!isRecord(alias)) return [];
          const decision = alias["decision"];
          if (decision !== "mapped" && decision !== "unresolved" && decision !== "preserve_raw") return [];
          return [{
            rawValue: typeof alias["rawValue"] === "string" ? alias["rawValue"] : "",
            normalizedRawValue: typeof alias["normalizedRawValue"] === "string" ? alias["normalizedRawValue"] : "",
            decision,
            ...(typeof alias["canonicalId"] === "string" ? { canonicalId: alias["canonicalId"] } : {}),
            confidence: typeof alias["confidence"] === "number" ? alias["confidence"] : -1,
            rationale: typeof alias["rationale"] === "string" ? alias["rationale"] : "",
            reviewFlags: Array.isArray(alias["reviewFlags"])
              ? alias["reviewFlags"].filter((item): item is string => typeof item === "string")
              : [],
          }];
        })
      : [],
    reviewNotes: Array.isArray(record["reviewNotes"])
      ? record["reviewNotes"].flatMap((note): ModelVocabResponse["reviewNotes"] => {
          if (!isRecord(note) || typeof note["note"] !== "string") return [];
          return [{
            note: note["note"],
            rawValues: Array.isArray(note["rawValues"])
              ? note["rawValues"].filter((item): item is string => typeof item === "string")
              : [],
          }];
        })
      : [],
  };
}

function expandCompactModelResponse(input: {
  raw: SubmitCompactVocabArgs;
  chunk: VocabChunk;
  priorCanonicalValues: readonly CanonicalValue[];
}): ModelVocabResponse {
  const rawRecord = input.raw as Record<string, unknown>;
  const parsedNew = parseModelResponse({
    keyId: input.raw.keyId,
    canonicalValues: rawRecord["newCanonicalValues"],
    aliases: [],
    reviewNotes: rawRecord["reviewNotes"],
  });
  const canonicalById = new Map<string, CanonicalValue>();
  for (const canonical of input.priorCanonicalValues) canonicalById.set(canonical.canonicalId, canonical);
  for (const canonical of parsedNew.canonicalValues) canonicalById.set(canonical.canonicalId, canonical);

  const chunkValueByRaw = new Map(input.chunk.values.map((value) => [value.rawValue, value]));
  const aliases = input.raw.aliases.flatMap((alias): ModelAlias[] => {
    const chunkValue = chunkValueByRaw.get(alias.rawValue);
    return [{
      rawValue: alias.rawValue,
      normalizedRawValue: chunkValue?.normalizedRawValue ?? normalizeRawValue(alias.rawValue),
      decision: alias.decision,
      ...(alias.canonicalId === undefined ? {} : { canonicalId: alias.canonicalId }),
      confidence: alias.confidence ?? -1,
      rationale: alias.rationale ?? "",
      reviewFlags: alias.reviewFlags ?? [],
    }];
  });

  return {
    keyId: input.raw.keyId,
    canonicalValues: [...canonicalById.values()].sort((left, right) => left.canonicalId.localeCompare(right.canonicalId)),
    aliases,
    reviewNotes: parsedNew.reviewNotes,
  };
}

async function existingPath(path: string | null | undefined): Promise<string | null> {
  if (path === null || path === undefined) return null;
  return (await Bun.file(path).exists()) ? path : null;
}

async function reusableAcceptedChunk(input: {
  generatedAt: string;
  key: GraduationKey;
  chunk: VocabChunk;
  previousResult?: Tier2VocabSynthesisRun["chunkResults"][number] | undefined;
}): Promise<{
  response: ModelVocabResponse;
  result: Tier2VocabSynthesisRun["chunkResults"][number];
} | null> {
  const chunkDir = dirname(input.chunk.chunkPath);
  const toolCallPath = input.previousResult?.toolCallPath ?? join(chunkDir, "tool-call.json");
  if (!(await Bun.file(toolCallPath).exists())) return null;
  const response = parseModelResponse(await Bun.file(toolCallPath).json());
  const validation = validateVocabToolCall({
    keyId: input.key.id,
    chunk: input.chunk,
    response,
    generatedAt: input.generatedAt,
  });
  if (validation.status !== "accepted") return null;
  const validationPath = input.previousResult?.validationPath ?? join(chunkDir, "validation.json");
  await writeJson(validationPath, validation);
  const promptPath = input.previousResult?.promptPath ?? join(chunkDir, "provided-prompt.md");
  const requestPath = input.previousResult?.requestPath ?? join(chunkDir, "request.json");
  const responsePath = input.previousResult?.responsePath ?? join(chunkDir, "response.json");
  const toolLoopPath = input.previousResult?.toolLoopPath ?? join(chunkDir, "tool-loop-result.json");
  const sessionPath = input.previousResult?.sessionPath ?? null;
  const executionMode = input.previousResult?.executionMode ??
    ((await Bun.file(toolLoopPath).exists()) ? "agentic_tool_loop" : "direct_tool_call");
  return {
    response,
    result: {
      chunkId: input.chunk.chunkId,
      promptPath: await existingPath(promptPath),
      executionMode,
      requestPath: await existingPath(requestPath),
      responsePath: await existingPath(responsePath),
      toolCallPath,
      validationPath,
      toolLoopPath: await existingPath(toolLoopPath),
      sessionPath: await existingPath(sessionPath),
      status: "accepted",
      errorPath: null,
    },
  };
}

export function validateVocabToolCall(input: {
  keyId: string;
  chunk: VocabChunk;
  response: ModelVocabResponse;
  generatedAt?: string;
}): ChunkValidation {
  const blockers: ChunkValidation["blockers"] = [];
  const inputByRawValue = new Map(input.chunk.values.map((value) => [value.rawValue, value]));
  const aliasCounts = countBy(input.response.aliases.map((alias) => alias.rawValue));
  const canonicalIds = new Set(input.response.canonicalValues.map((value) => value.canonicalId));
  if (input.response.keyId !== input.keyId) {
    blockers.push({ code: "key_id_mismatch", message: `Expected ${input.keyId}, got ${input.response.keyId}.` });
  }
  for (const canonical of input.response.canonicalValues) {
    if (!/^[a-z][a-z0-9_]*$/.test(canonical.canonicalId)) {
      blockers.push({
        code: "invalid_canonical_id",
        message: `Canonical id must be lowercase snake_case: ${canonical.canonicalId}`,
      });
    }
    if (!MEASUREMENT_DIMENSION_SET.has(canonical.measurementDimension)) {
      blockers.push({
        code: "invalid_measurement_dimension",
        message: `Canonical value ${canonical.canonicalId} has invalid measurementDimension: ${canonical.measurementDimension}`,
      });
    }
    if (!METRIC_FAMILY_SET.has(canonical.metricFamily)) {
      blockers.push({
        code: "invalid_metric_family",
        message: `Canonical value ${canonical.canonicalId} has invalid metricFamily: ${canonical.metricFamily}`,
      });
    }
    if (!MERGE_POLICY_SET.has(canonical.mergePolicy)) {
      blockers.push({
        code: "invalid_merge_policy",
        message: `Canonical value ${canonical.canonicalId} has invalid mergePolicy: ${canonical.mergePolicy}`,
      });
    }
    if (canonical.countedEntityFamily !== undefined && !/^[a-z][a-z0-9_]*$/.test(canonical.countedEntityFamily)) {
      blockers.push({
        code: "invalid_counted_entity_family",
        message: `countedEntityFamily must be lowercase snake_case: ${canonical.countedEntityFamily}`,
      });
    }
    if (canonical.measurementDimension === "count" && canonical.countedEntityFamily === undefined) {
      blockers.push({
        code: "missing_counted_entity_family",
        message: `Canonical value ${canonical.canonicalId} has measurementDimension=count and needs countedEntityFamily.`,
      });
    }
    for (const tag of canonical.semanticTags) {
      if (!/^[a-z][a-z0-9_]*$/.test(tag)) {
        blockers.push({
          code: "invalid_semantic_tag",
          message: `semanticTags must be lowercase snake_case: ${tag}`,
        });
      }
    }
    if (canonical.semanticTags.length === 0) {
      blockers.push({
        code: "missing_semantic_tags",
        message: `Canonical value ${canonical.canonicalId} needs at least one semanticTag.`,
      });
    }
    if (canonical.label.trim().length === 0 || canonical.description.trim().length === 0) {
      blockers.push({
        code: "empty_canonical_value_text",
        message: `Canonical value ${canonical.canonicalId} is missing label or description.`,
      });
    }
  }
  if (canonicalIds.size !== input.response.canonicalValues.length) {
    blockers.push({ code: "duplicate_canonical_id", message: "Canonical ids must be unique." });
  }
  for (const value of input.chunk.values) {
    const count = aliasCounts[value.rawValue] ?? 0;
    if (count === 0) {
      blockers.push({ code: "missing_alias", message: "Every input raw value needs one alias decision.", rawValue: value.rawValue });
    } else if (count > 1) {
      blockers.push({ code: "duplicate_alias", message: "Input raw value appeared more than once.", rawValue: value.rawValue });
    }
  }
  for (const alias of input.response.aliases) {
    const source = inputByRawValue.get(alias.rawValue);
    if (source === undefined) {
      blockers.push({ code: "extra_alias", message: "Alias rawValue was not in the input chunk.", rawValue: alias.rawValue });
      continue;
    }
    if (alias.normalizedRawValue !== source.normalizedRawValue) {
      blockers.push({
        code: "normalized_raw_value_mismatch",
        message: `Expected normalizedRawValue ${source.normalizedRawValue}, got ${alias.normalizedRawValue}.`,
        rawValue: alias.rawValue,
      });
    }
    if (alias.confidence < 0 || alias.confidence > 1) {
      blockers.push({ code: "invalid_confidence", message: "Confidence must be between 0 and 1.", rawValue: alias.rawValue });
    }
    if (alias.rationale.trim().length === 0) {
      blockers.push({ code: "empty_rationale", message: "Alias needs a rationale.", rawValue: alias.rawValue });
    }
    if (alias.decision === "mapped") {
      if (alias.canonicalId === undefined || !canonicalIds.has(alias.canonicalId)) {
        blockers.push({
          code: "unknown_canonical_id",
          message: `Mapped alias references an unknown canonicalId: ${alias.canonicalId ?? "(missing)"}.`,
          rawValue: alias.rawValue,
        });
      }
    } else if (alias.canonicalId !== undefined) {
      blockers.push({
        code: "non_mapped_alias_has_canonical_id",
        message: "Only mapped aliases may carry canonicalId.",
        rawValue: alias.rawValue,
      });
    }
  }
  const decisions = input.response.aliases.map((alias) => alias.decision);
  return {
    artifactKind: "bp.tier2_vocab_chunk_validation.v1",
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    chunkId: input.chunk.chunkId,
    keyId: input.keyId,
    status: blockers.length === 0 ? "accepted" : "rejected",
    blockerCount: blockers.length,
    blockers,
    summary: {
      inputValueCount: input.chunk.values.length,
      aliasCount: input.response.aliases.length,
      canonicalValueCount: input.response.canonicalValues.length,
      mappedCount: decisions.filter((decision) => decision === "mapped").length,
      unresolvedCount: decisions.filter((decision) => decision === "unresolved").length,
      preserveRawCount: decisions.filter((decision) => decision === "preserve_raw").length,
    },
  };
}

const readVocabContextParams = Type.Object(
  {
    rawValue: Type.String({
      minLength: 1,
      description: "Exact rawValue from the input chunk to inspect.",
    }),
    includePageMarkdown: Type.Optional(Type.Boolean({
      description: "When true, include OCR/page markdown excerpts around this value's examples.",
    })),
  },
  { additionalProperties: false },
);

const searchSourceTextParams = Type.Object(
  {
    query: Type.String({
      minLength: 1,
      maxLength: 120,
      description: "Plain text query to search in configured MTA source captures.",
    }),
    limit: Type.Optional(Type.Integer({
      minimum: 1,
      maximum: 10,
      description: "Maximum matching source snippets to return. Default 5.",
    })),
  },
  { additionalProperties: false },
);

const getValueProfilesParams = Type.Object(
  {
    rawValues: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 12 }),
    includePageMarkdown: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const compareValuesParams = Type.Object(
  {
    rawValues: Type.Array(Type.String({ minLength: 1 }), { minItems: 2, maxItems: 12 }),
  },
  { additionalProperties: false },
);

const searchValueInventoryParams = Type.Object(
  {
    query: Type.String({ minLength: 1, maxLength: 120 }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
  },
  { additionalProperties: false },
);

const readSourceExcerptParams = Type.Object(
  {
    sourceId: Type.String({ minLength: 1 }),
    query: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    maxChars: Type.Optional(Type.Integer({ minimum: 200, maximum: 2000 })),
  },
  { additionalProperties: false },
);

const submitVocabMapParams = Type.Object(
  {
    keyId: Type.String(),
    canonicalValues: Type.Array(
      Type.Object(
        {
          canonicalId: Type.String(),
          label: Type.String(),
          description: Type.String(),
          measurementDimension: Type.Union(MEASUREMENT_DIMENSIONS.map((item) => Type.Literal(item)) as [
            ReturnType<typeof Type.Literal>,
            ReturnType<typeof Type.Literal>,
            ...ReturnType<typeof Type.Literal>[],
          ]),
          metricFamily: Type.Union(METRIC_FAMILIES.map((item) => Type.Literal(item)) as [
            ReturnType<typeof Type.Literal>,
            ReturnType<typeof Type.Literal>,
            ...ReturnType<typeof Type.Literal>[],
          ]),
          mergePolicy: Type.Union(MERGE_POLICIES.map((item) => Type.Literal(item)) as [
            ReturnType<typeof Type.Literal>,
            ReturnType<typeof Type.Literal>,
            ...ReturnType<typeof Type.Literal>[],
          ]),
          countedEntityFamily: Type.Optional(Type.String()),
          coarseGroup: Type.Optional(Type.String()),
          semanticTags: Type.Array(Type.String()),
          downstreamUses: Type.Array(Type.String()),
          positiveExamples: Type.Array(Type.String()),
          negativeExamples: Type.Array(Type.String()),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 80 },
    ),
    aliases: Type.Array(
      Type.Object(
        {
          rawValue: Type.String(),
          normalizedRawValue: Type.String(),
          decision: Type.Union([
            Type.Literal("mapped"),
            Type.Literal("unresolved"),
            Type.Literal("preserve_raw"),
          ]),
          canonicalId: Type.Optional(Type.String()),
          confidence: Type.Number({ minimum: 0, maximum: 1 }),
          rationale: Type.String(),
          reviewFlags: Type.Array(Type.String()),
        },
        { additionalProperties: false },
      ),
      { minItems: 1 },
    ),
    reviewNotes: Type.Array(
      Type.Object(
        {
          note: Type.String(),
          rawValues: Type.Array(Type.String()),
        },
        { additionalProperties: false },
      ),
      { maxItems: 20 },
    ),
  },
  { additionalProperties: false },
);

const submitCompactVocabParams = Type.Object(
  {
    keyId: Type.String(),
    newCanonicalValues: Type.Array(
      Type.Object(
        {
          canonicalId: Type.String(),
          label: Type.String(),
          description: Type.String(),
          measurementDimension: Type.Union(MEASUREMENT_DIMENSIONS.map((item) => Type.Literal(item)) as [
            ReturnType<typeof Type.Literal>,
            ReturnType<typeof Type.Literal>,
            ...ReturnType<typeof Type.Literal>[],
          ]),
          metricFamily: Type.Union(METRIC_FAMILIES.map((item) => Type.Literal(item)) as [
            ReturnType<typeof Type.Literal>,
            ReturnType<typeof Type.Literal>,
            ...ReturnType<typeof Type.Literal>[],
          ]),
          mergePolicy: Type.Union(MERGE_POLICIES.map((item) => Type.Literal(item)) as [
            ReturnType<typeof Type.Literal>,
            ReturnType<typeof Type.Literal>,
            ...ReturnType<typeof Type.Literal>[],
          ]),
          countedEntityFamily: Type.Optional(Type.String()),
          coarseGroup: Type.Optional(Type.String()),
          semanticTags: Type.Array(Type.String()),
          downstreamUses: Type.Array(Type.String()),
          positiveExamples: Type.Array(Type.String()),
          negativeExamples: Type.Array(Type.String()),
        },
        { additionalProperties: false },
      ),
      { maxItems: 80 },
    ),
    aliases: Type.Array(
      Type.Object(
        {
          rawValue: Type.String(),
          decision: Type.Union([
            Type.Literal("mapped"),
            Type.Literal("unresolved"),
            Type.Literal("preserve_raw"),
          ]),
          canonicalId: Type.Optional(Type.String()),
          confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
          rationale: Type.Optional(Type.String()),
          reviewFlags: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: false },
      ),
      { minItems: 1 },
    ),
    reviewNotes: Type.Array(
      Type.Object(
        {
          note: Type.String(),
          rawValues: Type.Array(Type.String()),
        },
        { additionalProperties: false },
      ),
      { maxItems: 20 },
    ),
  },
  { additionalProperties: false },
);

type ReadVocabContextArgs = Static<typeof readVocabContextParams>;
type SearchSourceTextArgs = Static<typeof searchSourceTextParams>;
type GetValueProfilesArgs = Static<typeof getValueProfilesParams>;
type CompareValuesArgs = Static<typeof compareValuesParams>;
type SearchValueInventoryArgs = Static<typeof searchValueInventoryParams>;
type ReadSourceExcerptArgs = Static<typeof readSourceExcerptParams>;
type SubmitVocabMapArgs = Static<typeof submitVocabMapParams>;
type SubmitCompactVocabArgs = Static<typeof submitCompactVocabParams>;

type VocabSubmitResultDetails = CodemodeTerminationSignal & {
  outcome: "accepted" | "rejected";
  attempt: number;
  blockerCount: number;
};

type VocabSubmitStore = {
  attempts: number;
  acceptedResponse: ModelVocabResponse | null;
  lastValidation: ChunkValidation | null;
};

type V2ToolBudget = {
  contextCalls: number;
  maxContextCalls: number;
};

function toolText(text: string): AgentToolResult<null> {
  return {
    content: [{ type: "text", text }],
    details: null,
  };
}

function formatValidationFeedback(validation: ChunkValidation, toolName = TOOL_NAME): string {
  if (validation.status === "accepted") {
    return [
      "Submission accepted.",
      `aliases=${validation.summary.aliasCount}`,
      `canonicalValues=${validation.summary.canonicalValueCount}`,
      `mapped=${validation.summary.mappedCount}`,
      `preserveRaw=${validation.summary.preserveRawCount}`,
      `unresolved=${validation.summary.unresolvedCount}`,
    ].join(" ");
  }
  const lines = [
    `Submission rejected with ${validation.blockerCount} blocker(s).`,
    `Fix the errors and call ${toolName} again.`,
    "",
  ];
  for (const blocker of validation.blockers.slice(0, 60)) {
    lines.push(`- ${blocker.code}${blocker.rawValue === undefined ? "" : ` (${blocker.rawValue})`}: ${blocker.message}`);
  }
  if (validation.blockers.length > 60) {
    lines.push(`- ... ${validation.blockers.length - 60} more blocker(s) omitted`);
  }
  return lines.join("\n");
}

function buildReadVocabContextTool(chunk: VocabChunk): AgentTool<typeof readVocabContextParams, null> {
  return {
    name: "read_vocab_context",
    label: "Read vocab context",
    description:
      "Read fuller usage context for one exact rawValue from this chunk. Use this before merging ambiguous labels whose meaning depends on source usage.",
    parameters: readVocabContextParams,
    execute: async (_toolCallId, args: ReadVocabContextArgs): Promise<AgentToolResult<null>> => {
      const value = chunk.values.find((candidate) => candidate.rawValue === args.rawValue);
      if (value === undefined) {
        return toolText(`rawValue not found in this chunk: ${args.rawValue}`);
      }
      const context = await promptValues({
        ...chunk,
        values: [value],
      }, { includePageMarkdownExcerpt: args.includePageMarkdown === true });
      return toolText(renderPromptValuesToMarkdown(context, { detail: "tool_full" }));
    },
  };
}

function buildSearchSourceTextTool(sourceRoot: string | undefined): AgentTool<typeof searchSourceTextParams, null> {
  const textCache = new Map<string, string | null>();
  return {
    name: "search_source_text",
    label: "Search source text",
    description:
      "Search configured MTA source captures and PDFs for a term. Returns source IDs, paths, and snippets. Use for source-level vocabulary checks.",
    parameters: searchSourceTextParams,
    execute: async (_toolCallId, args: SearchSourceTextArgs): Promise<AgentToolResult<null>> => {
      if (sourceRoot === undefined) {
        return toolText("No sourceAuditRoot/sourceSearchRoot was configured for this run.");
      }
      const root = fromCliPath(sourceRoot);
      const query = args.query.trim();
      const limit = args.limit ?? 5;
      const matches: Array<{ sourceId: string; path: string; snippet: string }> = [];
      for (const source of await sourceFiles(root)) {
        let text = textCache.get(source.path);
        if (text === undefined) {
          text = await readSourceText(source.path);
          textCache.set(source.path, text);
        }
        if (text === null || !looseContains(text, [query])) continue;
        matches.push({
          sourceId: source.sourceId,
          path: source.path,
          snippet: snippetFor(text, query),
        });
        if (matches.length >= limit) break;
      }
      if (matches.length === 0) {
        return toolText(`No MTA source matches for query: ${query}`);
      }
      const lines = [`matches[count=${matches.length}]:`];
      for (const match of matches) {
        lines.push(`- sourceId: ${match.sourceId}`);
        lines.push(`  path: ${match.path}`);
        lines.push(`  snippet: ${quoteInline(match.snippet)}`);
      }
      return toolText(lines.join("\n"));
    },
  };
}

function useV2ContextBudget(budget: V2ToolBudget, toolName: string): string | null {
  if (budget.contextCalls >= budget.maxContextCalls) {
    return `${toolName} context budget exhausted (${budget.contextCalls}/${budget.maxContextCalls}). Submit with preserve_raw or unresolved for remaining ambiguity.`;
  }
  budget.contextCalls += 1;
  return null;
}

function budgetFooter(budget: V2ToolBudget): string {
  return `contextBudget: ${budget.contextCalls}/${budget.maxContextCalls} calls used`;
}

function chunkWithRawValues(chunk: VocabChunk, rawValues: readonly string[]): {
  selected: VocabChunk;
  missing: string[];
} {
  const byRaw = new Map(chunk.values.map((value) => [value.rawValue, value]));
  const seen = new Set<string>();
  const values: VocabInputValue[] = [];
  const missing: string[] = [];
  for (const rawValue of rawValues) {
    if (seen.has(rawValue)) continue;
    seen.add(rawValue);
    const value = byRaw.get(rawValue);
    if (value === undefined) missing.push(rawValue);
    else values.push(value);
  }
  return { selected: { ...chunk, values, valueCount: values.length }, missing };
}

function renderMissingRawValues(missing: readonly string[]): string[] {
  return missing.length === 0
    ? []
    : [`missingRawValues: ${missing.map((value) => quoteInline(value)).join(", ")}`];
}

function buildGetValueProfilesTool(
  chunk: VocabChunk,
  budget: V2ToolBudget,
): AgentTool<typeof getValueProfilesParams, null> {
  return {
    name: "get_value_profiles",
    label: "Get value profiles",
    description:
      "Read fuller source-linked usage for up to 12 exact rawValues from this chunk. Use only when compact examples are insufficient.",
    parameters: getValueProfilesParams,
    execute: async (_toolCallId, args: GetValueProfilesArgs): Promise<AgentToolResult<null>> => {
      const exhausted = useV2ContextBudget(budget, "get_value_profiles");
      if (exhausted !== null) return toolText(exhausted);
      const { selected, missing } = chunkWithRawValues(chunk, args.rawValues.slice(0, 12));
      if (selected.values.length === 0) {
        return toolText(["No requested rawValues were found in this chunk.", ...renderMissingRawValues(missing), budgetFooter(budget)].join("\n"));
      }
      const context = await promptValues(selected, { includePageMarkdownExcerpt: args.includePageMarkdown === true });
      return toolText([
        renderPromptValuesToMarkdown(context, { detail: "tool_full" }),
        ...renderMissingRawValues(missing),
        budgetFooter(budget),
      ].join("\n"));
    },
  };
}

function buildCompareValuesTool(
  chunk: VocabChunk,
  budget: V2ToolBudget,
): AgentTool<typeof compareValuesParams, null> {
  return {
    name: "compare_values",
    label: "Compare values",
    description:
      "Compare compact profiles for 2 to 12 exact rawValues from this chunk side by side.",
    parameters: compareValuesParams,
    execute: async (_toolCallId, args: CompareValuesArgs): Promise<AgentToolResult<null>> => {
      const exhausted = useV2ContextBudget(budget, "compare_values");
      if (exhausted !== null) return toolText(exhausted);
      const { selected, missing } = chunkWithRawValues(chunk, args.rawValues.slice(0, 12));
      if (selected.values.length === 0) {
        return toolText(["No requested rawValues were found in this chunk.", ...renderMissingRawValues(missing), budgetFooter(budget)].join("\n"));
      }
      const context = await promptValues(selected, { includePageMarkdownExcerpt: false });
      return toolText([
        renderPromptValuesToMarkdown(context, { detail: "inline_compact" }),
        ...renderMissingRawValues(missing),
        budgetFooter(budget),
      ].join("\n"));
    },
  };
}

function buildSearchValueInventoryTool(key: GraduationKey): AgentTool<typeof searchValueInventoryParams, null> {
  return {
    name: "search_value_inventory",
    label: "Search value inventory",
    description: "Search this key's full raw-value inventory outside the current chunk.",
    parameters: searchValueInventoryParams,
    execute: async (_toolCallId, args: SearchValueInventoryArgs): Promise<AgentToolResult<null>> => {
      const query = normalizeRawValue(args.query);
      const querySignature = canonicalIdCandidate(args.query);
      const matches = key.topValues.filter((value) => {
        const normalized = normalizeRawValue(value.value);
        const signature = canonicalIdCandidate(value.value);
        return normalized.includes(query) ||
          query.includes(normalized) ||
          signature.includes(querySignature) ||
          querySignature.includes(signature);
      }).slice(0, args.limit ?? 10);
      if (matches.length === 0) return toolText(`No inventory matches for query: ${args.query}`);
      const lines = [`inventoryMatches[count=${matches.length}]:`];
      for (const match of matches) {
        lines.push(`- raw: ${quoteInline(match.value)}`);
        lines.push(`  normalized: ${quoteInline(normalizeRawValue(match.value))}`);
        lines.push(`  count: ${match.count}`);
        lines.push(`  fields: ${formatCountMap(match.sourceFieldCounts)}`);
        lines.push(`  surfaceKinds: ${formatCountMap(match.surfaceKindCounts)}`);
      }
      return toolText(lines.join("\n"));
    },
  };
}

function buildSearchSourceSnippetsTool(
  sourceRoot: string | undefined,
  budget: V2ToolBudget,
): AgentTool<typeof searchSourceTextParams, null> {
  const textCache = new Map<string, string | null>();
  return {
    name: "search_source_snippets",
    label: "Search source snippets",
    description: "Search configured MTA source captures and PDFs for bounded snippets.",
    parameters: searchSourceTextParams,
    execute: async (_toolCallId, args: SearchSourceTextArgs): Promise<AgentToolResult<null>> => {
      const exhausted = useV2ContextBudget(budget, "search_source_snippets");
      if (exhausted !== null) return toolText(exhausted);
      if (sourceRoot === undefined) return toolText(["No sourceAuditRoot/sourceSearchRoot was configured.", budgetFooter(budget)].join("\n"));
      const query = args.query.trim();
      const matches: Array<{ sourceId: string; path: string; snippet: string }> = [];
      for (const source of await sourceFiles(fromCliPath(sourceRoot))) {
        let text = textCache.get(source.path);
        if (text === undefined) {
          text = await readSourceText(source.path);
          textCache.set(source.path, text);
        }
        if (text === null || !looseContains(text, [query])) continue;
        matches.push({ sourceId: source.sourceId, path: source.path, snippet: snippetFor(text, query) });
        if (matches.length >= (args.limit ?? 5)) break;
      }
      if (matches.length === 0) return toolText([`No MTA source matches for query: ${query}`, budgetFooter(budget)].join("\n"));
      const lines = [`matches[count=${matches.length}]:`];
      for (const match of matches) {
        lines.push(`- sourceId: ${match.sourceId}`);
        lines.push(`  path: ${match.path}`);
        lines.push(`  snippet: ${quoteInline(match.snippet)}`);
      }
      lines.push(budgetFooter(budget));
      return toolText(lines.join("\n"));
    },
  };
}

function buildReadSourceExcerptTool(
  sourceRoot: string | undefined,
  budget: V2ToolBudget,
): AgentTool<typeof readSourceExcerptParams, null> {
  return {
    name: "read_source_excerpt",
    label: "Read source excerpt",
    description: "Read a bounded excerpt from one sourceId returned by search_source_snippets.",
    parameters: readSourceExcerptParams,
    execute: async (_toolCallId, args: ReadSourceExcerptArgs): Promise<AgentToolResult<null>> => {
      const exhausted = useV2ContextBudget(budget, "read_source_excerpt");
      if (exhausted !== null) return toolText(exhausted);
      if (sourceRoot === undefined) return toolText(["No sourceAuditRoot/sourceSearchRoot was configured.", budgetFooter(budget)].join("\n"));
      const source = (await sourceFiles(fromCliPath(sourceRoot))).find((candidate) => candidate.sourceId === args.sourceId);
      if (source === undefined) return toolText([`sourceId not found: ${args.sourceId}`, budgetFooter(budget)].join("\n"));
      const text = await readSourceText(source.path);
      if (text === null || text.trim().length === 0) return toolText([`No readable text for sourceId: ${args.sourceId}`, budgetFooter(budget)].join("\n"));
      const maxChars = args.maxChars ?? 900;
      const excerpt = args.query === undefined
        ? compactText(text, maxChars)
        : excerptAroundNeedles(text, [args.query], maxChars) ?? compactText(text, maxChars);
      return toolText([
        `sourceId: ${source.sourceId}`,
        `path: ${source.path}`,
        `excerpt: ${quoteInline(excerpt)}`,
        budgetFooter(budget),
      ].join("\n"));
    },
  };
}

function buildSubmitVocabMapTool(input: {
  key: GraduationKey;
  chunk: VocabChunk;
  generatedAt: string;
  store: VocabSubmitStore;
  toolCallPath: string;
  validationPath: string;
}): AgentTool<typeof submitVocabMapParams, VocabSubmitResultDetails> {
  return {
    name: TOOL_NAME,
    label: "Submit vocab map",
    description:
      "Submit the canonical taxonomy and exact alias decisions for validation. If rejected, fix the returned blockers and submit again. A fully accepted submission ends the loop.",
    parameters: submitVocabMapParams,
    execute: async (_toolCallId, args: SubmitVocabMapArgs): Promise<AgentToolResult<VocabSubmitResultDetails>> => {
      input.store.attempts += 1;
      const parsed = parseModelResponse(args);
      const attemptSuffix = `attempt-${String(input.store.attempts).padStart(2, "0")}`;
      const attemptToolCallPath = input.toolCallPath.replace(/\.json$/, `-${attemptSuffix}.json`);
      const attemptValidationPath = input.validationPath.replace(/\.json$/, `-${attemptSuffix}.json`);
      const validation = validateVocabToolCall({
        keyId: input.key.id,
        chunk: input.chunk,
        response: parsed,
        generatedAt: input.generatedAt,
      });
      input.store.lastValidation = validation;
      await writeJson(attemptToolCallPath, parsed);
      await writeJson(attemptValidationPath, validation);
      await writeJson(input.toolCallPath, parsed);
      await writeJson(input.validationPath, validation);
      const accepted = validation.status === "accepted";
      if (accepted) input.store.acceptedResponse = parsed;
      return {
        content: [{ type: "text", text: formatValidationFeedback(validation) }],
        details: {
          terminateLoop: accepted,
          outcome: accepted ? "accepted" : "rejected",
          attempt: input.store.attempts,
          blockerCount: validation.blockerCount,
        },
      };
    },
  };
}

function buildSubmitCompactVocabTool(input: {
  key: GraduationKey;
  chunk: VocabChunk;
  priorCanonicalValues: readonly CanonicalValue[];
  generatedAt: string;
  store: VocabSubmitStore;
  toolCallPath: string;
  validationPath: string;
}): AgentTool<typeof submitCompactVocabParams, VocabSubmitResultDetails> {
  return {
    name: V2_TOOL_NAME,
    label: "Submit vocab decisions",
    description:
      "Submit compact alias decisions plus only newly introduced canonical values. Prior canonicalIds may be referenced without re-sending their full objects.",
    parameters: submitCompactVocabParams,
    execute: async (_toolCallId, args: SubmitCompactVocabArgs): Promise<AgentToolResult<VocabSubmitResultDetails>> => {
      input.store.attempts += 1;
      const parsed = expandCompactModelResponse({
        raw: args,
        chunk: input.chunk,
        priorCanonicalValues: input.priorCanonicalValues,
      });
      const attemptSuffix = `attempt-${String(input.store.attempts).padStart(2, "0")}`;
      const attemptToolCallPath = input.toolCallPath.replace(/\.json$/, `-${attemptSuffix}.json`);
      const attemptValidationPath = input.validationPath.replace(/\.json$/, `-${attemptSuffix}.json`);
      const validation = validateVocabToolCall({
        keyId: input.key.id,
        chunk: input.chunk,
        response: parsed,
        generatedAt: input.generatedAt,
      });
      input.store.lastValidation = validation;
      await writeJson(attemptToolCallPath, parsed);
      await writeJson(attemptValidationPath, validation);
      await writeJson(input.toolCallPath, parsed);
      await writeJson(input.validationPath, validation);
      const accepted = validation.status === "accepted";
      if (accepted) input.store.acceptedResponse = parsed;
      return {
        content: [{ type: "text", text: formatValidationFeedback(validation, V2_TOOL_NAME) }],
        details: {
          terminateLoop: accepted,
          outcome: accepted ? "accepted" : "rejected",
          attempt: input.store.attempts,
          blockerCount: validation.blockerCount,
        },
      };
    },
  };
}

function enrichAliases(input: {
  chunks: VocabChunk[];
  responses: ModelVocabResponse[];
}): EnrichedAlias[] {
  const valueByRaw = new Map(input.chunks.flatMap((chunk) => chunk.values.map((value) => [value.rawValue, value] as const)));
  return input.responses.flatMap((response) =>
    response.aliases.map((alias) => {
      const value = valueByRaw.get(alias.rawValue);
      if (value === undefined) throw new Error(`Cannot enrich unknown alias: ${alias.rawValue}`);
      return {
        ...alias,
        inputCount: value.inputCount,
        sourceFieldCounts: value.sourceFieldCounts,
        surfaceKindCounts: value.surfaceKindCounts,
        examples: value.examples,
      };
    }),
  );
}

function buildVocabMap(input: {
  generatedAt: string;
  sourceGraduationPlanPath: string;
  key: GraduationKey;
  responses: ModelVocabResponse[];
  chunks: VocabChunk[];
  model: string | null;
  temperature: number | null;
}): VocabMapArtifact {
  const canonicalById = new Map<string, CanonicalValue>();
  const reviewNotes: ModelVocabResponse["reviewNotes"] = [];
  for (const response of input.responses) {
    for (const canonical of response.canonicalValues) {
      if (!canonicalById.has(canonical.canonicalId)) canonicalById.set(canonical.canonicalId, canonical);
    }
    reviewNotes.push(...response.reviewNotes);
  }
  const aliases = enrichAliases({ chunks: input.chunks, responses: input.responses })
    .sort((left, right) => right.inputCount - left.inputCount || left.rawValue.localeCompare(right.rawValue));
  const decisions = aliases.map((alias) => alias.decision);
  return {
    artifactKind: VOCAB_MAP_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    promptVersion: PROMPT_VERSION,
    sourceGraduationPlanPath: input.sourceGraduationPlanPath,
    keyId: input.key.id,
    targetPayloadPath: input.key.targetPayloadPath,
    model: input.model,
    temperature: input.temperature,
    summary: {
      inputValueCount: aliases.length,
      canonicalValueCount: canonicalById.size,
      aliasCount: aliases.length,
      mappedCount: decisions.filter((decision) => decision === "mapped").length,
      unresolvedCount: decisions.filter((decision) => decision === "unresolved").length,
      preserveRawCount: decisions.filter((decision) => decision === "preserve_raw").length,
      instanceCoverageCount: aliases.reduce((sum, alias) => sum + alias.inputCount, 0),
    },
    canonicalValues: [...canonicalById.values()].sort((left, right) => left.canonicalId.localeCompare(right.canonicalId)),
    aliases,
    reviewNotes,
  };
}

function renderMarkdown(input: {
  run: Tier2VocabSynthesisRun;
  vocabMap: VocabMapArtifact | null;
  sourceAudit: SourceAudit | null;
}): string {
  const lines: string[] = [];
  lines.push("# Tier 2 Vocab Synthesis");
  lines.push("");
  lines.push(`Generated: ${input.run.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Harness: ${input.run.harness}`);
  lines.push(`- Keys: ${input.run.summary.keyCount}`);
  lines.push(`- Chunks: ${input.run.summary.chunkCount}`);
  lines.push(`- Input values: ${input.run.summary.inputValueCount}`);
  lines.push(`- Executed chunks: ${input.run.summary.executedChunkCount}`);
  lines.push(`- Accepted chunks: ${input.run.summary.acceptedChunkCount}`);
  lines.push(`- Rejected chunks: ${input.run.summary.rejectedChunkCount}`);
  lines.push("");
  if (input.vocabMap !== null) {
    lines.push("## Vocab Map");
    lines.push("");
    lines.push(`- Key: ${input.vocabMap.keyId}`);
    lines.push(`- Canonical values: ${input.vocabMap.summary.canonicalValueCount}`);
    lines.push(`- Aliases: ${input.vocabMap.summary.aliasCount}`);
    lines.push(`- Mapped: ${input.vocabMap.summary.mappedCount}`);
    lines.push(`- Preserve raw: ${input.vocabMap.summary.preserveRawCount}`);
    lines.push(`- Unresolved: ${input.vocabMap.summary.unresolvedCount}`);
    lines.push("");
    lines.push("| Canonical id | Label |");
    lines.push("|---|---|");
    for (const canonical of input.vocabMap.canonicalValues.slice(0, 40)) {
      lines.push(`| ${canonical.canonicalId} | ${canonical.label.replace(/\|/g, "/")} |`);
    }
    lines.push("");
  }
  if (input.sourceAudit !== null) {
    lines.push("## Source Audit");
    lines.push("");
    lines.push(`- Linked examples checked: ${input.sourceAudit.linkedEvidence.checkedExampleCount}`);
    lines.push(`- Field-support verified: ${input.sourceAudit.linkedEvidence.fieldSupportVerifiedCount}`);
    lines.push(`- OCR/page markdown found: ${input.sourceAudit.linkedEvidence.pageMarkdownFoundCount}`);
    lines.push(`- OCR/page text matches: ${input.sourceAudit.linkedEvidence.pageTextMatchCount}`);
    lines.push(`- External MTA docs scanned: ${input.sourceAudit.externalMtaSourceScan.scannedDocumentCount}`);
    lines.push(`- External MTA docs with matches: ${input.sourceAudit.externalMtaSourceScan.documentWithMatchCount}`);
    lines.push(`- External matched aliases: ${input.sourceAudit.externalMtaSourceScan.matchedAliasCount}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function tryString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function findAcceptedSurface(artifact: Record<string, unknown>, surfaceId: string | undefined): Record<string, unknown> | null {
  const submitResult = isRecord(artifact["submitResult"]) ? artifact["submitResult"] : {};
  const accepted = Array.isArray(submitResult["accepted"]) ? submitResult["accepted"] : [];
  for (const item of accepted) {
    if (!isRecord(item) || !isRecord(item["surface"])) continue;
    if (surfaceId === undefined || item["surface"]["surfaceId"] === surfaceId) return item;
  }
  return null;
}

function supportVerifiedFor(item: Record<string, unknown>, fieldPath: string): boolean {
  const support = Array.isArray(item["fieldSupport"]) ? item["fieldSupport"] : [];
  return support.some((entry) => {
    if (!isRecord(entry)) return false;
    return entry["fieldPath"] === fieldPath && entry["verifierState"] === "verified";
  });
}

function evidenceQuoteCount(item: Record<string, unknown>): number {
  const pointers = Array.isArray(item["evidencePointers"]) ? item["evidencePointers"] : [];
  return pointers.filter((pointer) => isRecord(pointer) && typeof pointer["quoteText"] === "string" && pointer["quoteText"].length > 0).length;
}

function pageArtifactKeyFor(artifact: Record<string, unknown>, item: Record<string, unknown> | null): string | null {
  if (item !== null && Array.isArray(item["evidencePointers"])) {
    for (const pointer of item["evidencePointers"]) {
      if (isRecord(pointer) && typeof pointer["pageArtifactKey"] === "string") return pointer["pageArtifactKey"];
    }
  }
  const source = isRecord(artifact["source"]) ? artifact["source"] : {};
  return tryString(source["pageArtifactKey"]);
}

async function readPageMarkdown(pageArtifactKey: string | null): Promise<string | null> {
  if (pageArtifactKey === null) return null;
  const roots = [
    fromRepoRoot("data", "artifacts", "docs", "tier2-full-corpus-2026-05-24-pass2"),
    fromRepoRoot("data", "artifacts", "docs", "gap-roadmap-docs-2026-05-25"),
  ];
  for (const root of roots) {
    const path = join(root, pageArtifactKey);
    const file = Bun.file(path);
    if (await file.exists()) return file.text();
  }
  return null;
}

function looseContains(haystack: string, needles: string[]): boolean {
  const compactHaystack = haystack.toLowerCase().replace(/\s+/g, " ");
  return needles.some((needle) => needle.length > 0 && compactHaystack.includes(needle.toLowerCase()));
}

async function auditLinkedEvidence(input: {
  vocabMap: VocabMapArtifact;
  examplesPerValue: number;
}): Promise<SourceAudit["linkedEvidence"]> {
  const failures: SourceAudit["linkedEvidence"]["sampleFailures"] = [];
  let checkedExampleCount = 0;
  let artifactFoundCount = 0;
  let fieldSupportVerifiedCount = 0;
  let evidencePointerQuoteCount = 0;
  let pageMarkdownFoundCount = 0;
  let pageTextMatchCount = 0;
  for (const alias of input.vocabMap.aliases) {
    for (const example of alias.examples.slice(0, input.examplesPerValue)) {
      checkedExampleCount += 1;
      const artifactFile = Bun.file(example.artifactPath);
      if (!(await artifactFile.exists())) {
        failures.push({
          rawValue: alias.rawValue,
          ...(example.displayLabel === undefined ? {} : { displayLabel: example.displayLabel }),
          artifactPath: example.artifactPath,
          ...(example.sourceId === undefined ? {} : { sourceId: example.sourceId }),
          reason: "artifact_missing",
        });
        continue;
      }
      artifactFoundCount += 1;
      const artifact = await artifactFile.json();
      if (!isRecord(artifact)) continue;
      const acceptedItem = findAcceptedSurface(artifact, example.surfaceId);
      if (acceptedItem !== null && supportVerifiedFor(acceptedItem, example.sourceFieldPath)) {
        fieldSupportVerifiedCount += 1;
      }
      if (acceptedItem !== null) {
        evidencePointerQuoteCount += evidenceQuoteCount(acceptedItem);
      }
      const markdown = await readPageMarkdown(pageArtifactKeyFor(artifact, acceptedItem));
      if (markdown === null) {
        failures.push({
          rawValue: alias.rawValue,
          ...(example.displayLabel === undefined ? {} : { displayLabel: example.displayLabel }),
          artifactPath: example.artifactPath,
          ...(example.sourceId === undefined ? {} : { sourceId: example.sourceId }),
          reason: "page_markdown_missing",
        });
        continue;
      }
      pageMarkdownFoundCount += 1;
      const needles = [
        alias.rawValue,
        alias.normalizedRawValue,
        example.displayLabel ?? "",
      ];
      if (looseContains(markdown, needles)) pageTextMatchCount += 1;
    }
  }
  return {
    checkedExampleCount,
    artifactFoundCount,
    fieldSupportVerifiedCount,
    evidencePointerQuoteCount,
    pageMarkdownFoundCount,
    pageTextMatchCount,
    sampleFailures: failures.slice(0, 25),
  };
}

async function readSourceText(path: string): Promise<string | null> {
  if (path.endsWith(".pdf")) {
    const proc = Bun.spawn(["pdftotext", "-layout", path, "-"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;
    return text;
  }
  try {
    return await Bun.file(path).text();
  } catch {
    return null;
  }
}

async function sourceFiles(root: string): Promise<Array<{ sourceId: string; path: string }>> {
  const out: Array<{ sourceId: string; path: string }> = [];
  async function visit(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!["source.pdf", "source.html", "source.json", "text.txt"].includes(entry.name)) continue;
      const sourceId = basename(dirname(path));
      if (!sourceId.startsWith("mta_")) continue;
      out.push({ sourceId, path });
    }
  }
  await visit(root);
  return out.sort((left, right) => left.path.localeCompare(right.path));
}


async function auditExternalMtaSources(input: {
  vocabMap: VocabMapArtifact;
  sourceRoot?: string;
}): Promise<SourceAudit["externalMtaSourceScan"]> {
  if (input.sourceRoot === undefined) {
    return {
      sourceRoot: null,
      scannedDocumentCount: 0,
      documentWithMatchCount: 0,
      matchedAliasCount: 0,
      matchedCanonicalIds: {},
      samples: [],
    };
  }
  const root = fromCliPath(input.sourceRoot);
  const aliases = input.vocabMap.aliases
    .filter((alias) => alias.decision === "mapped" && alias.canonicalId !== undefined)
    .filter((alias) => alias.rawValue.length >= 2 || alias.rawValue === "%")
    .sort((left, right) => right.rawValue.length - left.rawValue.length);
  const matchedCanonicalIds: Record<string, number> = {};
  const samples: SourceAudit["externalMtaSourceScan"]["samples"] = [];
  let scannedDocumentCount = 0;
  let documentWithMatchCount = 0;
  let matchedAliasCount = 0;
  for (const source of await sourceFiles(root)) {
    const text = await readSourceText(source.path);
    if (text === null || text.trim().length === 0) continue;
    scannedDocumentCount += 1;
    let docHadMatch = false;
    const matchedInDoc = new Set<string>();
    for (const alias of aliases) {
      const canonicalId = alias.canonicalId;
      if (canonicalId === undefined) continue;
      if (!looseContains(text, [alias.rawValue])) continue;
      const key = `${source.path}|${alias.rawValue}`;
      if (matchedInDoc.has(key)) continue;
      matchedInDoc.add(key);
      docHadMatch = true;
      matchedAliasCount += 1;
      matchedCanonicalIds[canonicalId] = (matchedCanonicalIds[canonicalId] ?? 0) + 1;
      if (samples.length < 50) {
        samples.push({
          sourceId: source.sourceId,
          sourcePath: source.path,
          rawValue: alias.rawValue,
          canonicalId,
          snippet: snippetFor(text, alias.rawValue),
        });
      }
    }
    if (docHadMatch) documentWithMatchCount += 1;
  }
  return {
    sourceRoot: root,
    scannedDocumentCount,
    documentWithMatchCount,
    matchedAliasCount,
    matchedCanonicalIds: Object.fromEntries(Object.entries(matchedCanonicalIds).sort(([left], [right]) => left.localeCompare(right))),
    samples,
  };
}

async function buildSourceAudit(input: {
  generatedAt: string;
  vocabMapPath: string;
  graduationPlanPath: string;
  vocabMap: VocabMapArtifact;
  sourceAuditRoot?: string;
  sourceAuditExamplesPerValue: number;
}): Promise<SourceAudit> {
  return {
    artifactKind: SOURCE_AUDIT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    sourceVocabMapPath: input.vocabMapPath,
    sourceGraduationPlanPath: input.graduationPlanPath,
    keyId: input.vocabMap.keyId,
    linkedEvidence: await auditLinkedEvidence({
      vocabMap: input.vocabMap,
      examplesPerValue: input.sourceAuditExamplesPerValue,
    }),
    externalMtaSourceScan: await auditExternalMtaSources({
      vocabMap: input.vocabMap,
      ...(input.sourceAuditRoot === undefined ? {} : { sourceRoot: input.sourceAuditRoot }),
    }),
  };
}

async function writeChunkInputs(input: {
  key: GraduationKey;
  chunks: VocabChunk[];
  generatedAt: string;
  graduationPlanPath: string;
}) {
  for (const chunk of input.chunks) {
    await mkdir(dirname(chunk.chunkPath), { recursive: true });
    await writeJson(chunk.chunkPath, {
      artifactKind: "bp.tier2_vocab_synthesis_chunk_input.v1",
      schemaVersion: 1,
      generatedAt: input.generatedAt,
      promptVersion: PROMPT_VERSION,
      sourceGraduationPlanPath: input.graduationPlanPath,
      key: {
        keyId: input.key.id,
        tier: input.key.tier,
        targetPayloadPath: input.key.targetPayloadPath,
        description: input.key.description,
        instanceCount: input.key.instanceCount,
        distinctValueCount: input.key.distinctValueCount,
      },
      chunk,
    });
  }
}

async function executeChunkDirect(input: {
  generatedAt: string;
  key: GraduationKey;
  chunk: VocabChunk;
  priorCanonicalValues: readonly CanonicalValue[];
  provider: VocabLlmProvider;
  model: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
  fetcher: FetchLike;
  sourceAuditRoot?: string;
}): Promise<{
  response: ModelVocabResponse | null;
  result: Tier2VocabSynthesisRun["chunkResults"][number];
}> {
  const chunkDir = dirname(input.chunk.chunkPath);
  const promptPath = join(chunkDir, "provided-prompt.md");
  const requestPath = join(chunkDir, "request.json");
  const responsePath = join(chunkDir, "response.json");
  const toolCallPath = join(chunkDir, "tool-call.json");
  const validationPath = join(chunkDir, "validation.json");
  const errorPath = join(chunkDir, "error.json");
  const tool = modelTool();
  const prompt = await userPrompt({
    key: input.key,
    chunk: input.chunk,
    priorCanonicalValues: input.priorCanonicalValues,
    ...(input.sourceAuditRoot === undefined ? {} : { sourceAuditRoot: input.sourceAuditRoot }),
  });
  await Bun.write(promptPath, `${prompt}\n`);
  const messages: ToolCallMessage[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: prompt },
  ];
  await writeJson(requestPath, {
    artifactKind: "bp.tier2_vocab_synthesis_request.v1",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    provider: input.provider,
    model: input.model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    toolName: TOOL_NAME,
    messages,
    tool,
  });
  try {
    const providerResult = input.provider === "deepseek"
      ? await callDeepSeekToolCallViaPi({
          apiKey: input.apiKey,
          model: input.model,
          maxTokens: input.maxTokens,
          toolName: TOOL_NAME,
          messages,
          tools: [tool],
          fetcher: input.fetcher,
        })
      : await callPioneerToolCallDirect({
          apiKey: input.apiKey,
          model: input.model,
          maxTokens: input.maxTokens,
          temperature: input.temperature,
          toolName: TOOL_NAME,
          messages,
          tools: [tool],
          fetcher: input.fetcher,
        });
    await writeJson(responsePath, providerResult.body);
    if (!providerResult.response.ok) {
      throw new Error(
        openRouterErrorMessage(providerResult.body) ??
          `HTTP ${providerResult.response.status} ${providerResult.response.statusText}`,
      );
    }
    const toolArgs = extractToolCallArguments(providerResult.body, TOOL_NAME);
    if (toolArgs === null) {
      throw new Error(missingToolCallErrorMessage({
        responseJson: providerResult.body,
        toolName: TOOL_NAME,
        maxTokens: input.maxTokens,
      }));
    }
    const parsed = parseModelResponse(toolArgs);
    await writeJson(toolCallPath, parsed);
    const validation = validateVocabToolCall({
      keyId: input.key.id,
      chunk: input.chunk,
      response: parsed,
      generatedAt: input.generatedAt,
    });
    await writeJson(validationPath, validation);
    return {
      response: validation.status === "accepted" ? parsed : null,
      result: {
        chunkId: input.chunk.chunkId,
        promptPath,
        executionMode: "direct_tool_call",
        requestPath,
        responsePath,
        toolCallPath,
        validationPath,
        toolLoopPath: null,
        sessionPath: null,
        status: validation.status,
        errorPath: null,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeJson(errorPath, {
      artifactKind: "bp.tier2_vocab_synthesis_error.v1",
      schemaVersion: 1,
      generatedAt: input.generatedAt,
      chunkId: input.chunk.chunkId,
      error: message,
      requestPath,
    });
    return {
      response: null,
      result: {
        chunkId: input.chunk.chunkId,
        promptPath,
        executionMode: "direct_tool_call",
        requestPath,
        responsePath: (await Bun.file(responsePath).exists()) ? responsePath : null,
        toolCallPath: null,
        validationPath: null,
        toolLoopPath: null,
        sessionPath: null,
        status: "provider_failed",
        errorPath,
      },
    };
  }
}

async function executeChunkAgentic(input: {
  generatedAt: string;
  key: GraduationKey;
  chunk: VocabChunk;
  priorCanonicalValues: readonly CanonicalValue[];
  provider: VocabLlmProvider;
  model: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
  sourceAuditRoot?: string;
  modelToolLoop?: ModelToolLoop;
  maxToolCalls: number;
  maxWallTimeMs: number;
  persistSessions: boolean;
  outputRoot: string;
}): Promise<{
  response: ModelVocabResponse | null;
  result: Tier2VocabSynthesisRun["chunkResults"][number];
}> {
  const chunkDir = dirname(input.chunk.chunkPath);
  const promptPath = join(chunkDir, "provided-prompt.md");
  const requestPath = join(chunkDir, "request.json");
  const toolLoopPath = join(chunkDir, "tool-loop-result.json");
  const toolCallPath = join(chunkDir, "tool-call.json");
  const validationPath = join(chunkDir, "validation.json");
  const errorPath = join(chunkDir, "error.json");
  const sessionsRoot = input.persistSessions ? join(input.outputRoot, "sessions") : undefined;
  if (sessionsRoot !== undefined) await mkdir(sessionsRoot, { recursive: true });

  const prompt = await userPrompt({
    key: input.key,
    chunk: input.chunk,
    priorCanonicalValues: input.priorCanonicalValues,
    ...(input.sourceAuditRoot === undefined ? {} : { sourceAuditRoot: input.sourceAuditRoot }),
  });
  await Bun.write(promptPath, `${prompt}\n`);
  await writeJson(requestPath, {
    artifactKind: "bp.tier2_vocab_synthesis_agentic_request.v1",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    provider: input.provider,
    model: input.model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    promptVersion: PROMPT_VERSION,
    promptPath,
    toolNames: ["read_vocab_context", "search_source_text", TOOL_NAME],
    chunkId: input.chunk.chunkId,
  });

  const store: VocabSubmitStore = {
    attempts: 0,
    acceptedResponse: null,
    lastValidation: null,
  };
  const loop = input.modelToolLoop ?? makeToolLoopRunner({
    model: resolveVocabModel(input.provider, input.model),
    apiKey: input.apiKey,
    maxOutputTokens: input.maxTokens,
    maxToolCalls: input.maxToolCalls,
    maxWallTimeMs: input.maxWallTimeMs,
    includeSandboxTools: false,
    onEvent: buildStderrEventSink({ prefix: "vocab-synthesis" }),
    ...(sessionsRoot === undefined ? {} : { sessionsRoot }),
  });

  let loopResult: ToolLoopResult | null = null;
  try {
    loopResult = await loop({
      systemPrompt: systemPrompt(),
      userMessage: prompt,
      extraTools: [
        buildReadVocabContextTool(input.chunk),
        buildSearchSourceTextTool(input.sourceAuditRoot),
        buildSubmitVocabMapTool({
          key: input.key,
          chunk: input.chunk,
          generatedAt: input.generatedAt,
          store,
          toolCallPath,
          validationPath,
        }),
      ],
    });
    await writeJson(toolLoopPath, {
      artifactKind: "bp.tier2_vocab_synthesis_tool_loop_result.v1",
      schemaVersion: 1,
      generatedAt: input.generatedAt,
      chunkId: input.chunk.chunkId,
      promptPath,
      attempts: store.attempts,
      accepted: store.acceptedResponse !== null,
      capsHit: loopResult.capsHit,
      iterations: loopResult.iterations,
      usage: loopResult.usage,
      toolUseTrace: loopResult.toolUseTrace,
      finalText: loopResult.finalText,
      ...(loopResult.sessionId === undefined ? {} : { sessionId: loopResult.sessionId }),
      ...(loopResult.sessionPath === undefined ? {} : { sessionPath: loopResult.sessionPath }),
    });
    if (store.acceptedResponse !== null) {
      return {
        response: store.acceptedResponse,
        result: {
          chunkId: input.chunk.chunkId,
          promptPath,
          executionMode: "agentic_tool_loop",
          requestPath,
          responsePath: null,
          toolCallPath,
          validationPath,
          toolLoopPath,
          sessionPath: loopResult.sessionPath ?? null,
          status: "accepted",
          errorPath: null,
        },
      };
    }
    throw new Error(
      `agentic loop ended without an accepted ${TOOL_NAME} submission (attempts=${store.attempts}, capsHit=${loopResult.capsHit ?? "none"}, iterations=${loopResult.iterations})`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeJson(errorPath, {
      artifactKind: "bp.tier2_vocab_synthesis_error.v1",
      schemaVersion: 1,
      generatedAt: input.generatedAt,
      chunkId: input.chunk.chunkId,
      error: message,
      promptPath,
      requestPath,
      toolLoopPath: (await Bun.file(toolLoopPath).exists()) ? toolLoopPath : null,
      attempts: store.attempts,
      lastValidation: store.lastValidation,
    });
    return {
      response: null,
      result: {
        chunkId: input.chunk.chunkId,
        promptPath,
        executionMode: "agentic_tool_loop",
        requestPath,
        responsePath: null,
        toolCallPath: (await Bun.file(toolCallPath).exists()) ? toolCallPath : null,
        validationPath: (await Bun.file(validationPath).exists()) ? validationPath : null,
        toolLoopPath: (await Bun.file(toolLoopPath).exists()) ? toolLoopPath : null,
        sessionPath: loopResult?.sessionPath ?? null,
        status: store.attempts > 0 ? "rejected" : "provider_failed",
        errorPath,
      },
    };
  }
}

async function executeChunkAgenticV2(input: {
  generatedAt: string;
  key: GraduationKey;
  chunk: VocabChunk;
  priorCanonicalValues: readonly CanonicalValue[];
  provider: VocabLlmProvider;
  model: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
  sourceAuditRoot?: string;
  modelToolLoop?: ModelToolLoop;
  maxToolCalls: number;
  maxContextToolCalls: number;
  maxWallTimeMs: number;
  persistSessions: boolean;
  outputRoot: string;
}): Promise<{
  response: ModelVocabResponse | null;
  result: Tier2VocabSynthesisRun["chunkResults"][number];
}> {
  const chunkDir = dirname(input.chunk.chunkPath);
  const promptPath = join(chunkDir, "provided-prompt.md");
  const requestPath = join(chunkDir, "request.json");
  const toolLoopPath = join(chunkDir, "tool-loop-result.json");
  const toolCallPath = join(chunkDir, "tool-call.json");
  const validationPath = join(chunkDir, "validation.json");
  const errorPath = join(chunkDir, "error.json");
  const sessionsRoot = input.persistSessions ? join(input.outputRoot, "sessions") : undefined;
  if (sessionsRoot !== undefined) await mkdir(sessionsRoot, { recursive: true });

  const prompt = await userPromptV2({
    key: input.key,
    chunk: input.chunk,
    priorCanonicalValues: input.priorCanonicalValues,
    maxContextToolCalls: input.maxContextToolCalls,
    ...(input.sourceAuditRoot === undefined ? {} : { sourceAuditRoot: input.sourceAuditRoot }),
  });
  await Bun.write(promptPath, `${prompt}\n`);

  const toolNames = [
    "get_value_profiles",
    "compare_values",
    "search_value_inventory",
    "search_source_snippets",
    "read_source_excerpt",
    V2_TOOL_NAME,
  ];
  await writeJson(requestPath, {
    artifactKind: "bp.tier2_vocab_synthesis_agentic_request.v2",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    harness: "v2",
    provider: input.provider,
    model: input.model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    promptVersion: PROMPT_VERSION,
    promptPath,
    toolNames,
    maxContextToolCalls: input.maxContextToolCalls,
    chunkId: input.chunk.chunkId,
  });

  const store: VocabSubmitStore = {
    attempts: 0,
    acceptedResponse: null,
    lastValidation: null,
  };
  const budget: V2ToolBudget = {
    contextCalls: 0,
    maxContextCalls: input.maxContextToolCalls,
  };
  const loop = input.modelToolLoop ?? makeToolLoopRunner({
    model: resolveVocabModel(input.provider, input.model),
    apiKey: input.apiKey,
    maxOutputTokens: input.maxTokens,
    maxToolCalls: input.maxToolCalls,
    maxWallTimeMs: input.maxWallTimeMs,
    includeSandboxTools: false,
    onEvent: buildStderrEventSink({ prefix: "vocab-synthesis" }),
    ...(sessionsRoot === undefined ? {} : { sessionsRoot }),
  });

  let loopResult: ToolLoopResult | null = null;
  try {
    loopResult = await loop({
      systemPrompt: systemPromptV2(),
      userMessage: prompt,
      extraTools: [
        buildGetValueProfilesTool(input.chunk, budget),
        buildCompareValuesTool(input.chunk, budget),
        buildSearchValueInventoryTool(input.key),
        buildSearchSourceSnippetsTool(input.sourceAuditRoot, budget),
        buildReadSourceExcerptTool(input.sourceAuditRoot, budget),
        buildSubmitCompactVocabTool({
          key: input.key,
          chunk: input.chunk,
          priorCanonicalValues: input.priorCanonicalValues,
          generatedAt: input.generatedAt,
          store,
          toolCallPath,
          validationPath,
        }),
      ],
    });
    await writeJson(toolLoopPath, {
      artifactKind: "bp.tier2_vocab_synthesis_tool_loop_result.v1",
      schemaVersion: 1,
      generatedAt: input.generatedAt,
      harness: "v2",
      chunkId: input.chunk.chunkId,
      promptPath,
      attempts: store.attempts,
      accepted: store.acceptedResponse !== null,
      contextToolCalls: budget.contextCalls,
      maxContextToolCalls: budget.maxContextCalls,
      capsHit: loopResult.capsHit,
      iterations: loopResult.iterations,
      usage: loopResult.usage,
      toolUseTrace: loopResult.toolUseTrace,
      finalText: loopResult.finalText,
      ...(loopResult.sessionId === undefined ? {} : { sessionId: loopResult.sessionId }),
      ...(loopResult.sessionPath === undefined ? {} : { sessionPath: loopResult.sessionPath }),
    });
    if (store.acceptedResponse !== null) {
      return {
        response: store.acceptedResponse,
        result: {
          chunkId: input.chunk.chunkId,
          promptPath,
          executionMode: "agentic_tool_loop",
          requestPath,
          responsePath: null,
          toolCallPath,
          validationPath,
          toolLoopPath,
          sessionPath: loopResult.sessionPath ?? null,
          status: "accepted",
          errorPath: null,
        },
      };
    }
    throw new Error(
      `agentic loop ended without an accepted ${V2_TOOL_NAME} submission (attempts=${store.attempts}, capsHit=${loopResult.capsHit ?? "none"}, iterations=${loopResult.iterations})`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeJson(errorPath, {
      artifactKind: "bp.tier2_vocab_synthesis_error.v1",
      schemaVersion: 1,
      generatedAt: input.generatedAt,
      harness: "v2",
      chunkId: input.chunk.chunkId,
      error: message,
      promptPath,
      requestPath,
      toolLoopPath: (await Bun.file(toolLoopPath).exists()) ? toolLoopPath : null,
      attempts: store.attempts,
      contextToolCalls: budget.contextCalls,
      maxContextToolCalls: budget.maxContextCalls,
      lastValidation: store.lastValidation,
    });
    return {
      response: null,
      result: {
        chunkId: input.chunk.chunkId,
        promptPath,
        executionMode: "agentic_tool_loop",
        requestPath,
        responsePath: null,
        toolCallPath: (await Bun.file(toolCallPath).exists()) ? toolCallPath : null,
        validationPath: (await Bun.file(validationPath).exists()) ? validationPath : null,
        toolLoopPath: (await Bun.file(toolLoopPath).exists()) ? toolLoopPath : null,
        sessionPath: loopResult?.sessionPath ?? null,
        status: store.attempts > 0 ? "rejected" : "provider_failed",
        errorPath,
      },
    };
  }
}


export async function runTier2VocabSynthesis(args: RunTier2VocabSynthesisArgs): Promise<Tier2VocabSynthesisRun> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const graduationPlanPath = fromCliPath(args.graduationPlanPath);
  const outputRoot = fromCliPath(
    args.outputRoot ??
      join(defaultArtifactRootPath(), "docs", "tier2-vocab-synthesis", `vocab-synthesis-${shortHash(graduationPlanPath)}`),
  );
  const chunkSize = args.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const maxValuesPerKey = args.maxValuesPerKey;
  const examplesPerValue = args.examplesPerValue ?? DEFAULT_EXAMPLES_PER_VALUE;
  const sourceAuditExamplesPerValue = args.sourceAuditExamplesPerValue ?? DEFAULT_SOURCE_AUDIT_EXAMPLES_PER_VALUE;
  const harness = args.harness ?? "v1";
  const graduationPlan = parseGraduationPlan(await Bun.file(graduationPlanPath).json(), graduationPlanPath);
  const selectedKeys = selectKeys(graduationPlan, args.keyIds);
  await mkdir(outputRoot, { recursive: true });

  const runKeys: Tier2VocabSynthesisRun["keys"] = [];
  const allChunks: Array<{ key: GraduationKey; chunk: VocabChunk }> = [];
  for (const key of selectedKeys) {
    const chunks = chunkValues(key, {
      chunkSize,
      ...(maxValuesPerKey === undefined ? {} : { maxValuesPerKey }),
      examplesPerValue,
      outputRoot,
    });
    await writeChunkInputs({ key, chunks, generatedAt, graduationPlanPath });
    runKeys.push({
      keyId: key.id,
      tier: key.tier,
      targetPayloadPath: key.targetPayloadPath,
      description: key.description,
      inputValueCount: chunks.reduce((sum, chunk) => sum + chunk.valueCount, 0),
      instanceCount: key.instanceCount,
      distinctValueCount: key.distinctValueCount,
      chunks,
    });
    allChunks.push(...chunks.map((chunk) => ({ key, chunk })));
  }

  const chunkResults: Tier2VocabSynthesisRun["chunkResults"] = [];
  const acceptedResponses: ModelVocabResponse[] = [];
  const previousRun = await readJsonIfExists<Tier2VocabSynthesisRun>(join(outputRoot, "vocab-synthesis-run.json"));
  const previousResultsByChunk = new Map(
    (previousRun?.chunkResults ?? []).map((result) => [result.chunkId, result]),
  );
  const provider = args.provider ?? "pioneer";
  const model = args.model ?? defaultModelForProvider(provider);
  const maxTokens = args.maxTokens ?? DEFAULT_MAX_TOKENS;
  const temperature = args.temperature ?? DEFAULT_TEMPERATURE;
  const useAgenticLoop = args.agenticLoop !== false;
  if (args.execute === true && harness === "v2" && !useAgenticLoop) {
    throw new Error("--harness v2 requires the agentic tool loop; remove --direct-tool-call.");
  }
  if (args.execute === true) {
    const apiKey = apiKeyForProvider({
      provider,
      ...(args.pioneerApiKey === undefined ? {} : { pioneerApiKey: args.pioneerApiKey }),
      ...(args.deepseekApiKey === undefined ? {} : { deepseekApiKey: args.deepseekApiKey }),
    });
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error(`${envNameForProvider(provider)} is required for docs tier2 vocab-synthesis --execute.`);
    }
    for (const { key, chunk } of allChunks) {
      const priorCanonicalValues = collectCanonicalValues(
        acceptedResponses.filter((response) => response.keyId === key.id),
      );
      const reusable = await reusableAcceptedChunk({
        generatedAt,
        key,
        chunk,
        ...(previousResultsByChunk.has(chunk.chunkId)
          ? { previousResult: previousResultsByChunk.get(chunk.chunkId) }
          : {}),
      });
      if (reusable !== null) {
        chunkResults.push(reusable.result);
        acceptedResponses.push(reusable.response);
        continue;
      }
      const executeOnce = () => {
        if (!useAgenticLoop) {
          return executeChunkDirect({
            generatedAt,
            key,
            chunk,
            priorCanonicalValues,
            provider,
            model,
            maxTokens,
            temperature,
            apiKey,
            fetcher: args.fetcher ?? defaultFetch,
            ...(args.sourceAuditRoot === undefined ? {} : { sourceAuditRoot: args.sourceAuditRoot }),
          });
        }
        if (harness === "v2") {
          return executeChunkAgenticV2({
            generatedAt,
            key,
            chunk,
            priorCanonicalValues,
            provider,
            model,
            maxTokens,
            temperature,
            apiKey,
            ...(args.sourceAuditRoot === undefined ? {} : { sourceAuditRoot: args.sourceAuditRoot }),
            ...(args.modelToolLoop === undefined ? {} : { modelToolLoop: args.modelToolLoop }),
            maxToolCalls: args.agenticMaxToolCalls ?? DEFAULT_AGENTIC_MAX_TOOL_CALLS,
            maxContextToolCalls: args.maxContextToolCalls ?? DEFAULT_V2_MAX_CONTEXT_CALLS,
            maxWallTimeMs: args.agenticWallTimeMs ?? DEFAULT_AGENTIC_WALL_TIME_MS,
            persistSessions: args.persistSessions === true,
            outputRoot,
          });
        }
        return executeChunkAgentic({
          generatedAt,
          key,
          chunk,
          priorCanonicalValues,
          provider,
          model,
          maxTokens,
          temperature,
          apiKey,
          ...(args.sourceAuditRoot === undefined ? {} : { sourceAuditRoot: args.sourceAuditRoot }),
          ...(args.modelToolLoop === undefined ? {} : { modelToolLoop: args.modelToolLoop }),
          maxToolCalls: args.agenticMaxToolCalls ?? DEFAULT_AGENTIC_MAX_TOOL_CALLS,
          maxWallTimeMs: args.agenticWallTimeMs ?? DEFAULT_AGENTIC_WALL_TIME_MS,
          persistSessions: args.persistSessions === true,
          outputRoot,
        });
      };
      let result = await executeOnce();
      for (let retryIndex = 0; result.result.status === "provider_failed" && retryIndex < DEFAULT_PROVIDER_RETRY_COUNT; retryIndex += 1) {
        const delayMs = providerRetryDelayMs(chunk.chunkId, retryIndex);
        console.error(
          `[tier2-vocab-synthesis] provider_failed chunk=${chunk.chunkId} retry=${retryIndex + 1}/${DEFAULT_PROVIDER_RETRY_COUNT} waitMs=${delayMs}`,
        );
        await sleepMs(delayMs);
        result = await executeOnce();
      }
      chunkResults.push(result.result);
      if (result.response !== null) acceptedResponses.push(result.response);
    }
  } else {
    chunkResults.push(...allChunks.map(({ chunk }) => ({
      chunkId: chunk.chunkId,
      promptPath: null,
      executionMode: "not_executed" as const,
      requestPath: null,
      responsePath: null,
      toolCallPath: null,
      validationPath: null,
      toolLoopPath: null,
      sessionPath: null,
      status: "not_executed" as const,
      errorPath: null,
    })));
  }

  let vocabMapPath: string | null = null;
  let sourceAuditPath: string | null = null;
  let vocabMap: VocabMapArtifact | null = null;
  let sourceAudit: SourceAudit | null = null;
  if (args.execute === true && selectedKeys.length === 1 && acceptedResponses.length === allChunks.length) {
    const key = selectedKeys[0];
    if (key !== undefined) {
      vocabMap = buildVocabMap({
        generatedAt,
        sourceGraduationPlanPath: graduationPlanPath,
        key,
        responses: acceptedResponses,
        chunks: allChunks.map(({ chunk }) => chunk),
        model,
        temperature,
      });
      vocabMapPath = join(outputRoot, `vocab-map-${key.id}.json`);
      await writeJson(vocabMapPath, vocabMap);
      sourceAudit = await buildSourceAudit({
        generatedAt,
        vocabMapPath,
        graduationPlanPath,
        vocabMap,
        ...(args.sourceAuditRoot === undefined ? {} : { sourceAuditRoot: args.sourceAuditRoot }),
        sourceAuditExamplesPerValue,
      });
      sourceAuditPath = join(outputRoot, `source-audit-${key.id}.json`);
      await writeJson(sourceAuditPath, sourceAudit);
    }
  }

  const statuses = chunkResults.map((result) => result.status);
  const run: Tier2VocabSynthesisRun = {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt,
    promptVersion: PROMPT_VERSION,
    sourceGraduationPlanPath: graduationPlanPath,
    outputRoot,
    keyIds: selectedKeys.map((key) => key.id),
    chunkSize,
    examplesPerValue,
    execute: args.execute === true,
    harness,
    provider: args.execute === true ? provider : null,
    model: args.execute === true ? model : null,
    temperature: args.execute === true ? temperature : null,
    summary: {
      keyCount: selectedKeys.length,
      chunkCount: allChunks.length,
      inputValueCount: allChunks.reduce((sum, item) => sum + item.chunk.valueCount, 0),
      executedChunkCount: statuses.filter((status) => status !== "not_executed").length,
      acceptedChunkCount: statuses.filter((status) => status === "accepted").length,
      rejectedChunkCount: statuses.filter((status) => status === "rejected" || status === "provider_failed").length,
    },
    keys: runKeys,
    chunkResults,
    vocabMapPath,
    sourceAuditPath,
  };
  await writeJson(join(outputRoot, "vocab-synthesis-run.json"), run);
  await Bun.write(join(outputRoot, "vocab-synthesis-summary.md"), renderMarkdown({ run, vocabMap, sourceAudit }));
  return run;
}

function parseArgs(argv: string[]): CliArgs {
  const options: CliOption<CliArgs>[] = [
    {
      flags: ["--graduation-plan"],
      apply: (output, value) => {
        if (value !== undefined) output.graduationPlanPath = fromCliPath(value);
      },
    },
    {
      flags: ["--output-root"],
      apply: (output, value) => {
        if (value !== undefined) output.outputRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--key", "--keys"],
      apply: (output, value) => {
        if (value !== undefined) output.keyIds = value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
      },
    },
    {
      flags: ["--chunk-size"],
      apply: (output, value) => {
        if (value !== undefined) output.chunkSize = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--max-values-per-key", "--max-values"],
      apply: (output, value) => {
        if (value !== undefined) output.maxValuesPerKey = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--examples-per-value"],
      apply: (output, value) => {
        if (value !== undefined) output.examplesPerValue = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--model"],
      apply: (output, value) => {
        if (value !== undefined) output.model = value;
      },
    },
    {
      flags: ["--provider"],
      apply: (output, value) => {
        if (value === "pioneer" || value === "deepseek") {
          output.provider = value;
          return;
        }
        throw new Error("--provider must be pioneer or deepseek.");
      },
    },
    {
      flags: ["--max-tokens"],
      apply: (output, value) => {
        if (value !== undefined) output.maxTokens = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--temperature"],
      apply: (output, value) => {
        if (value !== undefined) output.temperature = Number.parseFloat(value);
      },
    },
    {
      flags: ["--harness"],
      apply: (output, value) => {
        if (value === "v1" || value === "v2") {
          output.harness = value;
          return;
        }
        throw new Error("--harness must be v1 or v2.");
      },
    },
    {
      flags: ["--agentic-max-tool-calls"],
      apply: (output, value) => {
        if (value !== undefined) output.agenticMaxToolCalls = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--max-context-tool-calls"],
      apply: (output, value) => {
        if (value !== undefined) output.maxContextToolCalls = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--agentic-wall-time-ms"],
      apply: (output, value) => {
        if (value !== undefined) output.agenticWallTimeMs = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--source-audit-root"],
      apply: (output, value) => {
        if (value !== undefined) output.sourceAuditRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--source-audit-examples-per-value"],
      apply: (output, value) => {
        if (value !== undefined) output.sourceAuditExamplesPerValue = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--generated-at"],
      apply: (output, value) => {
        if (value !== undefined) output.generatedAt = value;
      },
    },
    trueOption<CliArgs>(["--execute"], (output) => {
      output.execute = true;
    }),
    trueOption<CliArgs>(["--direct-tool-call"], (output) => {
      output.agenticLoop = false;
    }),
    trueOption<CliArgs>(["--persist-sessions"], (output) => {
      output.persistSessions = true;
    }),
  ];
  return parseCliOptions(argv, {}, options);
}

export async function runTier2VocabSynthesisFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.graduationPlanPath === undefined) {
    throw new Error("Provide --graduation-plan with a raw-field graduation plan JSON artifact.");
  }
  const run = await runTier2VocabSynthesis({
    graduationPlanPath: args.graduationPlanPath,
    ...(args.outputRoot === undefined ? {} : { outputRoot: args.outputRoot }),
    ...(args.keyIds === undefined ? {} : { keyIds: args.keyIds }),
    ...(args.chunkSize === undefined ? {} : { chunkSize: args.chunkSize }),
    ...(args.maxValuesPerKey === undefined ? {} : { maxValuesPerKey: args.maxValuesPerKey }),
    ...(args.examplesPerValue === undefined ? {} : { examplesPerValue: args.examplesPerValue }),
    ...(args.execute === undefined ? {} : { execute: args.execute }),
    ...(args.agenticLoop === undefined ? {} : { agenticLoop: args.agenticLoop }),
    ...(args.provider === undefined ? {} : { provider: args.provider }),
    ...(args.model === undefined ? {} : { model: args.model }),
    ...(args.maxTokens === undefined ? {} : { maxTokens: args.maxTokens }),
    ...(args.temperature === undefined ? {} : { temperature: args.temperature }),
    ...(args.harness === undefined ? {} : { harness: args.harness }),
    ...(args.agenticMaxToolCalls === undefined ? {} : { agenticMaxToolCalls: args.agenticMaxToolCalls }),
    ...(args.maxContextToolCalls === undefined ? {} : { maxContextToolCalls: args.maxContextToolCalls }),
    ...(args.agenticWallTimeMs === undefined ? {} : { agenticWallTimeMs: args.agenticWallTimeMs }),
    ...(args.persistSessions === undefined ? {} : { persistSessions: args.persistSessions }),
    ...(args.sourceAuditRoot === undefined ? {} : { sourceAuditRoot: args.sourceAuditRoot }),
    ...(args.sourceAuditExamplesPerValue === undefined ? {} : { sourceAuditExamplesPerValue: args.sourceAuditExamplesPerValue }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
  });
  console.log(
    `tier2-vocab-synthesis: harness=${run.harness} keys=${run.summary.keyCount} chunks=${run.summary.chunkCount} accepted=${run.summary.acceptedChunkCount} rejected=${run.summary.rejectedChunkCount}`,
  );
  return {
    artifactKind: run.artifactKind,
    schemaVersion: run.schemaVersion,
    generatedAt: run.generatedAt,
    outputRoot: run.outputRoot,
    harness: run.harness,
    provider: run.provider,
    model: run.model,
    summary: run.summary,
    vocabMapPath: run.vocabMapPath,
    sourceAuditPath: run.sourceAuditPath,
  };
}
