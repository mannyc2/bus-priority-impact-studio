import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../../lib/json.ts";
import type { ToolCallMessage } from "../../../../lib/llm.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../../lib/paths.ts";
import {
  callPioneerToolCallViaPi,
  openRouterErrorMessage,
  type OpenRouterCallResult,
} from "../_llm-clients.ts";
import {
  extractToolCallArguments,
  type FetchLike,
  missingToolCallErrorMessage,
} from "../_shared.ts";
import {
  DEFAULT_TIER2_FEATURE_SMOKE_MAX_REPAIR_ROUNDS,
  DEFAULT_TIER2_FEATURE_SMOKE_MAX_TOKENS,
  DEFAULT_TIER2_FEATURE_SMOKE_MODEL,
  DEFAULT_TIER2_FEATURE_SMOKE_PROVIDER,
  DEFAULT_TIER2_FEATURE_SMOKE_TIMEOUT_MS,
  defaultTier2FeatureSmokeRequest,
  DETERMINISTIC_RUNNER_FIELDS,
  LLM_SUBMITTED_FIELD_SETS,
  TIER2_FEATURE_EXTRACTION_ARTIFACT_KIND,
  TIER2_FEATURE_EXTRACTION_PROMPT_VERSION,
  TIER2_FEATURE_EXTRACTION_TOOL_NAME,
  Tier2FeatureExtractionRequestSchema,
  tier2FeatureExtractionTool,
  type Tier2FeatureExtractionRequest,
  type Tier2FeatureExtractionToolResponse,
  VOCAB_RUNNER_FIELDS,
} from "./contract.ts";
import {
  retryFeedbackForFeatureValidation,
  validateTier2FeatureExtractionSubmission,
  type Tier2FeatureExtractionValidation,
} from "./validator.ts";

export type Tier2FeatureExtractionProvider = typeof DEFAULT_TIER2_FEATURE_SMOKE_PROVIDER;

export type Tier2FeatureExtractionProviderCallInput = {
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  maxAttempts?: number;
  messages: ToolCallMessage[];
  fetcher?: FetchLike;
};

export type Tier2FeatureExtractionProviderCaller = (
  input: Tier2FeatureExtractionProviderCallInput,
) => Promise<OpenRouterCallResult>;

export type Tier2FeatureExtractionUsage = {
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  costSource: "local_price_table" | "provider_reported" | "unpriced_model" | "missing_provider_usage";
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  cacheReadUsdPerMillion: number | null;
  cacheWriteUsdPerMillion: number | null;
};

export type Tier2FeatureToolCallDiagnostic = {
  name: string | null;
  argumentKind: "missing" | "string" | "object" | "array" | "null" | "other";
  argumentLength: number | null;
  argumentJsonParseable: boolean | null;
  argumentPreview: string | null;
  argumentTailPreview: string | null;
};

export type Tier2FeatureExtractionAttempt = {
  attemptIndex: number;
  repairRound: number;
  provider: Tier2FeatureExtractionProvider;
  model: string;
  providerAttemptCount: number;
  httpStatus: number | null;
  status:
    | "accepted"
    | "rejected"
    | "provider_failed"
    | "tool_response_parse_failed";
  errorMessage: string | null;
  providerErrorMessage: string | null;
  rawUsage: unknown | null;
  usage: Tier2FeatureExtractionUsage | null;
  toolCallNames: string[];
  toolCallDiagnostics: Tier2FeatureToolCallDiagnostic[];
  rawToolArgs: unknown | null;
  validation: Tier2FeatureExtractionValidation | null;
};

