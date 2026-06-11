import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../../lib/paths.ts";
import {
  DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS,
  DEFAULT_TIER2_FEATURE_SMOKE_MAX_REPAIR_ROUNDS,
  DEFAULT_TIER2_FEATURE_SMOKE_MAX_TOKENS,
  DEFAULT_TIER2_FEATURE_SMOKE_MODEL,
  DEFAULT_TIER2_FEATURE_SMOKE_PROVIDER,
  DEFAULT_TIER2_FEATURE_SMOKE_TIMEOUT_MS,
  Tier2FeatureExtractionRequestSchema,
  type Tier2FeatureExtractionRequest,
} from "./contract.ts";
import { evaluateTier2FeaturePromotionGate } from "./promotion-gate.ts";
import {
  runTier2FeatureExtractionVNext,
  type RunTier2FeatureExtractionVNextArgs,
  type Tier2FeatureExtractionUsage,
  type Tier2FeatureExtractionVNextArtifact,
} from "./runner.ts";
import type { JsonRecord, Tier2FeatureProofLedgerArtifact } from "./types.ts";
import { runTier2FeatureProofLedgerFromVNext } from "./vnext-proof-adapter.ts";
import { runTier2FeatureProofLedgerVocabResolver } from "./vocab-resolver.ts";

export const FEATURE_CANARY_RUN_ARTIFACT_KIND = "bp.tier2_feature_canary_run.v1" as const;

export type Tier2FeatureCanaryRunArgs = {
  manifestPath?: string;
  requestPaths?: string[];
  outputRoot?: string;
  sampleSize?: number;
  seed?: string;
  concurrency?: number;
  rateLimitPerMinute?: number;
  execute?: boolean;
  provider?: typeof DEFAULT_TIER2_FEATURE_SMOKE_PROVIDER;
  model?: string;
  maxTokens?: number;
  maxRepairRounds?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  pioneerApiKey?: string;
  generatedAt?: string;
  runId?: string;
  vocabApplicationPath?: string;
  includePriorContext?: boolean;
  maxPriorContextChars?: number;
  minAcceptedRunRate?: number;
  maxPublishableWithoutProof?: number;
  fetcher?: RunTier2FeatureExtractionVNextArgs["fetcher"];
  providerCaller?: RunTier2FeatureExtractionVNextArgs["providerCaller"];
};

type CanaryWindow = {
  windowId: string;
  sourceId: string | null;
  pageNumbers: number[];
  requestPath: string;
  sourceManifestPath: string | null;
};

type CanaryWindowResult = {
  windowId: string;
  requestPath: string;
  vnextRequestPath: string;
  extractionArtifactPath: string;
  finalStatus: Tier2FeatureExtractionVNextArtifact["summary"]["finalStatus"];
  acceptedCandidateCount: number;
  rejectedCandidateCount: number;
  validationErrorCount: number;
  attemptCount: number;
  usage: Tier2FeatureExtractionUsage;
};

type CanaryCheck = {
  code: string;
  passed: boolean;
  observed: number | boolean;
  threshold: number | boolean;
  message: string;
};

export type Tier2FeatureCanaryRunArtifact = {
  artifactKind: typeof FEATURE_CANARY_RUN_ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  runId: string;
  execute: boolean;
  provider: string | null;
  model: string | null;
  input: {
    manifestPath: string | null;
    requestPaths: string[];
    sampleSize: number;
    seed: string;
    concurrency: number;
    rateLimitPerMinute: number | null;
    vocabApplicationPath: string | null;
    includePriorContext: boolean;
    maxPriorContextChars: number | null;
  };
  outputRoot: string;
  summary: {
    sampledWindowCount: number;
    completedWindowCount: number;
    acceptedRunCount: number;
    acceptedRunRate: number;
    rejectedRunCount: number;
    providerFailedRunCount: number;
    toolParseFailedRunCount: number;
    totalAcceptedCandidateCount: number;
    totalRejectedCandidateCount: number;
    totalValidationErrorCount: number;
    proofLedgerPath: string;
    resolvedProofLedgerPath: string | null;
    promotionGatePath: string;
    promotionGatePassed: boolean;
    publishableFieldWithoutProofCount: number;
    publishableFieldCount: number;
    verifiedFieldCount: number;
    validationErrorCountAfterProof: number;
    usage: Tier2FeatureExtractionUsage;
    verdict: "prepared" | "passed" | "failed";
  };
  checks: CanaryCheck[];
  windows: CanaryWindowResult[];
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "number" && Number.isFinite(item) ? [item] : []))
    : [];
}

