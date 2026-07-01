// Create the reviewed Phase 3 v3 corpus by applying the manual review verdicts
// to the clean merged v2 corpus. This is intentionally deterministic: no LLM
// calls, no source probing, and only reject_pipeline_issue records are removed.

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../../..");
const corpusDir = join(repoRoot, "data/artifacts/docs/gap-roadmap-docs-2026-05-25");
const inputCorpusPath = join(corpusDir, "intervention-records-corpus-v2-with-text-2026-05-27.json");
const manualReviewPath = join(
  corpusDir,
  "intervention-records-corpus-v2-manual-review-2026-05-27.json",
);
const outputPath = join(corpusDir, "intervention-records-corpus-v3-reviewed-2026-05-27.json");
const reportPath = join(
  corpusDir,
  "intervention-records-corpus-v3-reviewed-2026-05-27-report.json",
);

type JsonObject = Record<string, unknown>;

type SourceBundle = JsonObject & {
  sourceId: string;
  recordCount?: number;
  manualReviewRejectedRecordCount?: number;
};

type InterventionRecord = JsonObject & {
  recordId: string;
  sourceId: string;
};

type Corpus = JsonObject & {
  summary?: JsonObject & {
    recordCount?: number;
    recordQualityIssueCounts?: Record<string, number>;
  };
  sources?: SourceBundle[];
  documentInterventionRecords?: InterventionRecord[];
};

type Review = {
  recordId: string;
  sourceId: string;
  disposition: string;
  confidence?: string;
  rationale?: string;
  issueTags?: string[];
};

type ManualReview = JsonObject & {
  summary?: JsonObject;
  reviews?: Review[];
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function rel(path: string): string {
  return path.startsWith(`${repoRoot}/`) ? path.slice(repoRoot.length + 1) : path;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sortedCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  const counts: Partial<Record<T, number>> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return sortedCounts(counts as Record<string, number>) as Record<T, number>;
}

const inputCorpus = readJson<Corpus>(inputCorpusPath);
const manualReview = readJson<ManualReview>(manualReviewPath);
const inputRecords = inputCorpus.documentInterventionRecords ?? [];
const inputSources = inputCorpus.sources ?? [];
const reviews = manualReview.reviews ?? [];
const reviewByRecordId = new Map(reviews.map((review) => [review.recordId, review]));
const rejectedReviews = reviews.filter((review) => review.disposition === "reject_pipeline_issue");
const rejectedRecordIds = new Set(rejectedReviews.map((review) => review.recordId));

const keptRecords = inputRecords
  .filter((record) => !rejectedRecordIds.has(record.recordId))
  .map((record) => clone(record));
const removedRecords = inputRecords
  .filter((record) => rejectedRecordIds.has(record.recordId))
  .map((record) => {
    const review = reviewByRecordId.get(record.recordId);
    return {
      recordId: record.recordId,
      sourceId: record.sourceId,
      disposition: review?.disposition ?? null,
      confidence: review?.confidence ?? null,
      rationale: review?.rationale ?? null,
      issueTags: review?.issueTags ?? [],
    };
  });

const keptCountsBySource = countBy(keptRecords.map((record) => record.sourceId));
const rejectedCountsBySource = countBy(removedRecords.map((record) => record.sourceId));
const reviewedSources = inputSources
  .map((source) => {
    const sourceCopy = clone(source);
    sourceCopy.recordCount = keptCountsBySource[source.sourceId] ?? 0;
    const rejectedCount = rejectedCountsBySource[source.sourceId] ?? 0;
    if (rejectedCount > 0) {
      sourceCopy.manualReviewRejectedRecordCount = rejectedCount;
    }
    return sourceCopy;
  })
  .sort((a, b) => a.sourceId.localeCompare(b.sourceId));

const missingRejectedRecordIds = rejectedReviews
  .map((review) => review.recordId)
  .filter((recordId) => !inputRecords.some((record) => record.recordId === recordId));
const unreconciledReviews = reviews
  .map((review) => review.recordId)
  .filter((recordId) => !inputRecords.some((record) => record.recordId === recordId));
const duplicateKeptRecordIds = Object.entries(countBy(keptRecords.map((record) => record.recordId)))
  .filter(([, count]) => count > 1)
  .map(([recordId, count]) => ({ recordId, count }));

const summary = {
  ...(inputCorpus.summary ?? {}),
  recordCount: keptRecords.length,
  manualReviewRecordCount: reviews.length,
  manualRejectedRecordCount: removedRecords.length,
  recordQualityIssueCounts: sortedCounts(
    (inputCorpus.summary?.recordQualityIssueCounts as Record<string, number> | undefined) ?? {},
  ),
};

const generatedAt = new Date().toISOString();
const output = {
  ...inputCorpus,
  version: 3,
  generatedAt,
  sourceCorpusPath: rel(inputCorpusPath),
  manualReviewPath: rel(manualReviewPath),
  outputPath: rel(outputPath),
  summary,
  manualReview: {
    sourceReviewPath: rel(manualReviewPath),
    dispositionCounts:
      manualReview.summary?.["dispositionCounts"] ??
      countBy(reviews.map((review) => review.disposition)),
    removedDisposition: "reject_pipeline_issue",
    removedRecordCount: removedRecords.length,
    removedRecords,
  },
  sources: reviewedSources,
  documentInterventionRecords: keptRecords,
};

const report = {
  generatedAt,
  inputCorpusPath: rel(inputCorpusPath),
  manualReviewPath: rel(manualReviewPath),
  outputPath: rel(outputPath),
  totals: {
    inputRecords: inputRecords.length,
    keptRecords: keptRecords.length,
    removedRecords: removedRecords.length,
    sources: reviewedSources.length,
  },
  removedRecords,
  rejectedCountsBySource: sortedCounts(rejectedCountsBySource),
  checks: {
    missingRejectedRecordIds,
    unreconciledReviews,
    duplicateKeptRecordIds,
  },
};

await Promise.all([
  writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`),
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
]);

console.log("=== Reviewed Phase 3 v3 corpus ===");
console.log(`inputRecords=${inputRecords.length}`);
console.log(`keptRecords=${keptRecords.length}`);
console.log(`removedRecords=${removedRecords.length}`);
console.log(`missingRejectedRecordIds=${missingRejectedRecordIds.length}`);
console.log(`unreconciledReviews=${unreconciledReviews.length}`);
console.log(`duplicateKeptRecordIds=${duplicateKeptRecordIds.length}`);
console.log(`output=${rel(outputPath)}`);
console.log(`report=${rel(reportPath)}`);