export type Tier2FeatureExtractionVNextArtifact = {
  artifactKind: typeof TIER2_FEATURE_EXTRACTION_ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  runId: string;
  inputPath: string | null;
  outputPath: string | null;
  execute: boolean;
  provider: Tier2FeatureExtractionProvider | null;
  model: string | null;
  promptVersion: typeof TIER2_FEATURE_EXTRACTION_PROMPT_VERSION;
  summary: {
    attemptCount: number;
    acceptedCandidateCount: number;
    rejectedCandidateCount: number;
    validationErrorCount: number;
    finalStatus: "prepared" | "accepted" | "rejected" | "provider_failed" | "tool_response_parse_failed";
    usage: Tier2FeatureExtractionUsage;
  };
  fieldOwnership: {
    llmMustSubmit: Record<string, string[]>;
    deterministicRunnerFields: string[];
    vocabRunnerFields: string[];
  };
  request: Tier2FeatureExtractionRequest;
  submission: Tier2FeatureExtractionToolResponse | null;
  validation: Tier2FeatureExtractionValidation | null;
  attempts: Tier2FeatureExtractionAttempt[];
};

export type RunTier2FeatureExtractionVNextArgs = {
  inputPath?: string;
  outputPath?: string;
  generatedAt?: string;
  runId?: string;
  execute?: boolean;
  provider?: Tier2FeatureExtractionProvider;
  model?: string;
  maxTokens?: number;
  maxRepairRounds?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  pioneerApiKey?: string;
  fetcher?: FetchLike;
  waitForProviderSlot?: () => Promise<void>;
  providerCaller?: Tier2FeatureExtractionProviderCaller;
};

type UsagePrice = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cacheReadUsdPerMillion: number;
  cacheWriteUsdPerMillion: number;
};