function stableHash(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 140) || "window";
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function emptyUsage(): Tier2FeatureExtractionUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    costSource: "local_price_table",
    inputUsdPerMillion: null,
    outputUsdPerMillion: null,
    cacheReadUsdPerMillion: null,
    cacheWriteUsdPerMillion: null,
  };
}

function aggregateUsage(usages: Tier2FeatureExtractionUsage[]): Tier2FeatureExtractionUsage {
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
      ? round(usages.reduce((sum, usage) => sum + (usage.estimatedCostUsd ?? 0), 0))
      : null,
    costSource:
      costSources.size === 1 && costSources.has("local_price_table")
        ? "local_price_table"
        : costSources.size === 1 && costSources.has("provider_reported")
          ? "provider_reported"
          : costSources.size === 1 && costSources.has("missing_provider_usage")
            ? "missing_provider_usage"
            : "unpriced_model",
    inputUsdPerMillion: null,
    outputUsdPerMillion: null,
    cacheReadUsdPerMillion: null,
    cacheWriteUsdPerMillion: null,
  };
}

function evidenceHandleForVNext(value: unknown): unknown | null {
  if (!isRecord(value)) return null;
  const evidenceHandle = stringValue(value["evidenceHandle"]);
  const sourceId = stringValue(value["sourceId"]);
  const quoteText = stringValue(value["quoteText"]);
  const text = stringValue(value["text"]);
  if (evidenceHandle === null || sourceId === null || (quoteText === null && text === null)) return null;
  return {
    evidenceHandle,
    sourceId,
    ...(typeof value["pageNumber"] === "number" ? { pageNumber: value["pageNumber"] } : {}),
    ...(stringValue(value["blockId"]) === null ? {} : { blockId: stringValue(value["blockId"]) }),
    ...(quoteText === null ? {} : { quoteText }),
    ...(text === null ? {} : { text }),
  };
}

function routeLookupRequestForVNext(value: unknown): unknown | null {
  if (!isRecord(value)) return null;
  const text = stringValue(value["text"]) ?? stringValue(value["query"]) ?? stringValue(value["rawText"]);
  if (text === null) return null;
  return {
    ...(stringValue(value["lookupHandle"]) === null ? {} : { lookupHandle: stringValue(value["lookupHandle"]) }),
    text,
  };
}

function boundedJsonArray(value: unknown, maxChars: number | null): unknown[] {
  if (!Array.isArray(value)) return [];
  if (maxChars === null) return value;
  if (maxChars <= 0) return [];
  const result: unknown[] = [];
  let usedChars = 2;
  for (const item of value) {
    const serialized = JSON.stringify(item);
    const nextChars = usedChars + serialized.length + (result.length === 0 ? 0 : 1);
    if (nextChars > maxChars) break;
    result.push(item);
    usedChars = nextChars;
  }
  return result;
}

function canaryPriorContext(input: {
  raw: unknown;
  includePriorContext: boolean;
  maxPriorContextChars: number | null;
}): unknown[] {
  if (!input.includePriorContext || !isRecord(input.raw)) return [];
  return boundedJsonArray(input.raw["priorContext"], input.maxPriorContextChars);
}

function sourceForVNext(value: unknown): Tier2FeatureExtractionRequest["source"] {
  if (!isRecord(value)) throw new Error("Agentic request source is not an object.");
  const sourceId = stringValue(value["sourceId"]);
  const sourceTitle = stringValue(value["sourceTitle"]);
  const sourceGroup = stringValue(value["sourceGroup"]);
  const pageNumbers = numberArray(value["pageNumbers"]);
  if (sourceId === null || sourceTitle === null || pageNumbers.length === 0) {
    throw new Error("Agentic request source is missing sourceId, sourceTitle, or pageNumbers.");
  }
  return {
    sourceId,
    sourceTitle,
    ...(sourceGroup === null ? {} : { sourceGroup }),
    pageNumbers,
  };
}

