// Merge the final Phase 3 intervention-records corpus from audited artifacts.
//
// Priority order is source-scoped: first selected source wins. This avoids
// accidentally keeping older failed source bundles when a newer targeted retry
// exists for the same source.

import { readFileSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const repoRoot = join(import.meta.dir, "../../..");
const corpusDir = join(
  repoRoot,
  "data/artifacts/docs/gap-roadmap-docs-2026-05-25",
);
const candidatePath = join(
  corpusDir,
  "ocr-markdown-candidates-corpus-v5-with-text-2026-05-27.json",
);
const outputPath = join(
  corpusDir,
  "intervention-records-corpus-v2-with-text-2026-05-27.json",
);
const reportPath = join(
  corpusDir,
  "intervention-records-corpus-v2-with-text-2026-05-27-merge-report.json",
);

type JsonObject = Record<string, unknown>;

type SourceBundle = JsonObject & {
  sourceId: string;
  status?: string;
  recordCount?: number;
  unattachedCandidateCount?: number;
  droppedNoInterventionEvidenceCount?: number;
  mergeProvenance?: { label: string; artifactPath: string };
  buckets?: Array<{ status?: string; bucketId?: string; error?: unknown }>;
  error?: unknown;
};

type InterventionRecord = JsonObject & {
  recordId: string;
  sourceId: string;
  routes?: string[];
  primaryTreatments?: string[];
  customTreatments?: string[];
  evidenceCandidateIds?: string[];
  statusHistory?: Array<JsonObject & { status?: string; asOfDate?: string; evidenceRefs?: string[] }>;
  treatmentComponents?: Array<JsonObject & { treatmentType?: string; customTreatmentType?: string }>;
  metrics?: Array<JsonObject>;
  caveats?: Array<JsonObject>;
  extraction?: {
    qualityIssues?: string[];
    qualityRepairs?: string[];
  };
};

type Corpus = JsonObject & {
  sources?: SourceBundle[];
  documentInterventionRecords?: InterventionRecord[];
  summary?: {
    recordQualityIssueCounts?: Record<string, number>;
    recordQualityRepairCounts?: Record<string, number>;
  };
};

type CandidateCorpus = {
  documentEvidenceCandidates: Array<{
    candidateId: string;
    sourceRef?: { sourceId?: string };
    sourceId?: string;
  }>;
};

type Selection = {
  label: string;
  artifactPath: string;
  selectedSourceIds: string[];
  selectedSourceCount: number;
  selectedRecordCount: number;
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
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return sortedCounts(counts);
}

const candidates = readJson<CandidateCorpus>(candidatePath);
const candidateList = candidates.documentEvidenceCandidates;
const candidateIds = new Set(candidateList.map((candidate) => candidate.candidateId));
const candidateSourceIds = [
  ...new Set(
    candidateList
      .map((candidate) => candidate.sourceRef?.sourceId ?? candidate.sourceId)
      .filter((sourceId): sourceId is string => typeof sourceId === "string"),
  ),
].sort();

const selectedSourceIds = new Set<string>();
const seenRecordIds = new Set<string>();
const sources: SourceBundle[] = [];
const records: InterventionRecord[] = [];
const selections: Selection[] = [];
const duplicateRecordIds: Array<{
  recordId: string;
  sourceId: string;
  label: string;
  artifactPath: string;
}> = [];

function chooseArtifact(input: {
  label: string;
  artifactPath: string;
  sourceIds?: string[];
}): void {
  const absPath = join(corpusDir, input.artifactPath);
  const artifact = readJson<Corpus>(absPath);
  const allowedSourceIds = input.sourceIds ? new Set(input.sourceIds) : null;
  const chosenSourceIds: string[] = [];
  const chosenRecordIds: string[] = [];

  for (const source of artifact.sources ?? []) {
    if (allowedSourceIds && !allowedSourceIds.has(source.sourceId)) continue;
    if (selectedSourceIds.has(source.sourceId)) continue;

    const sourceCopy = clone(source);
    sourceCopy.mergeProvenance = {
      label: input.label,
      artifactPath: input.artifactPath,
    };
    selectedSourceIds.add(source.sourceId);
    sources.push(sourceCopy);
    chosenSourceIds.push(source.sourceId);
  }

  const chosenSourceSet = new Set(chosenSourceIds);
  for (const record of artifact.documentInterventionRecords ?? []) {
    if (!chosenSourceSet.has(record.sourceId)) continue;
    if (seenRecordIds.has(record.recordId)) {
      duplicateRecordIds.push({
        recordId: record.recordId,
        sourceId: record.sourceId,
        label: input.label,
        artifactPath: input.artifactPath,
      });
      continue;
    }
    seenRecordIds.add(record.recordId);
    records.push(clone(record));
    chosenRecordIds.push(record.recordId);
  }

  selections.push({
    label: input.label,
    artifactPath: input.artifactPath,
    selectedSourceIds: chosenSourceIds.sort(),
    selectedSourceCount: chosenSourceIds.length,
    selectedRecordCount: chosenRecordIds.length,
  });
}

chooseArtifact({
  label: "text_repaired",
  artifactPath: "intervention-records-text-v1-repaired.json",
});
chooseArtifact({
  label: "brooklyn_route_profiles_offline_repaired",
  artifactPath:
    "intervention-records-v2-brooklyn-smoke-post-p16-2026-05-27-offline-repaired.json",
});
chooseArtifact({
  label: "targeted_retry_bronx_final_plan",
  artifactPath:
    "intervention-records-v2-targeted-retry-2026-05-27/per-source/mta_bronx_bus_network_final_plan_2019_pdf.json",
});
chooseArtifact({
  label: "targeted_retry_queens_service_change",
  artifactPath:
    "intervention-records-v2-targeted-retry-2026-05-27/per-source/mta_queens_service_change_board_item_2025_pdf.json",
});
chooseArtifact({
  label: "small_audit_clean_sources",
  artifactPath: "intervention-records-v2-small-audit.json",
  sourceIds: [
    "nyc_dot_busway_pdf_34th_st_busway",
    "nyc_dot_b44_sbs_progress_report_2016_pdf",
    "nyc_comptroller_behind_schedule_2025_pdf",
  ],
});
chooseArtifact({
  label: "jamaica_retry",
  artifactPath: "intervention-records-v2-jamaica-retry.json",
});

const retryPerSourceDir = join(
  corpusDir,
  "intervention-records-v2-missing-retry-2026-05-27/per-source",
);
for (const file of readdirSync(retryPerSourceDir)
  .filter((name) => name.endsWith(".json"))
  .sort()) {
  const sourceId = basename(file, ".json");
  if (selectedSourceIds.has(sourceId)) continue;
  chooseArtifact({
    label: "missing_retry_remaining",
    artifactPath: `intervention-records-v2-missing-retry-2026-05-27/per-source/${file}`,
  });
}

function collapseStatusHistory(record: InterventionRecord): number {
  if (!Array.isArray(record.statusHistory) || record.statusHistory.length < 2) {
    return 0;
  }

  const grouped = new Map<string, JsonObject & { evidenceRefs?: string[] }>();
  const order: string[] = [];
  for (const entry of record.statusHistory) {
    const asOfDate =
      typeof entry.asOfDate === "string" && entry.asOfDate.trim().length > 0
        ? entry.asOfDate
        : null;
    const key = JSON.stringify({
      status: entry.status,
      asOfDate,
    });
    if (!grouped.has(key)) {
      const entryCopy = { ...entry };
      if (!asOfDate) delete entryCopy.asOfDate;
      grouped.set(key, {
        ...entryCopy,
        evidenceRefs: [...(entry.evidenceRefs ?? [])],
      });
      order.push(key);
      continue;
    }
    const existing = grouped.get(key);
    if (!existing) continue;
    existing.evidenceRefs = [
      ...new Set([...(existing.evidenceRefs ?? []), ...(entry.evidenceRefs ?? [])]),
    ].sort();
  }

  const collapsed = order
    .map((key) => grouped.get(key))
    .filter((entry): entry is NonNullable<InterventionRecord["statusHistory"]>[number] =>
      entry !== undefined,
    );
  const removed = record.statusHistory.length - collapsed.length;
  if (removed > 0) record.statusHistory = collapsed;
  return removed;
}

let statusHistoryEntriesCollapsed = 0;
let recordsWithStatusHistoryCollapsed = 0;
let customTreatmentAddedFromEvidence = 0;

for (const record of records) {
  const removed = collapseStatusHistory(record);
  if (removed > 0) {
    statusHistoryEntriesCollapsed += removed;
    recordsWithStatusHistoryCollapsed += 1;
  }
}

const m79Record = records.find(
  (record) =>
    record.recordId ===
    "document_intervention:nyc_dot_m86_sbs_progress_report_2017_pdf:2f779424",
);
if (m79Record) {
  if (!m79Record.customTreatments?.includes("select_bus_service_conversion")) {
    m79Record.customTreatments = [
      ...new Set([...(m79Record.customTreatments ?? []), "select_bus_service_conversion"]),
    ];
    customTreatmentAddedFromEvidence += 1;
  }
  const hasComponent = m79Record.treatmentComponents?.some(
    (component) => component.customTreatmentType === "select_bus_service_conversion",
  );
  if (!hasComponent) {
    m79Record.treatmentComponents = [
      ...(m79Record.treatmentComponents ?? []),
      {
        customTreatmentType: "select_bus_service_conversion",
        description:
          "Planned conversion of the M79 along 79th Street to Select Bus Service.",
        evidenceRefs: [...(m79Record.evidenceCandidateIds ?? [])],
      },
    ];
  }
}

let optionalNullFieldsStripped = 0;
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    const next: unknown[] = [];
    for (const item of value) {
      if (item === null || item === undefined) {
        optionalNullFieldsStripped += 1;
        continue;
      }
      next.push(stripNulls(item));
    }
    return next;
  }
  if (value && typeof value === "object") {
    const next: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === null || item === undefined) {
        optionalNullFieldsStripped += 1;
        continue;
      }
      if (
        typeof item === "string" &&
        item.trim().length === 0 &&
        ["asOfDate", "effectiveDate", "datePrecision"].includes(key)
      ) {
        optionalNullFieldsStripped += 1;
        continue;
      }
      next[key] = stripNulls(item);
    }
    return next;
  }
  return value;
}

