import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  INTERVENTION_RECORDS_TOOL_NAME,
  buildInterventionRecordsBuckets,
  dedupeInterventionRecordsByEvidenceOverlap,
  extractToolCallArguments,
  processInterventionRecordsToolArgs,
  recordQualityIssueCounts,
  recordQualityRepairCounts,
  type Tier2DocumentEvidenceCandidate,
  type Tier2DocumentInterventionRecord,
  type Tier2InterventionRecordsBucketSummary,
  type Tier2InterventionRecordsExtraction,
} from "../src/commands/docs/tier2/_shared.ts";

const repoRoot = join(import.meta.dir, "../../..");
const defaultInputPath = join(
  repoRoot,
  "data/artifacts/docs/gap-roadmap-docs-2026-05-25/intervention-records-v2-brooklyn-smoke-post-p16-2026-05-27.json",
);

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function resolvePath(path: string, base: string): string {
  return isAbsolute(path) ? path : join(base, path);
}

function artifactKey(path: string | null, runRoot: string): string | null {
  if (path === null) return null;
  return relative(runRoot, path).replace(/\\/g, "/");
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
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
  error: string | null;
} {
  if (existsSync(paths.toolCallPath)) {
    try {
      return {
        toolArgs: readJson(paths.toolCallPath),
        responsePath: existsSync(paths.responsePath) ? paths.responsePath : null,
        toolCallPath: paths.toolCallPath,
        error: null,
      };
    } catch (error) {
      return {
        toolArgs: null,
        responsePath: existsSync(paths.responsePath) ? paths.responsePath : null,
        toolCallPath: paths.toolCallPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  if (!existsSync(paths.responsePath)) {
    return {
      toolArgs: null,
      responsePath: null,
      toolCallPath: null,
      error: "cached_response_missing",
    };
  }
  const responseJson = readJson(paths.responsePath);
  return {
    toolArgs: extractToolCallArguments(responseJson, INTERVENTION_RECORDS_TOOL_NAME),
    responsePath: paths.responsePath,
    toolCallPath: null,
    error: null,
  };
}

async function loadRouteCatalog(): Promise<Map<string, {
  routeId: string;
  longName: string | null;
  description: string | null;
}>> {
  const path = join(repoRoot, "data/raw/network/current_bus_routes.json");
  const raw = readJson(path) as { rows?: Array<Record<string, unknown>> };
  const catalog = new Map<string, {
    routeId: string;
    longName: string | null;
    description: string | null;
  }>();
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

const inputPath = resolvePath(argValue("--input") ?? defaultInputPath, process.cwd());
const outputPath = resolvePath(
  argValue("--output") ?? inputPath.replace(/\.json$/u, "-offline-repaired.json"),
  process.cwd(),
);
const artifact = readJson(inputPath) as Tier2InterventionRecordsExtraction;
const runRoot = dirname(inputPath);
const candidateExtractionPath = resolvePath(
  artifact.ocrMarkdownCandidateExtractionPath,
  runRoot,
);
const candidateExtraction = readJson(candidateExtractionPath) as {
  pageMarkdownRootName: string;
  candidateRootName: string;
  documentEvidenceCandidates: Tier2DocumentEvidenceCandidate[];
};
const routeCatalog = await loadRouteCatalog();
const records: Tier2DocumentInterventionRecord[] = [];
const sources: Tier2InterventionRecordsExtraction["sources"] = [];

for (let sourceIndex = 0; sourceIndex < artifact.sources.length; sourceIndex += 1) {
  const previousSource = artifact.sources[sourceIndex];
  if (previousSource === undefined) continue;
  const candidates = candidateExtraction.documentEvidenceCandidates.filter(
    (candidate) =>
      candidate.sourceRef.sourceId === previousSource.sourceId &&
      candidate.validationState !== "rejected",
  );
  const firstCandidate = candidates[0];
  if (firstCandidate === undefined) {
    sources.push({
      ...previousSource,
      status: "failed",
      recordCount: 0,
      unattachedCandidateCount: 0,
      droppedNoInterventionEvidenceCount: 0,
      responseArtifactKey: null,
      toolCallArtifactKey: null,
      errorArtifactKey: null,
      error: "no_candidates_for_source",
      buckets: [],
    });
    continue;
  }
  const sourceMeta = {
    sourceId: previousSource.sourceId,
    title: firstCandidate.sourceRef.title,
    publisher: firstCandidate.sourceRef.publisher,
    sourceGroup: firstCandidate.sourceRef.sourceGroup,
  };
  const buckets = buildInterventionRecordsBuckets({
    sourceId: previousSource.sourceId,
    source: sourceMeta,
    candidates,
    routeCatalog,
  });
  const thisSourceRoot = sourceRoot({
    runRoot,
    synthesisRootName: artifact.synthesisRootName,
    sourceId: previousSource.sourceId,
    sourceIndex,
  });
  const isOnlyBucket = buckets.length === 1;
  const bucketSummaries: Tier2InterventionRecordsBucketSummary[] = [];
  const sourceRecords: Tier2DocumentInterventionRecord[] = [];
  const sourceUnattached = new Set<string>();
  let droppedNoInterventionEvidenceCount = 0;
  let firstResponsePath: string | null = null;
  let firstToolCallPath: string | null = null;
  let firstErrorPath: string | null = null;
  let firstError: string | null = null;

  for (const bucket of buckets) {
    const paths = bucketPaths({
      sourceRoot: thisSourceRoot,
      bucketId: bucket.bucketId,
      isOnlyBucket,
    });
    const cached = extractCachedToolArgs(paths);
    if (cached.responsePath !== null && firstResponsePath === null) {
      firstResponsePath = cached.responsePath;
    }
    if (cached.toolCallPath !== null && firstToolCallPath === null) {
      firstToolCallPath = cached.toolCallPath;
    }
    if (cached.toolArgs === null) {
      const error = cached.error ?? "cached_tool_call_missing";
      if (firstErrorPath === null && existsSync(paths.errorPath)) firstErrorPath = paths.errorPath;
      if (firstError === null) firstError = error;
      bucketSummaries.push({
        bucketId: bucket.bucketId,
        bucketKind: bucket.bucketKind,
        status: "failed",
        candidateCount: bucket.candidates.length,
        recordCount: 0,
        estimatedPromptChars: bucket.estimatedPromptChars,
        unattachedCandidateCount: 0,
        droppedNoInterventionEvidenceCount: 0,
        responseArtifactKey: artifactKey(cached.responsePath, runRoot),
        toolCallArtifactKey: artifactKey(cached.toolCallPath, runRoot),
        errorArtifactKey: existsSync(paths.errorPath) ? artifactKey(paths.errorPath, runRoot) : null,
        error,
      });
      continue;
    }
    const processed = processInterventionRecordsToolArgs({
      sourceId: previousSource.sourceId,
      bucket,
      toolArgs: cached.toolArgs,
      candidateExtractionRootName: candidateExtraction.pageMarkdownRootName,
      candidateRootName: candidateExtraction.candidateRootName,
      synthesisRootName: artifact.synthesisRootName,
    });
    if (processed.status === "failed") {
      if (firstErrorPath === null && existsSync(paths.errorPath)) firstErrorPath = paths.errorPath;
      if (firstError === null) firstError = processed.error;
      bucketSummaries.push({
        bucketId: bucket.bucketId,
        bucketKind: bucket.bucketKind,
        status: "failed",
        candidateCount: bucket.candidates.length,
        recordCount: 0,
        estimatedPromptChars: bucket.estimatedPromptChars,
        unattachedCandidateCount: 0,
        droppedNoInterventionEvidenceCount: 0,
        responseArtifactKey: artifactKey(cached.responsePath, runRoot),
        toolCallArtifactKey: artifactKey(cached.toolCallPath, runRoot),
        errorArtifactKey: existsSync(paths.errorPath) ? artifactKey(paths.errorPath, runRoot) : null,
        error: processed.error,
      });
      continue;
    }
    sourceRecords.push(...processed.records);
    for (const id of processed.unattachedCandidateIds) sourceUnattached.add(id);
    droppedNoInterventionEvidenceCount += processed.droppedNoEvidenceCount;
    bucketSummaries.push({
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
    });
  }

  const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const dedupedRecords = dedupeInterventionRecordsByEvidenceOverlap({
    records: sourceRecords,
    sourceId: previousSource.sourceId,
    candidateById,
    candidateExtractionRootName: candidateExtraction.pageMarkdownRootName,
    candidateRootName: candidateExtraction.candidateRootName,
    synthesisRootName: artifact.synthesisRootName,
  });
  records.push(...dedupedRecords);
  const anyExtracted = bucketSummaries.some((bucket) => bucket.status === "extracted");
  sources.push({
    sourceId: previousSource.sourceId,
    status: anyExtracted ? "extracted" : "failed",
    candidateCount: candidates.length,
    recordCount: dedupedRecords.length,
    unattachedCandidateCount: sourceUnattached.size,
    droppedNoInterventionEvidenceCount,
    reusedExisting: false,
    responseArtifactKey: artifactKey(firstResponsePath, runRoot),
    toolCallArtifactKey: artifactKey(firstToolCallPath, runRoot),
    errorArtifactKey: artifactKey(firstErrorPath, runRoot),
    error: anyExtracted ? null : firstError ?? "all_buckets_failed",
    buckets: bucketSummaries,
  });
}

const output: Tier2InterventionRecordsExtraction = {
  ...artifact,
  generatedAt: new Date().toISOString(),
  outputPath,
  summary: {
    selectedSourceCount: sources.length,
    extractedSourceCount: sources.filter((source) => source.status === "extracted").length,
    failedSourceCount: sources.filter((source) => source.status === "failed").length,
    reusedExistingSourceCount: sources.filter((source) => source.reusedExisting).length,
    recordCount: records.length,
    unattachedCandidateCount: sources.reduce(
      (sum, source) => sum + source.unattachedCandidateCount,
      0,
    ),
    droppedNoInterventionEvidenceCount: sources.reduce(
      (sum, source) => sum + source.droppedNoInterventionEvidenceCount,
      0,
    ),
    recordQualityIssueCounts: recordQualityIssueCounts({
      records,
      droppedNoInterventionEvidenceCount: sources.reduce(
        (sum, source) => sum + source.droppedNoInterventionEvidenceCount,
        0,
      ),
    }),
    recordQualityRepairCounts: recordQualityRepairCounts(records),
  },
  sources,
  documentInterventionRecords: records,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      outputPath,
      recordCount: output.summary.recordCount,
      extractedSourceCount: output.summary.extractedSourceCount,
      failedSourceCount: output.summary.failedSourceCount,
      failedBucketCount: output.sources.reduce(
        (sum, source) => sum + source.buckets.filter((bucket) => bucket.status === "failed").length,
        0,
      ),
      recordQualityIssueCounts: output.summary.recordQualityIssueCounts,
      recordQualityRepairCounts: output.summary.recordQualityRepairCounts,
    },
    null,
    2,
  ),
);