function vNextRequestFromAgenticRequest(input: {
  raw: unknown;
  generatedAt: string;
  runId: string;
  includePriorContext: boolean;
  maxPriorContextChars: number | null;
}): Tier2FeatureExtractionRequest {
  if (!isRecord(input.raw)) throw new Error("Agentic request is not an object.");
  const source = sourceForVNext(input.raw["source"]);
  const evidenceHandles = Array.isArray(input.raw["evidenceHandles"])
    ? input.raw["evidenceHandles"].flatMap((item) => evidenceHandleForVNext(item) ?? [])
    : [];
  if (evidenceHandles.length === 0) {
    throw new Error(`No vNext-compatible evidenceHandles for ${source.sourceId}:${source.pageNumbers.join(",")}.`);
  }
  const sourceRecord = isRecord(input.raw["source"]) ? input.raw["source"] : {};
  const request = {
    schemaVersion: 1,
    runId: input.runId,
    generatedAt: input.generatedAt,
    source,
    sourcePacketHash:
      stringValue(sourceRecord["sourceContentHash"]) ??
      stringValue(sourceRecord["markdownHash"]) ??
      stableHash([source.sourceId, source.pageNumbers, evidenceHandles]),
    evidenceHandles,
    lookupResults: Array.isArray(input.raw["lookupResults"]) ? input.raw["lookupResults"] : [],
    routeLookupRequests: Array.isArray(input.raw["routeLookupRequests"])
      ? input.raw["routeLookupRequests"].flatMap((item) => routeLookupRequestForVNext(item) ?? [])
      : [],
    routeUniverse: Array.isArray(input.raw["routeUniverse"])
      ? input.raw["routeUniverse"].flatMap((item) => (typeof item === "string" ? [item] : []))
      : [],
    priorContext: canaryPriorContext({
      raw: input.raw,
      includePriorContext: input.includePriorContext,
      maxPriorContextChars: input.maxPriorContextChars,
    }),
    extractionLimits: DEFAULT_TIER2_FEATURE_EXTRACTION_LIMITS,
    instructions:
      "Sampled Tier 2 vNext canary. Extract only feature candidates directly supported by evidenceHandles. Resolver context is not evidence.",
  };
  return Tier2FeatureExtractionRequestSchema.parse(request);
}

async function readWindowsFromManifest(path: string): Promise<CanaryWindow[]> {
  const manifestPath = fromCliPath(path);
  const raw = await Bun.file(manifestPath).json();
  if (!isRecord(raw)) throw new Error(`Manifest is not an object: ${manifestPath}`);
  const windows = Array.isArray(raw["windows"]) ? raw["windows"] : [];
  return windows.flatMap((item): CanaryWindow[] => {
    if (!isRecord(item)) return [];
    const requestPath = stringValue(item["requestPath"]);
    if (requestPath === null) return [];
    return [
      {
        windowId: stringValue(item["windowId"]) ?? requestPath,
        sourceId: stringValue(item["sourceId"]),
        pageNumbers: numberArray(item["pageNumbers"]),
        requestPath: fromCliPath(requestPath),
        sourceManifestPath: manifestPath,
      },
    ];
  });
}

function windowsFromRequestPaths(paths: string[]): CanaryWindow[] {
  return paths.map((path) => {
    const requestPath = fromCliPath(path);
    return {
      windowId: requestPath,
      sourceId: null,
      pageNumbers: [],
      requestPath,
      sourceManifestPath: null,
    };
  });
}

function sampleWindows(input: {
  windows: CanaryWindow[];
  sampleSize: number;
  seed: string;
}): CanaryWindow[] {
  return [...input.windows]
    .sort((left, right) =>
      stableHash([input.seed, left.windowId, left.requestPath]).localeCompare(
        stableHash([input.seed, right.windowId, right.requestPath]),
      ),
    )
    .slice(0, input.sampleSize)
    .sort((left, right) => left.windowId.localeCompare(right.windowId));
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index] as T, index);
      }
    }),
  );
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startRateLimiter(rateLimitPerMinute: number | null): (() => Promise<void>) | null {
  if (rateLimitPerMinute === null || rateLimitPerMinute <= 0) return null;
  const intervalMs = Math.ceil(60_000 / rateLimitPerMinute);
  let nextStartMs = Date.now();
  return async () => {
    const now = Date.now();
    const scheduledStartMs = Math.max(now, nextStartMs);
    nextStartMs = scheduledStartMs + intervalMs;
    const waitMs = scheduledStartMs - now;
    if (waitMs > 0) await sleep(waitMs);
  };
}

function statusCount(windows: CanaryWindowResult[], status: Tier2FeatureExtractionVNextArtifact["summary"]["finalStatus"]) {
  return windows.filter((window) => window.finalStatus === status).length;
}