const repairedRecords = records.map((record) => stripNulls(record) as InterventionRecord);

sources.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
repairedRecords.sort(
  (a, b) => a.sourceId.localeCompare(b.sourceId) || a.recordId.localeCompare(b.recordId),
);

const selectedIds = sources.map((source) => source.sourceId).sort();
const selectedIdSet = new Set(selectedIds);
const missingSourceIds = candidateSourceIds.filter((sourceId) => !selectedIdSet.has(sourceId));
const extraSourceIds = selectedIds.filter((sourceId) => !candidateSourceIds.includes(sourceId));
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
const duplicateRecordIdsInOutput = Object.entries(
  countBy(repairedRecords.map((record) => record.recordId)),
)
  .filter(([, count]) => count > 1)
  .map(([recordId, count]) => ({ recordId, count }));
const recordSourceIdsMissingSource = repairedRecords
  .filter((record) => !selectedIdSet.has(record.sourceId))
  .map((record) => ({ recordId: record.recordId, sourceId: record.sourceId }));
const recordsWithoutEvidence = repairedRecords
  .filter(
    (record) =>
      !Array.isArray(record.evidenceCandidateIds) || record.evidenceCandidateIds.length === 0,
  )
  .map((record) => record.recordId);
const missingEvidenceRefs = repairedRecords.flatMap((record) =>
  (record.evidenceCandidateIds ?? [])
    .filter((candidateId) => !candidateIds.has(candidateId))
    .map((candidateId) => ({
      recordId: record.recordId,
      sourceId: record.sourceId,
      candidateId,
    })),
);
const recordsWithoutTreatmentLabels = repairedRecords
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
    routes: record.routes ?? [],
  }));