const MODEL_PRICES: Record<string, UsagePrice> = {
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

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numericField(record: Record<string, unknown> | null, key: string): number {
  if (record === null) return 0;
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numericFieldOrNull(record: Record<string, unknown> | null, key: string): number | null {
  if (record === null) return null;
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function usageRecord(body: unknown): Record<string, unknown> | null {
  return recordOrNull(recordOrNull(body)?.["usage"]);
}

function toolCallNames(body: unknown): string[] {
  return toolCallDiagnostics(body).flatMap((diagnostic) =>
    diagnostic.name === null ? [] : [diagnostic.name],
  );
}

function argumentKind(value: unknown): Tier2FeatureToolCallDiagnostic["argumentKind"] {
  if (value === undefined) return "missing";
  if (typeof value === "string") return "string";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return "other";
}

function isJsonParseableObject(text: string): boolean {
  try {
    const parsed = JSON.parse(text.trim());
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function previewText(value: string, fromTail = false): string {
  const limit = 500;
  return fromTail && value.length > limit ? value.slice(-limit) : value.slice(0, limit);
}

function toolCallDiagnostics(body: unknown): Tier2FeatureToolCallDiagnostic[] {
  const root = recordOrNull(body);
  const choices = Array.isArray(root?.["choices"]) ? root["choices"] : [];
  const diagnostics: Tier2FeatureToolCallDiagnostic[] = [];
  for (const choice of choices) {
    const message = recordOrNull(recordOrNull(choice)?.["message"]);
    const candidateLists = [message?.["tool_calls"], message?.["toolCalls"]];
    for (const candidateList of candidateLists) {
      if (!Array.isArray(candidateList)) continue;
      for (const toolCall of candidateList) {
        const record = recordOrNull(toolCall);
        const fn = recordOrNull(record?.["function"]);
        const name = fn?.["name"] ?? record?.["name"] ?? record?.["toolName"];
        const args = fn?.["arguments"] ?? record?.["arguments"] ?? record?.["input"];
        const argsKind = argumentKind(args);
        const stringArgs = typeof args === "string" ? args : null;
        diagnostics.push({
          name: typeof name === "string" && name.length > 0 ? name : null,
          argumentKind: argsKind,
          argumentLength: stringArgs === null ? null : stringArgs.length,
          argumentJsonParseable:
            stringArgs === null ? (argsKind === "object" ? true : null) : isJsonParseableObject(stringArgs),
          argumentPreview: stringArgs === null ? null : previewText(stringArgs),
          argumentTailPreview: stringArgs === null ? null : previewText(stringArgs, true),
        });
      }
    }
  }
  return diagnostics;
}

function providerReportedCostUsd(body: unknown): number | null {
  const root = recordOrNull(body);
  const usage = usageRecord(body);
  return (
    numericFieldOrNull(usage, "cost_usd") ??
    numericFieldOrNull(usage, "estimated_cost_usd") ??
    numericFieldOrNull(usage, "total_cost_usd") ??
    numericFieldOrNull(usage, "cost") ??
    numericFieldOrNull(root, "cost_usd") ??
    numericFieldOrNull(root, "estimated_cost_usd") ??
    numericFieldOrNull(root, "total_cost_usd") ??
    numericFieldOrNull(root, "cost")
  );
}

function estimateUsage(input: {
  provider: Tier2FeatureExtractionProvider;
  model: string;
  body: unknown;
}): Tier2FeatureExtractionUsage | null {
  const usage = usageRecord(input.body);
  if (usage === null) return null;
  const details = recordOrNull(usage["prompt_tokens_details"]) ?? {};
  const promptTokens = numericField(usage, "prompt_tokens") || numericField(usage, "input_tokens");
  const completionTokens =
    numericField(usage, "completion_tokens") || numericField(usage, "output_tokens");
  const cacheReadTokens =
    numericField(usage, "cache_read_tokens") + numericField(details, "cached_tokens");
  const cacheWriteTokens =
    numericField(usage, "cache_write_tokens") + numericField(details, "cache_write_tokens");
  const totalTokens =
    numericField(usage, "total_tokens") ||
    promptTokens + completionTokens + cacheReadTokens + cacheWriteTokens;
  const providerCost = providerReportedCostUsd(input.body);
  if (providerCost !== null) {
    return {
      promptTokens,
      completionTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalTokens,
      estimatedCostUsd: roundCost(providerCost),
      costSource: "provider_reported",
      inputUsdPerMillion: null,
      outputUsdPerMillion: null,
      cacheReadUsdPerMillion: null,
      cacheWriteUsdPerMillion: null,
    };
  }
  const price = MODEL_PRICES[`${input.provider}:${input.model}`];
  if (price === undefined) {
    return {
      promptTokens,
      completionTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalTokens,
      estimatedCostUsd: null,
      costSource: "unpriced_model",
      inputUsdPerMillion: null,
      outputUsdPerMillion: null,
      cacheReadUsdPerMillion: null,
      cacheWriteUsdPerMillion: null,
    };
  }
  const billablePromptTokens = Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens);
  return {
    promptTokens,
    completionTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    estimatedCostUsd: roundCost(
      (billablePromptTokens * price.inputUsdPerMillion +
        completionTokens * price.outputUsdPerMillion +
        cacheReadTokens * price.cacheReadUsdPerMillion +
        cacheWriteTokens * price.cacheWriteUsdPerMillion) /
        1_000_000,
    ),
    costSource: "local_price_table",
    ...price,
  };
}

function emptyUsage(costSource: Tier2FeatureExtractionUsage["costSource"] = "missing_provider_usage"): Tier2FeatureExtractionUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: null,
    costSource,
    inputUsdPerMillion: null,
    outputUsdPerMillion: null,
    cacheReadUsdPerMillion: null,
    cacheWriteUsdPerMillion: null,
  };
}

function aggregateUsage(attempts: Tier2FeatureExtractionAttempt[]): Tier2FeatureExtractionUsage {
  const usages = attempts.flatMap((attempt) => (attempt.usage === null ? [] : [attempt.usage]));
  if (usages.length === 0) return emptyUsage();
  const costKnown = usages.every((usage) => usage.estimatedCostUsd !== null);
  const costSources = new Set(usages.map((usage) => usage.costSource));
  return {
    promptTokens: usages.reduce((sum, usage) => sum + usage.promptTokens, 0),
    completionTokens: usages.reduce((sum, usage) => sum + usage.completionTokens, 0),
    cacheReadTokens: usages.reduce((sum, usage) => sum + usage.cacheReadTokens, 0),
    cacheWriteTokens: usages.reduce((sum, usage) => sum + usage.cacheWriteTokens, 0),
    totalTokens: usages.reduce((sum, usage) => sum + usage.totalTokens, 0),
    estimatedCostUsd: costKnown
      ? roundCost(usages.reduce((sum, usage) => sum + (usage.estimatedCostUsd ?? 0), 0))
      : null,
    costSource:
      costSources.size === 1 && costSources.has("local_price_table")
        ? "local_price_table"
        : costSources.size === 1 && costSources.has("provider_reported")
          ? "provider_reported"
          : "unpriced_model",
    inputUsdPerMillion: null,
    outputUsdPerMillion: null,
    cacheReadUsdPerMillion: null,
    cacheWriteUsdPerMillion: null,
  };
}

function buildMessages(input: {
  request: Tier2FeatureExtractionRequest;
  repairRound: number;
  repairFeedback: unknown[];
}): ToolCallMessage[] {
  const limits = input.request.extractionLimits;
  const hasSourceSearchTranscripts = input.request.sourceSearchTranscriptHandles.length > 0;
  const system = [
    "You are the Tier 2 vNext feature extraction agent for Bus Priority Impact Studio.",
    "Call the forced tool exactly once.",
    "Use only the strict feature-family arrays in the tool schema; never create rawPayload or freeform taxonomy keys.",
    "The request extractionLimits are hard caps, not quotas. Submit fewer candidates when source support is weak.",
    `Never submit more than ${limits.totalCandidates} total candidates in this request.`,
    `Per-family caps: routeScopeCandidates=${limits.routeScopeCandidates}, dateStatusCandidates=${limits.dateStatusCandidates}, interventionTreatmentCandidates=${limits.interventionTreatmentCandidates}, timelineEventCandidates=${limits.timelineEventCandidates}, metricClaimCandidates=${limits.metricClaimCandidates}, tableObservations=${limits.tableObservations}, sourceStatementClaims=${limits.sourceStatementClaims}, sourceGapCandidates=${limits.sourceGapCandidates}, costValueCandidates=${limits.costValueCandidates}, serviceDeliveryClaims=${limits.serviceDeliveryClaims}, ridershipDemandClaims=${limits.ridershipDemandClaims}, geographicContextClaims=${limits.geographicContextClaims}, relationCandidates=${limits.relationCandidates}.`,
    "Extract source-backed document facts for route/timeline/intervention inventories, evidence cards, detector context, cost packets, service-delivery packets, ridership-demand packets, geographic context, and source gaps.",
    "Avoid legend-only rows, map labels, generic table cells, duplicate route mentions, and facts without direct bus-priority relevance.",
    "Tier 2 extracts public-document facts and claims only. Do not compute speeds, ridership exposure, effect sizes, GTFS comparisons, route-area allocation, or causal estimates.",
    "For metric claims, extract only source-stated numeric or directional values. Preserve valueRaw, unitRaw, metricLabelRaw, subjectRaw, period/comparison wording, comparator/direction wording, authority, publication wording, caveats, and denominators when source-stated.",
    "Omit retail, parking, taxi, all-vehicle, or general economic metrics unless the source directly connects them to bus priority, bus service, transit riders, or a requested source-gap/cost/geographic packet.",
    "Do not submit normalized vocabulary guesses such as signal_priority, bus_lane, curb_management, bus_speed, route_family, cost_type, or ridership_family. Submit raw wording that appears in source evidence; the runner resolves vocabulary.",
    "Do not infer installed TSP from speed changes. Extract TSP only when the source states signal priority/signal timing/queue-jump signal facts, or when a provided transcript proves a bounded public-source gap.",
    "lookupResults, routeLookupRequests, routeUniverse, and priorContext are resolver context only. They are not source evidence and cannot be cited in evidenceByField.",
    "Omit optional fields when unknown. Never submit an empty string for an optional field.",
    "Every source-observed field you submit must have evidenceByField. Map semantic field paths to supplied handles, for example {\"metricClaim.valueRaw\":[\"p13.table2.r04.c05\"]}.",
    "Use evidenceByField for rawText and for each submitted raw source field. Prefer handles over copying quote text. Do not submit fieldSupport.",
    "Every evidenceByField key must end with an actual field you included on that same candidate. If you submit areaTextRaw, prove areaTextRaw; do not prove a different omitted field such as geographyRaw.",
    "Do not submit duplicate routeScopeCandidates for the same route/corridor unless the source states materially different scope fields and every submitted field has its own evidenceByField entry.",
    "Evidence handles may come from request.evidenceHandles. Source-gap evidence may also use request.sourceSearchTranscriptHandles when supplied.",
    hasSourceSearchTranscripts
      ? "Source-gap candidates are allowed only when they cite a supplied sourceSearchTranscriptHandles.searchTranscriptHandle."
      : "Do not submit sourceGapCandidates in this request; no source-search transcript handles were supplied.",
    "Metric claims must include metricLabelRaw, valueRaw, unitRaw, subjectRaw, and evidenceByField for each of those fields. Include sourceClaimAuthority and publicationWordingGate only when the provided evidence states that wording.",
    "SourceStatementClaims must include statementTextRaw and evidenceByField. Include sourceClaimAuthority and publicationWordingGate only when the provided evidence states that wording.",
    "Use relationCandidates only to link observations you submitted in this same tool response, and prove the relation with relationTextRaw evidence.",
    `Keep notes absent unless needed; notes are limited to ${limits.notesChars} characters.`,
  ].join("\n");
  const payload = {
    request: input.request,
    fieldOwnership: {
      llmMustSubmit: LLM_SUBMITTED_FIELD_SETS,
      deterministicRunnerFields: DETERMINISTIC_RUNNER_FIELDS,
      vocabRunnerFields: VOCAB_RUNNER_FIELDS,
    },
    repairRound: input.repairRound,
    repairFeedback: input.repairFeedback,
  };
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `Extract strict Tier 2 feature candidates from this source context.\n\n${JSON.stringify(payload, null, 2)}`,
    },
  ];
}