function canaryChecks(input: {
  execute: boolean;
  acceptedRunRate: number;
  minAcceptedRunRate: number;
  publishableFieldWithoutProofCount: number;
  maxPublishableWithoutProof: number;
  promotionGatePassed: boolean;
}): CanaryCheck[] {
  if (!input.execute) {
    return [
      {
        code: "prepared_only",
        passed: true,
        observed: true,
        threshold: true,
        message: "Canary was prepared without live LLM execution; validity checks require --execute.",
      },
    ];
  }
  return [
    {
      code: "accepted_run_rate",
      passed: input.acceptedRunRate >= input.minAcceptedRunRate,
      observed: input.acceptedRunRate,
      threshold: input.minAcceptedRunRate,
      message: "Share of sampled windows whose final extraction status was accepted.",
    },
    {
      code: "publishable_without_proof",
      passed: input.publishableFieldWithoutProofCount <= input.maxPublishableWithoutProof,
      observed: input.publishableFieldWithoutProofCount,
      threshold: input.maxPublishableWithoutProof,
      message: "No public/detector/causal/brief feature may be publishable without proof.",
    },
    {
      code: "promotion_gate",
      passed: input.promotionGatePassed,
      observed: input.promotionGatePassed,
      threshold: true,
      message: "Promotion gate over the sampled proof ledger must pass.",
    },
  ];
}

