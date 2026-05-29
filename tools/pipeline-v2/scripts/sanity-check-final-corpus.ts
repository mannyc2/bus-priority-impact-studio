// Sanity-check the merged Phase 3 intervention-records corpus.

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { DocumentInterventionRecordSchema } from "@bp/domain";

const repoRoot = join(import.meta.dir, "../../..");
const corpusDir = join(
  repoRoot,
  "data/artifacts/docs/gap-roadmap-docs-2026-05-25",
);
const corpusPath = join(
  corpusDir,
  process.argv[2] ?? "intervention-records-corpus-v3-reviewed-2026-05-27.json",
);
const candidatesPath = join(
  corpusDir,
  "ocr-markdown-candidates-corpus-v5-with-text-2026-05-27.json",
);
const reportPath = join(
  corpusDir,
  process.argv[3] ??
    `${basename(corpusPath, ".json")}-sanity-report.json`,
);

const MIN_PLAUSIBLE_YEAR = 2000;
const MAX_PLAUSIBLE_YEAR = 2030;

type RecordJson = {
  recordId: string;
  sourceId: string;
  effectiveDate?: string;
  statusHistory?: Array<{ status?: string; asOfDate?: string; evidenceRefs?: string[] }>;
  evidenceCandidateIds?: string[];
  primaryTreatments?: string[];
  customTreatments?: string[];
  treatmentComponents?: Array<{
    treatmentType?: string;
    customTreatmentType?: string;
    evidenceRefs?: string[];
  }>;
  metrics?: Array<{ evidenceRefs?: string[] }>;
  caveats?: Array<{ evidenceRefs?: string[] }>;
};

type SourceJson = {
  sourceId: string;
  status?: string;
  recordCount?: number;
  error?: unknown;
  buckets?: Array<{ status?: string; bucketId?: string; error?: unknown }>;
};

type Corpus = {
  summary?: unknown;
  documentInterventionRecords: RecordJson[];
  sources?: SourceJson[];
};

type CandidateCorpus = {
  documentEvidenceCandidates: Array<{
    candidateId: string;
    sourceRef?: { sourceId?: string };
    sourceId?: string;
  }>;
};

function rel(path: string): string {
  return path.startsWith(`${repoRoot}/`) ? path.slice(repoRoot.length + 1) : path;
}