const duplicateStatusHistoryBuckets = repairedRecords.flatMap((record) => {
  const seen = new Set<string>();
  const duplicates: Array<{ recordId: string; sourceId: string; key: string }> = [];
  for (const entry of record.statusHistory ?? []) {
    const key = `${entry.status ?? ""}|${entry.asOfDate ?? ""}`;
    if (seen.has(key)) duplicates.push({ recordId: record.recordId, sourceId: record.sourceId, key });
    seen.add(key);
  }
  return duplicates;
});

const recordQualityIssueCounts: Record<string, number> = {};
const recordQualityRepairCounts: Record<string, number> = {};
for (const record of repairedRecords) {
  for (const issue of record.extraction?.qualityIssues ?? []) {
    recordQualityIssueCounts[issue] = (recordQualityIssueCounts[issue] ?? 0) + 1;
  }
  for (const repair of record.extraction?.qualityRepairs ?? []) {
    recordQualityRepairCounts[repair] = (recordQualityRepairCounts[repair] ?? 0) + 1;
  }
}
const droppedNoInterventionEvidenceCount = sources.reduce(
  (sum, source) => sum + Number(source.droppedNoInterventionEvidenceCount ?? 0),
  0,
);
if (droppedNoInterventionEvidenceCount > 0) {
  recordQualityIssueCounts["phase3_record_dropped_no_intervention_evidence"] =
    droppedNoInterventionEvidenceCount;
}