async function readRequest(path: string | undefined, generatedAt: string | undefined, runId: string | undefined) {
  if (path === undefined) {
    return defaultTier2FeatureSmokeRequest({
      ...(generatedAt === undefined ? {} : { generatedAt }),
      ...(runId === undefined ? {} : { runId }),
    });
  }
  const raw = await Bun.file(fromCliPath(path)).json();
  return Tier2FeatureExtractionRequestSchema.parse(raw);
}

const callProvider: Tier2FeatureExtractionProviderCaller = async (input) => {
  return callPioneerToolCallViaPi({
    apiKey: input.apiKey,
    model: input.model,
    maxTokens: input.maxTokens,
    toolName: TIER2_FEATURE_EXTRACTION_TOOL_NAME,
    messages: input.messages,
    tools: [tier2FeatureExtractionTool()],
    timeoutMs: input.timeoutMs,
    ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
    ...(input.fetcher === undefined ? {} : { fetcher: input.fetcher }),
  });
};

function preparedArtifact(input: {
  request: Tier2FeatureExtractionRequest;
  generatedAt: string;
  runId: string;
  inputPath: string | null;
  outputPath: string | null;
}): Tier2FeatureExtractionVNextArtifact {
  return {
    artifactKind: TIER2_FEATURE_EXTRACTION_ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    runId: input.runId,
    inputPath: input.inputPath,
    outputPath: input.outputPath,
    execute: false,
    provider: null,
    model: null,
    promptVersion: TIER2_FEATURE_EXTRACTION_PROMPT_VERSION,
    summary: {
      attemptCount: 0,
      acceptedCandidateCount: 0,
      rejectedCandidateCount: 0,
      validationErrorCount: 0,
      finalStatus: "prepared",
      usage: emptyUsage(),
    },
    fieldOwnership: {
      llmMustSubmit: LLM_SUBMITTED_FIELD_SETS,
      deterministicRunnerFields: DETERMINISTIC_RUNNER_FIELDS,
      vocabRunnerFields: VOCAB_RUNNER_FIELDS,
    },
    request: input.request,
    submission: null,
    validation: null,
    attempts: [],
  };
}

