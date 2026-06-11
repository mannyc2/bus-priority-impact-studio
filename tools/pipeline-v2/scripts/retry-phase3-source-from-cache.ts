import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  dedupeInterventionRecordsByEvidenceOverlap,
  processInterventionRecordsToolArgs,
} from "@bp/applied-research/intervention-records";
import type { Tier2DocumentEvidenceCandidate } from "@bp/domain/documents/candidates";
import {
  buildInterventionRecordsBuckets,
  runInterventionRecordsBucket,
  type Tier2InterventionRecordsBucketSummary,
  type Tier2InterventionRecordsExtraction,
} from "../src/commands/docs/tier2/_intervention-records.ts";
import {
  INTERVENTION_RECORDS_TOOL_NAME,
  extractToolCallArguments,
  recordQualityIssueCounts,
  recordQualityRepairCounts,
  type Tier2DocumentInterventionRecord,
} from "../src/commands/docs/tier2/_shared.ts";

const repoRoot = join(import.meta.dir, "../../..");

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function resolvePath(path: string, base = process.cwd()): string {
  return isAbsolute(path) ? path : join(base, path);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function artifactKey(path: string | null, runRoot: string): string | null {
  if (path === null) return null;
  return relative(runRoot, path).replace(/\\/g, "/");
}

function sourceRoot(input: {
  runRoot: string;
  synthesisRootName: string;
  sourceId: string;
  sourceIndex: number;
}): string {
  return join(
    input.runRoot,
    input.synthesisRootName,
    "sources",
    `${String(input.sourceIndex + 1).padStart(4, "0")}_${input.sourceId}`,
  );
}

function bucketPaths(input: {
  sourceRoot: string;
  bucketId: string;
  isOnlyBucket: boolean;
}): {
  responsePath: string;
  toolCallPath: string;
  errorPath: string;
} {
  const root = input.isOnlyBucket
    ? input.sourceRoot
    : join(input.sourceRoot, "buckets", input.bucketId);
  return {
    responsePath: join(root, "openrouter-response.json"),
    toolCallPath: join(root, "intervention-records-tool-call.json"),
    errorPath: join(root, "error.json"),
  };
}

function extractCachedToolArgs(paths: {
  toolCallPath: string;
  responsePath: string;
}): {
  toolArgs: unknown | null;
  responsePath: string | null;
  toolCallPath: string | null;
} {
  if (existsSync(paths.toolCallPath)) {
    return {
      toolArgs: readJson(paths.toolCallPath),
      responsePath: existsSync(paths.responsePath) ? paths.responsePath : null,
      toolCallPath: paths.toolCallPath,
    };
  }
  if (!existsSync(paths.responsePath)) {
    return { toolArgs: null, responsePath: null, toolCallPath: null };
  }
  const responseJson = readJson(paths.responsePath);
  return {
    toolArgs: extractToolCallArguments(responseJson, INTERVENTION_RECORDS_TOOL_NAME),
    responsePath: paths.responsePath,
    toolCallPath: null,
  };
}

async function loadRouteCatalog(): Promise<
  Map<string, { routeId: string; longName: string | null; description: string | null }>
> {
  const path = join(repoRoot, "data/raw/network/current_bus_routes.json");
  const raw = readJson(path) as { rows?: Array<Record<string, unknown>> };
  const catalog = new Map<
    string,
    { routeId: string; longName: string | null; description: string | null }
  >();
  for (const row of raw.rows ?? []) {
    if (row["in_effect"] !== true && row["in_effect"] !== "true") continue;
    const routeId = row["route_id"];
    if (typeof routeId !== "string" || routeId.length === 0) continue;
    catalog.set(routeId, {
      routeId,
      longName:
        typeof row["route_long_name"] === "string" ? row["route_long_name"] : null,
      description:
        typeof row["route_description"] === "string"
          ? row["route_description"]
          : null,
    });
  }
  return catalog;
}

async function mapLimit<T, R>(
  values: T[],
  limit: number,
  fn: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(values[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

const previousPath = argValue("--previous");
if (previousPath === null) {
  throw new Error("--previous is required.");
}

const previousArtifactPath = resolvePath(previousPath);
const previousArtifact = readJson(previousArtifactPath) as Tier2InterventionRecordsExtraction;
const previousSource = previousArtifact.sources[0];
if (previousSource === undefined) {
  throw new Error(`${previousArtifactPath} has no sources[0].`);
}

const sourceId = argValue("--source-id") ?? previousSource.sourceId;
if (sourceId !== previousSource.sourceId) {
  throw new Error(
    `--source-id ${sourceId} does not match previous artifact source ${previousSource.sourceId}.`,
  );
}

const execute = hasFlag("--execute");
const apiKey = process.env["DEEPSEEK_API_KEY"];
if (execute && (apiKey === undefined || apiKey.length === 0)) {
  throw new Error("DEEPSEEK_API_KEY is required with --execute.");
}

const previousRunRoot = dirname(previousArtifact.ocrMarkdownCandidateExtractionPath);
const runRoot = previousRunRoot;
const synthesisRootName =
  argValue("--synthesis-root") ??
  `${previousArtifact.synthesisRootName}-targeted-retry`;
const outputPath = resolvePath(
  argValue("--output") ??
    join(runRoot, synthesisRootName, "per-source", `${sourceId}.json`),
);
const bucketConcurrency = Number(argValue("--bucket-concurrency") ?? "4");
if (!Number.isInteger(bucketConcurrency) || bucketConcurrency < 1) {
  throw new Error("--bucket-concurrency must be a positive integer.");
}

const candidateExtraction = readJson(previousArtifact.ocrMarkdownCandidateExtractionPath) as {
  pageMarkdownRootName: string;
  candidateRootName: string;
  documentEvidenceCandidates: Tier2DocumentEvidenceCandidate[];
};
const candidates = candidateExtraction.documentEvidenceCandidates.filter(
  (candidate) =>
    candidate.sourceRef.sourceId === sourceId && candidate.validationState !== "rejected",
);
const firstCandidate = candidates[0];
if (firstCandidate === undefined) {
  throw new Error(`No candidates found for ${sourceId}.`);
}

const routeCatalog = await loadRouteCatalog();
const sourceMeta = {
  sourceId,
  title: firstCandidate.sourceRef.title,
  publisher: firstCandidate.sourceRef.publisher,
  sourceGroup: firstCandidate.sourceRef.sourceGroup,
};
const buckets = buildInterventionRecordsBuckets({
  sourceId,
  source: sourceMeta,
  candidates,
  routeCatalog,
});

const previousSourceRoot = sourceRoot({
  runRoot,
  synthesisRootName: previousArtifact.synthesisRootName,
  sourceId,
  sourceIndex: 0,
});
const retrySourceRoot = sourceRoot({
  runRoot,
  synthesisRootName,
  sourceId,
  sourceIndex: 0,
});
const previousBuckets = previousSource.buckets;
const previousBucketIds = new Set(previousBuckets.map((bucket) => bucket.bucketId));
const isOnlyBucket = buckets.length === 1;

type BucketOutcome = {
  summary: Tier2InterventionRecordsBucketSummary;
  records: Tier2DocumentInterventionRecord[];
  unattachedCandidateIds: string[];
  droppedNoEvidenceCount: number;
};

async function processCachedBucket(
  bucket: (typeof buckets)[number],
): Promise<BucketOutcome | null> {
  if (!previousBucketIds.has(bucket.bucketId)) {
    return null;
  }
  const previousIsOnlyBucket =
    previousBuckets.length === 1 && previousBuckets[0]?.bucketId === bucket.bucketId;
  const paths = bucketPaths({
    sourceRoot: previousSourceRoot,
    bucketId: bucket.bucketId,
    isOnlyBucket: previousIsOnlyBucket,
  });
  const cached = extractCachedToolArgs(paths);
  if (cached.toolArgs === null) return null;
  const processed = processInterventionRecordsToolArgs({
    sourceId,
    bucket,
    toolArgs: cached.toolArgs,
    candidateExtractionRootName: candidateExtraction.pageMarkdownRootName,
    candidateRootName: candidateExtraction.candidateRootName,
    synthesisRootName,
  });
  if (processed.status === "failed") return null;
  return {
    summary: {
      bucketId: bucket.bucketId,
      bucketKind: bucket.bucketKind,
      status: "extracted",
      candidateCount: bucket.candidates.length,
      recordCount: processed.records.length,
      estimatedPromptChars: bucket.estimatedPromptChars,
      unattachedCandidateCount: processed.unattachedCandidateIds.length,
      droppedNoInterventionEvidenceCount: processed.droppedNoEvidenceCount,
      responseArtifactKey: artifactKey(cached.responsePath, runRoot),
      toolCallArtifactKey: artifactKey(cached.toolCallPath, runRoot),
      errorArtifactKey: null,
      error: null,
    },
    records: processed.records,
    unattachedCandidateIds: processed.unattachedCandidateIds,
    droppedNoEvidenceCount: processed.droppedNoEvidenceCount,
  };
}

async function runBucket(
  bucket: (typeof buckets)[number],
): Promise<BucketOutcome> {
  const cached = await processCachedBucket(bucket);
  if (cached !== null) {
    console.log(`bucket_reused ${bucket.bucketId}`);
    return cached;
  }
  if (!execute) {
    console.log(`bucket_would_retry ${bucket.bucketId}`);
    return {
      summary: {
        bucketId: bucket.bucketId,
        bucketKind: bucket.bucketKind,
        status: "failed",
        candidateCount: bucket.candidates.length,
        recordCount: 0,
        estimatedPromptChars: bucket.estimatedPromptChars,
        unattachedCandidateCount: 0,
        droppedNoInterventionEvidenceCount: 0,
        responseArtifactKey: null,
        toolCallArtifactKey: null,
        errorArtifactKey: null,
        error: "dry_run_bucket_missing_or_invalid_cache",
      },
      records: [],
      unattachedCandidateIds: [],
      droppedNoEvidenceCount: 0,
    };
  }
  console.log(`bucket_retry_started ${bucket.bucketId}`);
  const result = await runInterventionRecordsBucket({
    apiKey: apiKey as string,
    model: previousArtifact.model,
    maxTokens: previousArtifact.maxTokens,
    sourceRoot: retrySourceRoot,
    bucket,
    isOnlyBucket,
    source: sourceMeta,
    candidateExtractionRootName: candidateExtraction.pageMarkdownRootName,
    candidateRootName: candidateExtraction.candidateRootName,
    synthesisRootName,
    routeCatalog,
    fetcher: fetch,
  });
  console.log(`bucket_retry_finished ${bucket.bucketId} status=${result.status}`);
  return {
    summary: {
      bucketId: bucket.bucketId,
      bucketKind: bucket.bucketKind,
      status: result.status,
      candidateCount: bucket.candidates.length,
      recordCount: result.records.length,
      estimatedPromptChars: bucket.estimatedPromptChars,
      unattachedCandidateCount: result.unattachedCandidateIds.length,
      droppedNoInterventionEvidenceCount: result.droppedNoEvidenceCount,
      responseArtifactKey: artifactKey(result.responsePath, runRoot),
      toolCallArtifactKey: artifactKey(result.toolCallPath, runRoot),
      errorArtifactKey: artifactKey(result.errorPath, runRoot),
      error: result.status === "failed" ? result.error : null,
    },
    records: result.records,
    unattachedCandidateIds: result.unattachedCandidateIds,
    droppedNoEvidenceCount: result.droppedNoEvidenceCount,
  };
}

console.log(
  `retry_source_started source=${sourceId} buckets=${buckets.length} concurrency=${bucketConcurrency} execute=${execute}`,
);
const outcomes = await mapLimit(buckets, bucketConcurrency, runBucket);
const bucketSummaries = outcomes.map((outcome) => outcome.summary);
const sourceRecords = outcomes.flatMap((outcome) => outcome.records);
const sourceUnattached = new Set(outcomes.flatMap((outcome) => outcome.unattachedCandidateIds));
const droppedNoInterventionEvidenceCount = outcomes.reduce(
  (sum, outcome) => sum + outcome.droppedNoEvidenceCount,
  0,
);
const anyExtracted = bucketSummaries.some((bucket) => bucket.status === "extracted");
const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
const dedupedRecords = anyExtracted
  ? dedupeInterventionRecordsByEvidenceOverlap({
      records: sourceRecords,
      sourceId,
      candidateById,
      candidateExtractionRootName: candidateExtraction.pageMarkdownRootName,
      candidateRootName: candidateExtraction.candidateRootName,
      synthesisRootName,
    })
  : [];

const firstExtractedBucket = bucketSummaries.find((bucket) => bucket.status === "extracted");
const firstFailedBucket = bucketSummaries.find((bucket) => bucket.status === "failed");
const source = {
  sourceId,
  status: anyExtracted ? "extracted" : "failed",
  candidateCount: candidates.length,
  recordCount: dedupedRecords.length,
  unattachedCandidateCount: sourceUnattached.size,
  droppedNoInterventionEvidenceCount,
  reusedExisting: false,
  responseArtifactKey: firstExtractedBucket?.responseArtifactKey ?? null,
  toolCallArtifactKey: firstExtractedBucket?.toolCallArtifactKey ?? null,
  errorArtifactKey: anyExtracted ? null : firstFailedBucket?.errorArtifactKey ?? null,
  error: anyExtracted ? null : firstFailedBucket?.error ?? "all_buckets_failed",
  buckets: bucketSummaries,
} satisfies Tier2InterventionRecordsExtraction["sources"][number];

const artifact: Tier2InterventionRecordsExtraction = {
  ...previousArtifact,
  generatedAt: new Date().toISOString(),
  outputPath,
  synthesisRootName,
  summary: {
    selectedSourceCount: 1,
    extractedSourceCount: source.status === "extracted" ? 1 : 0,
    failedSourceCount: source.status === "failed" ? 1 : 0,
    reusedExistingSourceCount: 0,
    recordCount: dedupedRecords.length,
    unattachedCandidateCount: sourceUnattached.size,
    droppedNoInterventionEvidenceCount,
    recordQualityIssueCounts: recordQualityIssueCounts({
      records: dedupedRecords,
      droppedNoInterventionEvidenceCount,
    }),
    recordQualityRepairCounts: recordQualityRepairCounts(dedupedRecords),
  },
  sources: [source],
  documentInterventionRecords: dedupedRecords,
};

await writeJsonFile(outputPath, artifact);
console.log(
  `retry_source_finished source=${sourceId} status=${source.status} records=${dedupedRecords.length} failedBuckets=${bucketSummaries.filter((bucket) => bucket.status === "failed").length} output=${outputPath}`,
);