export async function runTier2FeatureCanary(args: Tier2FeatureCanaryRunArgs): Promise<{
  artifact: Tier2FeatureCanaryRunArtifact;
  outputPath: string;
}> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const runId = args.runId ?? `tier2-feature-canary-${generatedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
  const outputRoot = fromCliPath(
    args.outputRoot ?? join(defaultArtifactRootPath(), "docs", "tier2-feature-canary", runId),
  );
  const seed = args.seed ?? runId;
  const concurrency = args.concurrency ?? 4;
  const manifestWindows = args.manifestPath === undefined ? [] : await readWindowsFromManifest(args.manifestPath);
  const pathWindows = args.requestPaths === undefined ? [] : windowsFromRequestPaths(args.requestPaths);
  const allWindows = [...manifestWindows, ...pathWindows];
  if (allWindows.length === 0) {
    throw new Error("Tier 2 feature canary requires --manifest-path or --request-paths.");
  }
  const sampleSize = Math.min(args.sampleSize ?? allWindows.length, allWindows.length);
  const sampledWindows = sampleWindows({ windows: allWindows, sampleSize, seed });
  const execute = args.execute === true;
  const rateLimitPerMinute = args.rateLimitPerMinute ?? null;
  const waitForRateLimit = startRateLimiter(execute ? rateLimitPerMinute : null);
  const includePriorContext = args.includePriorContext === true;
  const maxPriorContextChars = includePriorContext ? args.maxPriorContextChars ?? 12_000 : 0;
  const extractionRoot = join(outputRoot, "extractions");
  const requestRoot = join(outputRoot, "requests");
  await mkdir(requestRoot, { recursive: true });
  await mkdir(extractionRoot, { recursive: true });

  const provider = args.provider ?? DEFAULT_TIER2_FEATURE_SMOKE_PROVIDER;
  const model = args.model ?? DEFAULT_TIER2_FEATURE_SMOKE_MODEL;
  const windowResults = await mapConcurrent(sampledWindows, concurrency, async (window, index) => {
    const rawRequest = await Bun.file(window.requestPath).json();
    const windowSlug = `${String(index + 1).padStart(4, "0")}_${slug(window.windowId)}`;
    const vnextRequestPath = join(requestRoot, `${windowSlug}.json`);
    const extractionArtifactPath = join(extractionRoot, `${windowSlug}.json`);
    const windowRunId = `${runId}:${window.windowId}`;
    const vnextRequest = vNextRequestFromAgenticRequest({
      raw: rawRequest,
      generatedAt,
      runId: windowRunId,
      includePriorContext,
      maxPriorContextChars,
    });
    await writeJson(vnextRequestPath, vnextRequest);
    const artifact = await runTier2FeatureExtractionVNext({
      inputPath: vnextRequestPath,
      outputPath: extractionArtifactPath,
      generatedAt,
      runId: windowRunId,
      execute,
      provider,
      model,
      maxTokens: args.maxTokens ?? DEFAULT_TIER2_FEATURE_SMOKE_MAX_TOKENS,
      maxRepairRounds: args.maxRepairRounds ?? DEFAULT_TIER2_FEATURE_SMOKE_MAX_REPAIR_ROUNDS,
      timeoutMs: args.timeoutMs ?? DEFAULT_TIER2_FEATURE_SMOKE_TIMEOUT_MS,
      ...(args.maxAttempts === undefined ? {} : { maxAttempts: args.maxAttempts }),
      ...(args.pioneerApiKey === undefined ? {} : { pioneerApiKey: args.pioneerApiKey }),
      ...(args.fetcher === undefined ? {} : { fetcher: args.fetcher }),
      ...(waitForRateLimit === null ? {} : { waitForProviderSlot: waitForRateLimit }),
      ...(args.providerCaller === undefined ? {} : { providerCaller: args.providerCaller }),
    });
    return {
      windowId: window.windowId,
      requestPath: window.requestPath,
      vnextRequestPath,
      extractionArtifactPath,
      finalStatus: artifact.summary.finalStatus,
      acceptedCandidateCount: artifact.summary.acceptedCandidateCount,
      rejectedCandidateCount: artifact.summary.rejectedCandidateCount,
      validationErrorCount: artifact.summary.validationErrorCount,
      attemptCount: artifact.summary.attemptCount,
      usage: artifact.summary.usage,
    } satisfies CanaryWindowResult;
  });

  const proofLedgerPath = join(outputRoot, "feature-proof-ledger.json");
  const proofLedger = await runTier2FeatureProofLedgerFromVNext({
    vnextArtifactPaths: windowResults.map((window) => window.extractionArtifactPath),
    outputPath: proofLedgerPath,
    generatedAt,
  });
  let finalLedger: Tier2FeatureProofLedgerArtifact = proofLedger.artifact;
  let resolvedProofLedgerPath: string | null = null;
  if (args.vocabApplicationPath !== undefined) {
    resolvedProofLedgerPath = join(outputRoot, "feature-proof-ledger-vocab-resolved.json");
    const resolved = await runTier2FeatureProofLedgerVocabResolver({
      proofLedgerPath,
      vocabApplicationPath: args.vocabApplicationPath,
      outputPath: resolvedProofLedgerPath,
      generatedAt,
    });
    finalLedger = resolved.artifact;
  }
  const promotionGatePath = join(outputRoot, "feature-promotion-gate.json");
  const promotionGate = evaluateTier2FeaturePromotionGate({
    ledger: finalLedger,
    sourceLedgerPath: resolvedProofLedgerPath ?? proofLedgerPath,
    generatedAt,
  });
  await writeJson(promotionGatePath, promotionGate);

  const acceptedRunCount = statusCount(windowResults, "accepted");
  const acceptedRunRate = windowResults.length === 0 ? 0 : round(acceptedRunCount / windowResults.length);
  const checks = canaryChecks({
    execute,
    acceptedRunRate,
    minAcceptedRunRate: args.minAcceptedRunRate ?? 0.9,
    publishableFieldWithoutProofCount: finalLedger.summary.publishableFieldWithoutProofCount,
    maxPublishableWithoutProof: args.maxPublishableWithoutProof ?? 0,
    promotionGatePassed: promotionGate.passed,
  });
  const verdict = execute ? (checks.every((check) => check.passed) ? "passed" : "failed") : "prepared";
  const artifact: Tier2FeatureCanaryRunArtifact = {
    artifactKind: FEATURE_CANARY_RUN_ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt,
    runId,
    execute,
    provider: execute ? provider : null,
    model: execute ? model : null,
    input: {
      manifestPath: args.manifestPath === undefined ? null : fromCliPath(args.manifestPath),
      requestPaths: args.requestPaths?.map((path) => fromCliPath(path)) ?? [],
      sampleSize,
      seed,
      concurrency,
      rateLimitPerMinute,
      vocabApplicationPath: args.vocabApplicationPath === undefined ? null : fromCliPath(args.vocabApplicationPath),
      includePriorContext,
      maxPriorContextChars,
    },
    outputRoot,
    summary: {
      sampledWindowCount: sampledWindows.length,
      completedWindowCount: windowResults.length,
      acceptedRunCount,
      acceptedRunRate,
      rejectedRunCount: statusCount(windowResults, "rejected"),
      providerFailedRunCount: statusCount(windowResults, "provider_failed"),
      toolParseFailedRunCount: statusCount(windowResults, "tool_response_parse_failed"),
      totalAcceptedCandidateCount: windowResults.reduce((sum, window) => sum + window.acceptedCandidateCount, 0),
      totalRejectedCandidateCount: windowResults.reduce((sum, window) => sum + window.rejectedCandidateCount, 0),
      totalValidationErrorCount: windowResults.reduce((sum, window) => sum + window.validationErrorCount, 0),
      proofLedgerPath,
      resolvedProofLedgerPath,
      promotionGatePath,
      promotionGatePassed: promotionGate.passed,
      publishableFieldWithoutProofCount: finalLedger.summary.publishableFieldWithoutProofCount,
      publishableFieldCount: finalLedger.summary.publishableFieldCount,
      verifiedFieldCount: finalLedger.summary.verifiedFieldCount,
      validationErrorCountAfterProof: finalLedger.summary.validationErrorCount,
      usage: aggregateUsage(windowResults.map((window) => window.usage)),
      verdict,
    },
    checks,
    windows: windowResults,
  };
  const outputPath = join(outputRoot, "feature-canary-run.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  return { artifact, outputPath };
}