export async function runTier2FeatureExtractionVNext(
  args: RunTier2FeatureExtractionVNextArgs,
): Promise<Tier2FeatureExtractionVNextArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const request = await readRequest(args.inputPath, generatedAt, args.runId);
  const runId = args.runId ?? request.runId ?? "tier2-feature-vnext-smoke";
  const inputPath = args.inputPath === undefined ? null : fromCliPath(args.inputPath);
  const outputPath = args.outputPath === undefined ? null : fromCliPath(args.outputPath);
  const execute = args.execute === true;
  if (!execute) {
    const artifact = preparedArtifact({ request, generatedAt, runId, inputPath, outputPath });
    if (outputPath !== null) {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
    }
    return artifact;
  }

  const provider = args.provider ?? DEFAULT_TIER2_FEATURE_SMOKE_PROVIDER;
  const model = args.model ?? DEFAULT_TIER2_FEATURE_SMOKE_MODEL;
  const maxTokens = args.maxTokens ?? DEFAULT_TIER2_FEATURE_SMOKE_MAX_TOKENS;
  const maxRepairRounds = args.maxRepairRounds ?? DEFAULT_TIER2_FEATURE_SMOKE_MAX_REPAIR_ROUNDS;
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIER2_FEATURE_SMOKE_TIMEOUT_MS;
  const apiKey = args.pioneerApiKey ?? process.env["PIONEER_API_KEY"];
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new Error("PIONEER_API_KEY is required for docs tier2 feature-smoke --execute.");
  }

  const attempts: Tier2FeatureExtractionAttempt[] = [];
  let repairFeedback: unknown[] = [];
  let finalValidation: Tier2FeatureExtractionValidation | null = null;
  let finalSubmission: Tier2FeatureExtractionToolResponse | null = null;
  let finalStatus: Tier2FeatureExtractionVNextArtifact["summary"]["finalStatus"] = "rejected";
  const providerCaller = args.providerCaller ?? callProvider;

  for (let repairRound = 0; repairRound <= maxRepairRounds; repairRound += 1) {
    await args.waitForProviderSlot?.();
    const providerResult = await providerCaller({
      apiKey,
      model,
      maxTokens,
      timeoutMs,
      ...(args.maxAttempts === undefined ? {} : { maxAttempts: args.maxAttempts }),
      messages: buildMessages({ request, repairRound, repairFeedback }),
      ...(args.fetcher === undefined ? {} : { fetcher: args.fetcher }),
    });
    const providerErrorMessage = openRouterErrorMessage(providerResult.body);
    if (!providerResult.response.ok) {
      const usage = estimateUsage({ provider, model, body: providerResult.body });
      finalStatus = "provider_failed";
      attempts.push({
        attemptIndex: attempts.length + 1,
        repairRound,
        provider,
        model,
        providerAttemptCount: providerResult.attempts?.length ?? 1,
        httpStatus: providerResult.response.status,
        status: "provider_failed",
        errorMessage: providerErrorMessage ?? providerResult.response.statusText,
        providerErrorMessage,
        rawUsage: usageRecord(providerResult.body),
        usage,
        toolCallNames: toolCallNames(providerResult.body),
        toolCallDiagnostics: toolCallDiagnostics(providerResult.body),
        rawToolArgs: null,
        validation: null,
      });
      break;
    }

    const rawToolArgs = extractToolCallArguments(providerResult.body, TIER2_FEATURE_EXTRACTION_TOOL_NAME);
    if (rawToolArgs === null) {
      const usage = estimateUsage({ provider, model, body: providerResult.body });
      const errorMessage = missingToolCallErrorMessage({
        responseJson: providerResult.body,
        toolName: TIER2_FEATURE_EXTRACTION_TOOL_NAME,
        maxTokens,
      });
      finalStatus = "tool_response_parse_failed";
      attempts.push({
        attemptIndex: attempts.length + 1,
        repairRound,
        provider,
        model,
        providerAttemptCount: providerResult.attempts?.length ?? 1,
        httpStatus: providerResult.response.status,
        status: "tool_response_parse_failed",
        errorMessage,
        providerErrorMessage: null,
        rawUsage: usageRecord(providerResult.body),
        usage,
        toolCallNames: toolCallNames(providerResult.body),
        toolCallDiagnostics: toolCallDiagnostics(providerResult.body),
        rawToolArgs,
        validation: null,
      });
      repairFeedback = [{ kind: "missing_forced_tool_call", message: errorMessage }];
      continue;
    }

    const validation = validateTier2FeatureExtractionSubmission({ request, submission: rawToolArgs });
    const usage = estimateUsage({ provider, model, body: providerResult.body });
    finalValidation = validation;
    finalSubmission = validation.parsedSubmission;
    finalStatus =
      validation.rejectedCandidateCount === 0 &&
      validation.validationErrorCount === 0 &&
      validation.toolShapeValid
        ? "accepted"
        : "rejected";
    attempts.push({
      attemptIndex: attempts.length + 1,
      repairRound,
      provider,
      model,
      providerAttemptCount: providerResult.attempts?.length ?? 1,
      httpStatus: providerResult.response.status,
      status: finalStatus === "accepted" ? "accepted" : "rejected",
      errorMessage: validation.validationErrorCount === 0 ? null : "Feature validation returned blocking errors.",
      providerErrorMessage: null,
      rawUsage: usageRecord(providerResult.body),
      usage,
      toolCallNames: toolCallNames(providerResult.body),
      toolCallDiagnostics: toolCallDiagnostics(providerResult.body),
      rawToolArgs,
      validation,
    });
    if (finalStatus === "accepted") break;
    repairFeedback = retryFeedbackForFeatureValidation(validation);
  }

  const summary = {
    attemptCount: attempts.length,
    acceptedCandidateCount: finalValidation?.acceptedCandidateCount ?? 0,
    rejectedCandidateCount: finalValidation?.rejectedCandidateCount ?? 0,
    validationErrorCount: finalValidation?.validationErrorCount ?? 0,
    finalStatus,
    usage: aggregateUsage(attempts),
  };

  const artifact: Tier2FeatureExtractionVNextArtifact = {
    artifactKind: TIER2_FEATURE_EXTRACTION_ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt,
    runId,
    inputPath,
    outputPath,
    execute: true,
    provider,
    model,
    promptVersion: TIER2_FEATURE_EXTRACTION_PROMPT_VERSION,
    summary,
    fieldOwnership: {
      llmMustSubmit: LLM_SUBMITTED_FIELD_SETS,
      deterministicRunnerFields: DETERMINISTIC_RUNNER_FIELDS,
      vocabRunnerFields: VOCAB_RUNNER_FIELDS,
    },
    request,
    submission: finalSubmission,
    validation: finalValidation,
    attempts,
  };

  if (outputPath !== null) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
  }
  return artifact;
}

export async function runTier2FeatureExtractionSmoke(
  args: RunTier2FeatureExtractionVNextArgs,
): Promise<{ artifact: Tier2FeatureExtractionVNextArtifact; outputPath: string }> {
  const outputPath = fromCliPath(
    args.outputPath ??
      join(defaultArtifactRootPath(), "docs", "tier2-feature-vnext-smoke", "feature-smoke.json"),
  );
  const artifact = await runTier2FeatureExtractionVNext({ ...args, outputPath });
  return { artifact, outputPath };
}