const summary = {
  selectedSourceCount: sources.length,
  extractedSourceCount: sources.filter((source) => source.status === "extracted").length,
  failedSourceCount: failedSources.length,
  recordCount: repairedRecords.length,
  unattachedCandidateCount: sources.reduce(
    (sum, source) => sum + Number(source.unattachedCandidateCount ?? 0),
    0,
  ),
  droppedNoInterventionEvidenceCount,
  recordQualityIssueCounts: sortedCounts(recordQualityIssueCounts),
  recordQualityRepairCounts: sortedCounts(recordQualityRepairCounts),
  duplicateRecordIdSkipped: duplicateRecordIds.length,
  mergeRepairCounts: {
    status_history_entries_collapsed: statusHistoryEntriesCollapsed,
    records_with_status_history_collapsed: recordsWithStatusHistoryCollapsed,
    custom_treatment_added_from_evidence: customTreatmentAddedFromEvidence,
    optional_null_fields_stripped: optionalNullFieldsStripped,
  },
};

const generatedAt = new Date().toISOString();
const output = {
  version: 2,
  generatedAt,
  ocrMarkdownCandidateExtractionPath: rel(candidatePath),
  outputPath: rel(outputPath),
  summary,
  mergeInputs: selections,
  sources,
  documentInterventionRecords: repairedRecords,
};

const report = {
  generatedAt,
  corpusPath: rel(outputPath),
  candidatesPath: rel(candidatePath),
  totals: {
    candidateSourceCount: candidateSourceIds.length,
    selectedSourceCount: sources.length,
    recordCount: repairedRecords.length,
    candidateCount: candidateList.length,
  },
  sourceCandidateCounts: countBy(
    candidateList
      .map((candidate) => candidate.sourceRef?.sourceId ?? candidate.sourceId)
      .filter((sourceId): sourceId is string => typeof sourceId === "string"),
  ),
  selections,
  checks: {
    missingSourceIds,
    extraSourceIds,
    failedSources,
    failedBuckets,
    duplicateRecordIds,
    duplicateRecordIdsInOutput,
    recordSourceIdsMissingSource,
    recordsWithoutEvidence,
    missingEvidenceRefs,
    recordsWithoutTreatmentLabels,
    duplicateStatusHistoryBuckets,
  },
  issueCountsFromRecords: summary.recordQualityIssueCounts,
  repairCountsFromRecords: summary.recordQualityRepairCounts,
  mergeRepairCounts: summary.mergeRepairCounts,
};

await Promise.all([
  writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`),
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
]);

console.log(`Wrote ${rel(outputPath)}`);
console.log(`Wrote ${rel(reportPath)}`);
console.log(
  `sources=${summary.selectedSourceCount} records=${summary.recordCount} failedSources=${summary.failedSourceCount} failedBuckets=${failedBuckets.length} duplicateRecordIds=${duplicateRecordIds.length} missingEvidenceRefs=${missingEvidenceRefs.length}`,
);