function parseYear(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function isSuspiciousYear(value: string | undefined): boolean {
  const year = parseYear(value);
  return year !== null && (year < MIN_PLAUSIBLE_YEAR || year > MAX_PLAUSIBLE_YEAR);
}

function collectEvidenceRefs(record: RecordJson): string[] {
  const refs: string[] = [];
  refs.push(...(record.evidenceCandidateIds ?? []));
  for (const entry of record.statusHistory ?? []) refs.push(...(entry.evidenceRefs ?? []));
  for (const component of record.treatmentComponents ?? []) {
    refs.push(...(component.evidenceRefs ?? []));
  }
  for (const metric of record.metrics ?? []) refs.push(...(metric.evidenceRefs ?? []));
  for (const caveat of record.caveats ?? []) refs.push(...(caveat.evidenceRefs ?? []));
  return refs;
}

const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as Corpus;
const candidateCorpus = JSON.parse(readFileSync(candidatesPath, "utf8")) as CandidateCorpus;
const records = corpus.documentInterventionRecords;
const sources = corpus.sources ?? [];
const candidateIds = new Set(
  candidateCorpus.documentEvidenceCandidates.map((candidate) => candidate.candidateId),
);
const candidateSourceIds = [
  ...new Set(
    candidateCorpus.documentEvidenceCandidates
      .map((candidate) => candidate.sourceRef?.sourceId ?? candidate.sourceId)
      .filter((sourceId): sourceId is string => typeof sourceId === "string"),
  ),
].sort();
const sourceIds = sources.map((source) => source.sourceId).sort();
const sourceIdSet = new Set(sourceIds);

const schemaFailures = records.flatMap((record) => {
  const parsed = DocumentInterventionRecordSchema.safeParse(record);
  if (parsed.success) return [];
  return [
    {
      recordId: record.recordId,
      sourceId: record.sourceId,
      issues: parsed.error.issues,
    },
  ];
});

const duplicateRecordIds = Object.entries(
  records.reduce<Record<string, number>>((counts, record) => {
    counts[record.recordId] = (counts[record.recordId] ?? 0) + 1;
    return counts;
  }, {}),
)
  .filter(([, count]) => count > 1)
  .map(([recordId, count]) => ({ recordId, count }));

const recordsMissingEvidence = records
  .filter(
    (record) =>
      !Array.isArray(record.evidenceCandidateIds) || record.evidenceCandidateIds.length === 0,
  )
  .map((record) => ({ recordId: record.recordId, sourceId: record.sourceId }));

const missingRefsByRecord: Array<{
  recordId: string;
  sourceId: string;
  missingRefs: string[];
}> = [];
let evidenceRefsChecked = 0;
for (const record of records) {
  const refs = [...new Set(collectEvidenceRefs(record))];
  evidenceRefsChecked += refs.length;
  const missingRefs = refs.filter((ref) => !candidateIds.has(ref));
  if (missingRefs.length > 0) {
    missingRefsByRecord.push({
      recordId: record.recordId,
      sourceId: record.sourceId,
      missingRefs,
    });
  }
}

const missingSourceIds = candidateSourceIds.filter((sourceId) => !sourceIdSet.has(sourceId));
const extraSourceIds = sourceIds.filter((sourceId) => !candidateSourceIds.includes(sourceId));
const failedSources = sources
  .filter((source) => source.status !== "extracted")
  .map((source) => ({
    sourceId: source.sourceId,
    status: source.status ?? null,
    error: source.error ?? null,
  }));
const failedBuckets = sources.flatMap((source) =>
  (source.buckets ?? [])
    .filter((bucket) => bucket.status === "failed")
    .map((bucket) => ({
      sourceId: source.sourceId,
      bucketId: bucket.bucketId ?? null,
      error: bucket.error ?? null,
    })),
);

const zeroRecordSources = sources
  .filter((source) => (source.recordCount ?? 0) === 0)
  .map((source) => ({ sourceId: source.sourceId, status: source.status ?? null }));

const suspiciousDates = records.flatMap((record) => {
  const dates: Array<{ recordId: string; sourceId: string; field: string; value: string }> = [];
  if (isSuspiciousYear(record.effectiveDate)) {
    dates.push({
      recordId: record.recordId,
      sourceId: record.sourceId,
      field: "effectiveDate",
      value: record.effectiveDate as string,
    });
  }
  for (const entry of record.statusHistory ?? []) {
    if (isSuspiciousYear(entry.asOfDate)) {
      dates.push({
        recordId: record.recordId,
        sourceId: record.sourceId,
        field: "statusHistory[].asOfDate",
        value: entry.asOfDate as string,
      });
    }
  }
  return dates;
});

const recordsWithoutTreatmentLabels = records
  .filter(
    (record) =>
      !(record.primaryTreatments ?? []).length &&
      !(record.customTreatments ?? []).length &&
      !(record.treatmentComponents ?? []).some(
        (component) => component.treatmentType || component.customTreatmentType,
      ),
  )
  .map((record) => ({
    recordId: record.recordId,
    sourceId: record.sourceId,
  }));

const duplicateStatusHistoryBuckets = records.flatMap((record) => {
  const seen = new Set<string>();
  const duplicates: Array<{ recordId: string; sourceId: string; key: string }> = [];
  for (const entry of record.statusHistory ?? []) {
    const key = `${entry.status ?? ""}|${entry.asOfDate ?? ""}`;
    if (seen.has(key)) duplicates.push({ recordId: record.recordId, sourceId: record.sourceId, key });
    seen.add(key);
  }
  return duplicates;
});

const recordSourceIdsMissingSource = records
  .filter((record) => !sourceIdSet.has(record.sourceId))
  .map((record) => ({ recordId: record.recordId, sourceId: record.sourceId }));

const blockingIssueCount =
  schemaFailures.length +
  duplicateRecordIds.length +
  recordsMissingEvidence.length +
  missingRefsByRecord.length +
  missingSourceIds.length +
  extraSourceIds.length +
  failedSources.length +
  failedBuckets.length +
  suspiciousDates.length +
  recordsWithoutTreatmentLabels.length +
  duplicateStatusHistoryBuckets.length +
  recordSourceIdsMissingSource.length;

const report = {
  generatedAt: new Date().toISOString(),
  corpusPath: rel(corpusPath),
  candidatesPath: rel(candidatesPath),
  blockingIssueCount,
  totals: {
    records: records.length,
    sources: sources.length,
    candidateSources: candidateSourceIds.length,
    evidenceRefsChecked,
    evidenceRefsMissingInV5: missingRefsByRecord.reduce(
      (sum, item) => sum + item.missingRefs.length,
      0,
    ),
  },
  checks: {
    schemaFailures,
    duplicateRecordIds,
    recordsMissingEvidence,
    missingRefsByRecord,
    missingSourceIds,
    extraSourceIds,
    failedSources,
    failedBuckets,
    zeroRecordSources,
    suspiciousDates,
    recordsWithoutTreatmentLabels,
    duplicateStatusHistoryBuckets,
    recordSourceIdsMissingSource,
  },
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log("=== Final Phase 3 corpus sanity check ===");
console.log(`records=${records.length} sources=${sources.length}`);
console.log(`schemaFailures=${schemaFailures.length}`);
console.log(`duplicateRecordIds=${duplicateRecordIds.length}`);
console.log(`recordsMissingEvidence=${recordsMissingEvidence.length}`);
console.log(`missingEvidenceRefRecords=${missingRefsByRecord.length}`);
console.log(`missingSourceIds=${missingSourceIds.length}`);
console.log(`extraSourceIds=${extraSourceIds.length}`);
console.log(`failedSources=${failedSources.length}`);
console.log(`failedBuckets=${failedBuckets.length}`);
console.log(`zeroRecordSources=${zeroRecordSources.length}`);
console.log(`suspiciousDates=${suspiciousDates.length}`);
console.log(`recordsWithoutTreatmentLabels=${recordsWithoutTreatmentLabels.length}`);
console.log(`duplicateStatusHistoryBuckets=${duplicateStatusHistoryBuckets.length}`);
console.log(`recordSourceIdsMissingSource=${recordSourceIdsMissingSource.length}`);
console.log(`blockingIssueCount=${blockingIssueCount}`);
console.log(`report=${rel(reportPath)}`);
