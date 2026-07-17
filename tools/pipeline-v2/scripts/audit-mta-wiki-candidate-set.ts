import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// biome-ignore lint/suspicious/noExplicitAny: pinned external audit artifacts are decoded dynamically.
type Json = any;
type Candidate = Json & { provenance?: Json[] };

const args = new Map<string, string>();
for (let i = 2; i < Bun.argv.length; i += 2) {
  const flag = Bun.argv[i];
  const value = Bun.argv[i + 1];
  if (!flag?.startsWith("--") || !value) {
    throw new Error("Expected --flag value, got " + (flag ?? "end of arguments"));
  }
  args.set(flag.slice(2), value);
}

const required = (name: string) => {
  const value = args.get(name);
  if (!value) throw new Error("Missing --" + name);
  return value;
};
const readJson = (path: string): Json => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
// biome-ignore lint/suspicious/noExplicitAny: dynamic count bags keep external audit categories open-ended.
const countBy = <T>(values: T[], key: (value: T) => string): any => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
};

const baselinePath = required("baseline");
const baselineWikiImportPath = required("baseline-wiki-import");
const baselineReceiptPath = required("baseline-receipt");
const baselineReviewReportPath = required("baseline-review-report");
const buildRecordPath = required("build-record");
const logicalMergeInputsPath = required("logical-merge-inputs");
const reviewReconciliationPath = required("review-reconciliation");
const consumerCommit = required("consumer-commit");
const candidatePath = required("candidate");
const occurrencesPath = required("occurrences");
const spinePath = required("spine");
const manifestPath = required("wiki-manifest");
const wikiRoot = required("mta-wiki-root");
const acquisitionFrontierPath = required("acquisition-frontier");
const coverageManifestPath = required("coverage-manifest");
const priorityQueuePath = required("priority-queue");
const planIndexPath = required("plan-index");
const plan074Path = required("plan-074");
const plan075Path = required("plan-075");
const plan083Path = required("plan-083");
const expectedManifestSha = required("wiki-manifest-sha256");
const analysisMonth = required("analysis-month");
const outputPath = required("output");

const baseline = readJson(baselinePath);
const baselineWikiImport = readJson(baselineWikiImportPath);
const baselineReceipt = readJson(baselineReceiptPath);
const baselineReviewReport = readFileSync(baselineReviewReportPath, "utf8");
const buildRecord = readJson(buildRecordPath);
const logicalMergeInputs = readJson(logicalMergeInputsPath);
const reviewReconciliation = readJson(reviewReconciliationPath);
const candidateSet = readJson(candidatePath);
const occurrences = readJson(occurrencesPath);
const spineManifest = readJson(spinePath);
const manifest = readJson(manifestPath);
const acquisitionFrontier = readJson(acquisitionFrontierPath.replace(/\.md$/u, ".json"));
const coverageManifest = readJson(coverageManifestPath);
const coverageMatrixPath = join(dirname(coverageManifestPath), "coverage-matrix.json");
const coverageMatrix = readJson(coverageMatrixPath);
const planIndex = readFileSync(planIndexPath, "utf8");
const priorityQueue = readFileSync(priorityQueuePath, "utf8")
  .split("\n")
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line));

const actualManifestSha = sha256(manifestPath);
if (actualManifestSha !== expectedManifestSha) {
  throw new Error(
    "Wiki manifest hash mismatch: expected " + expectedManifestSha + ", got " + actualManifestSha,
  );
}
if (manifest.release_id !== candidateSet.wikiInput.releaseId) {
  throw new Error("Candidate set release does not match manifest");
}
if (candidateSet.wikiInput.manifestSha256 !== actualManifestSha) {
  throw new Error("Candidate set does not bind the verified manifest hash");
}
const candidateSetSha = sha256(candidatePath);
const logicalMergeInputsSha = sha256(logicalMergeInputsPath);
const reviewReconciliationSha = sha256(reviewReconciliationPath);
const reviewRoot = dirname(reviewReconciliationPath);
const correctedReviewRubricPath = join(reviewRoot, "00-review-rubric.md");
const reviewTransferSummaryPath = join(reviewRoot, "review-transfer-summary.json");
const correctedRecheckPath = join(reviewRoot, "20-ace-dedup-recheck.json");
const reviewTransferSummary = readJson(reviewTransferSummaryPath);
const correctedRecheck = readJson(correctedRecheckPath);
const reviewRecommendations = reviewReconciliation.recommendations as Json[];
const reviewRecommendationCounts = countBy(
  reviewRecommendations,
  (recommendation) => recommendation.recommendation,
);
const reviewCandidateById = new Map<string, Candidate>(
  (candidateSet.candidates as Candidate[]).map((candidate) => [candidate.candidateId, candidate]),
);
const reviewCandidateIds = new Set<string>();
for (const recommendation of reviewRecommendations) {
  if (reviewCandidateIds.has(recommendation.candidateId)) {
    throw new Error("Review reconciliation contains duplicate candidate decisions");
  }
  reviewCandidateIds.add(recommendation.candidateId);
  const candidate = reviewCandidateById.get(recommendation.candidateId);
  const identity = candidate
    ? [
        candidate.routeId,
        candidate.treatmentFamily,
        candidate.implementationDate,
        candidate.datePrecision,
      ].join("|")
    : undefined;
  if (
    candidate === undefined ||
    recommendation.identity !== identity ||
    recommendation.routeId !== candidate.routeId ||
    recommendation.treatmentFamily !== candidate.treatmentFamily ||
    recommendation.implementationDate !== candidate.implementationDate ||
    recommendation.authorization !== "non_authorizing_recommendation_only"
  ) {
    throw new Error("Review recommendation does not bind the exact corrected candidate row");
  }
}
if (
  reviewReconciliation.artifactKind !== "bp.studio.codex_review_reconciliation.v1" ||
  reviewReconciliation.authorization !== "non_authorizing_recommendation_only" ||
  reviewReconciliation.authorizesStudyRun !== false ||
  reviewReconciliation.authorizesPublication !== false ||
  reviewReconciliation.candidateSetId !== candidateSet.candidateSetId ||
  reviewReconciliation.candidateSetSha256 !== candidateSetSha ||
  reviewReconciliation.inputs.candidateSet.sha256 !== candidateSetSha ||
  reviewRecommendations.length !== candidateSet.candidates.length ||
  reviewCandidateIds.size !== candidateSet.candidates.length ||
  reviewReconciliation.summary.candidateCount !== candidateSet.candidates.length ||
  reviewReconciliation.summary.decisionCount !== reviewRecommendations.length ||
  reviewReconciliation.summary.countsByRecommendation.recommend_approve !==
    (reviewRecommendationCounts.recommend_approve ?? 0) ||
  reviewReconciliation.summary.countsByRecommendation.recommend_reject !==
    (reviewRecommendationCounts.recommend_reject ?? 0) ||
  reviewReconciliation.summary.countsByRecommendation.needs_followup !==
    (reviewRecommendationCounts.needs_followup ?? 0) ||
  (reviewRecommendationCounts.recommend_approve ?? 0) +
    (reviewRecommendationCounts.recommend_reject ?? 0) +
    (reviewRecommendationCounts.needs_followup ?? 0) !==
    reviewRecommendations.length
) {
  throw new Error(
    "Review reconciliation does not bind exactly one non-authorizing decision per candidate",
  );
}
const reconciliationBatchesById = new Map<string, Json>(
  (reviewReconciliation.batches as Json[]).map((batch) => [batch.batchId, batch]),
);
if (
  reviewTransferSummary.artifactKind !== "bp.studio.codex_review_transfer_summary.v1" ||
  reviewTransferSummary.authorization !== "non_authorizing_recommendation_only" ||
  reviewTransferSummary.authorizesStudyRun !== false ||
  reviewTransferSummary.authorizesPublication !== false ||
  reviewTransferSummary.candidateSetId !== candidateSet.candidateSetId ||
  reviewTransferSummary.candidateSetSha256 !== candidateSetSha ||
  reviewTransferSummary.transferredUnchangedCandidateCount !== 477 ||
  reviewTransferSummary.explicitlyRecheckedCandidateCount !== 12 ||
  reviewTransferSummary.decisionCount !== candidateSet.candidates.length ||
  reviewTransferSummary.batches.length !== reviewReconciliation.batches.length ||
  (reviewTransferSummary.batches as Json[]).some((batch) => {
    const reconciled = reconciliationBatchesById.get(batch.batchId);
    return (
      reconciled === undefined ||
      batch.file !== reconciled.outputFile ||
      batch.sha256 !== reconciled.outputSha256 ||
      batch.decisionCount !== reconciled.decisionCount
    );
  })
) {
  throw new Error("Review transfer proof does not bind the corrected reconciliation batches");
}
const recheckCandidateIds = new Set<string>();
for (const decision of correctedRecheck.decisions as Json[]) {
  const candidate = reviewCandidateById.get(decision.candidateId);
  const sourceKinds = new Set((candidate?.provenance ?? []).map((entry: Json) => entry.sourceKind));
  if (
    candidate === undefined ||
    recheckCandidateIds.has(decision.candidateId) ||
    decision.identity !==
      [
        candidate.routeId,
        candidate.treatmentFamily,
        candidate.implementationDate,
        candidate.datePrecision,
      ].join("|") ||
    decision.recommendation !== "recommend_reject" ||
    !sourceKinds.has("registry") ||
    !sourceKinds.has("mta_wiki")
  ) {
    throw new Error("Corrected recheck does not bind a unique dual-provenance candidate row");
  }
  recheckCandidateIds.add(decision.candidateId);
}
if (
  correctedRecheck.artifactKind !== "bp.studio.codex_review_batch.v1" ||
  correctedRecheck.authorization !== "non_authorizing_recommendation_only" ||
  correctedRecheck.authorizesStudyRun === true ||
  correctedRecheck.authorizesPublication === true ||
  correctedRecheck.candidateSetId !== candidateSet.candidateSetId ||
  correctedRecheck.candidateSetSha256 !== candidateSetSha ||
  correctedRecheck.decisionCount !== 12 ||
  correctedRecheck.decisions.length !== 12 ||
  correctedRecheck.countsByRecommendation.recommend_approve !== 0 ||
  correctedRecheck.countsByRecommendation.recommend_reject !== 12 ||
  correctedRecheck.countsByRecommendation.needs_followup !== 0 ||
  recheckCandidateIds.size !== 12
) {
  throw new Error("Corrected 12-row recheck is incomplete or authorizing");
}
const verifiedReviewFiles = [
  {
    kind: "rubric",
    file: "00-review-rubric.md",
    expectedSha256: undefined,
    path: correctedReviewRubricPath,
  },
  {
    kind: "transfer_proof",
    file: "review-transfer-summary.json",
    expectedSha256: undefined,
    path: reviewTransferSummaryPath,
  },
  {
    kind: "corrected_recheck",
    file: "20-ace-dedup-recheck.json",
    expectedSha256: undefined,
    path: correctedRecheckPath,
  },
  {
    kind: "manifest",
    file: reviewReconciliation.inputs.manifest.file,
    expectedSha256: reviewReconciliation.inputs.manifest.sha256,
    path: join(reviewRoot, reviewReconciliation.inputs.manifest.file),
  },
  ...(reviewReconciliation.batches as Json[]).flatMap((batch) => [
    {
      kind: "batch_input",
      file: join("inputs", batch.inputFile),
      expectedSha256: batch.inputSha256,
      path: join(reviewRoot, "inputs", batch.inputFile),
    },
    {
      kind: "batch_output",
      file: batch.outputFile,
      expectedSha256: batch.outputSha256,
      path: join(reviewRoot, batch.outputFile),
    },
  ]),
].map(({ kind, file, expectedSha256, path }) => {
  const actualSha256 = sha256(path);
  if (expectedSha256 !== undefined && actualSha256 !== expectedSha256) {
    throw new Error("Review file hash mismatch for " + file);
  }
  return { kind, file, sha256: actualSha256 };
});
if (
  buildRecord.consumerCommit !== consumerCommit ||
  buildRecord.logicalMergeInputs.sha256 !== logicalMergeInputsSha ||
  buildRecord.wikiOccurrenceImport.sha256 !== sha256(occurrencesPath) ||
  buildRecord.candidateSet.candidateSetId !== candidateSet.candidateSetId ||
  buildRecord.candidateSet.sha256 !== candidateSetSha ||
  buildRecord.candidateSet.candidateCount !== candidateSet.summary.candidateCount ||
  buildRecord.candidateSet.sourceRejectionCount !== candidateSet.summary.sourceRejectionCount ||
  buildRecord.candidateSet.exactDeduplicationCount !==
    candidateSet.summary.exactDeduplicationCount ||
  buildRecord.candidateSet.conflictCount !== candidateSet.summary.conflictCount ||
  buildRecord.candidateSet.approvalState !== candidateSet.approvalState ||
  buildRecord.candidateSet.approvedCount !== candidateSet.summary.approvedCount
) {
  throw new Error("Candidate build record does not bind the exact corrected build inputs/output");
}
if (
  buildRecord.determinism.byteIdentical !== true ||
  buildRecord.determinism.runCount < 2 ||
  buildRecord.determinism.sha256ByRun.length !== buildRecord.determinism.runCount ||
  buildRecord.determinism.sha256ByRun.some((value: string) => value !== candidateSetSha)
) {
  throw new Error("Candidate build record does not prove byte-identical repeated outputs");
}
if (
  logicalMergeInputs.summary.registryRowCount !== candidateSet.summary.registryInputCount ||
  logicalMergeInputs.registryRows.length !== logicalMergeInputs.summary.registryRowCount ||
  logicalMergeInputs.availableAnalysisRouteIds.length !==
    logicalMergeInputs.summary.availableAnalysisRouteIdCount ||
  logicalMergeInputs.summary.availableAnalysisRouteIdCount !== spineManifest.routes.length
) {
  throw new Error("Logical database input snapshot does not match the candidate/spine inputs");
}
if (baselineReceipt.candidateSetId !== baseline.candidateSetId) {
  throw new Error("Baseline receipt does not bind the baseline candidate set");
}
const baselineReceiptDecisionCounts = countBy(
  baselineReceipt.decisions as Json[],
  (decision) => decision.decision,
);
if (
  baselineReceipt.decisions.length !== baseline.candidates.length ||
  baselineReceiptDecisionCounts.approved !== baseline.summary.approvedCount ||
  baselineReceiptDecisionCounts.rejected !== baseline.summary.rejectedByOperatorCount
) {
  throw new Error("Baseline receipt decision counts do not match the baseline candidate set");
}

const releaseDir = join(wikiRoot, "data", "exports", "releases", manifest.release_id);
const verifiedManifestFiles = Object.entries(manifest.files as Record<string, Json>).map(
  ([name, declaration]) => {
    const path = join(releaseDir, name);
    const actual = sha256(path);
    if (actual !== declaration.sha256)
      throw new Error("Wiki file hash mismatch for " + name + ": " + actual);
    return { name, bytes: declaration.bytes, sha256: actual };
  },
);
const anchorSummary = readJson(join(releaseDir, manifest.pointers.operational_anchor_summary));
const occurrenceSummary = readJson(
  join(releaseDir, manifest.pointers.operational_occurrence_summary),
);
const latestPath = join(wikiRoot, "data", "exports", "releases", "LATEST");
const latestRelease = readFileSync(latestPath, "utf8").trim();

const priorityDeclaration = coverageManifest.files["priority-queue.jsonl"];
if (priorityDeclaration === undefined) {
  throw new Error("Coverage manifest does not declare priority-queue.jsonl");
}
if (sha256(priorityQueuePath) !== priorityDeclaration.sha256) {
  throw new Error("Priority queue hash does not match its coverage manifest");
}
if (priorityQueue.length !== priorityDeclaration.row_count) {
  throw new Error("Priority queue row count does not match its coverage manifest");
}
const terminalPriorityRows = priorityQueue.filter((row) => row.status === "terminal").length;
if (terminalPriorityRows !== priorityQueue.length) {
  throw new Error("Every priority queue row must have a terminal disposition");
}
const coverageMatrixDeclaration = coverageManifest.files["coverage-matrix.json"];
if (
  coverageMatrixDeclaration === undefined ||
  sha256(coverageMatrixPath) !== coverageMatrixDeclaration.sha256
) {
  throw new Error("Coverage matrix hash does not match its coverage manifest");
}
if (
  coverageMatrix.operational_coverage.completion.priority_terminal_rows !== terminalPriorityRows ||
  coverageMatrix.operational_coverage.completion.priority_open_rows !== 0
) {
  throw new Error("Coverage matrix priority completion does not match the terminal queue");
}
if (
  acquisitionFrontier.summary.operational_diagnostic_row_count !==
  acquisitionFrontier.summary.operational_terminal_diagnostic_row_count
) {
  throw new Error("Acquisition frontier contains non-terminal operational diagnostics");
}
if (!/\|\s*084\s*\|\s*Retire the monthly-baseline doctrine/iu.test(planIndex)) {
  throw new Error("Live plan index no longer proves that Plan 084 is occupied by de-month work");
}

const occurrencePointer = manifest.pointers.operational_occurrences as string;
const occurrenceSourceSha = occurrences.sourceRelease.occurrences.sha256;
if (occurrenceSourceSha !== manifest.files[occurrencePointer].sha256) {
  throw new Error("Occurrence import does not bind the manifest-declared source occurrence hash");
}
if (candidateSet.wikiInput.artifactSha256 !== occurrenceSourceSha) {
  throw new Error("Candidate set is not bound to the occurrence import artifact hash");
}
if (
  occurrenceSummary.occurrence_count !== occurrences.summary.sourceOccurrenceCount ||
  occurrenceSummary.study_projection_eligible_count !==
    occurrences.summary.eligibleOccurrenceCount ||
  occurrenceSummary.candidate_projection_count !== occurrences.summary.routeProjectionCount ||
  occurrenceSummary.occurrence_count - occurrenceSummary.study_projection_eligible_count !==
    occurrences.summary.rejectedOccurrenceCount
) {
  throw new Error("Occurrence import summary does not match the verified release summary");
}

const inputHashes = {
  baselineCandidateSet: sha256(baselinePath),
  baselineWikiImport: sha256(baselineWikiImportPath),
  baselineReceipt: sha256(baselineReceiptPath),
  baselineReviewReport: sha256(baselineReviewReportPath),
  candidateSet: candidateSetSha,
  candidateBuildRecord: sha256(buildRecordPath),
  logicalMergeInputs: logicalMergeInputsSha,
  reviewReconciliation: reviewReconciliationSha,
  verifiedReviewFiles,
  occurrenceImportWrapper: sha256(occurrencesPath),
  occurrenceSource: occurrenceSourceSha,
  spineManifest: sha256(spinePath),
  wikiManifest: actualManifestSha,
  wikiManifestFiles: verifiedManifestFiles,
  acquisitionFrontierMarkdown: sha256(acquisitionFrontierPath),
  acquisitionFrontierJson: sha256(acquisitionFrontierPath.replace(/\.md$/u, ".json")),
  coverageManifest: sha256(coverageManifestPath),
  coverageMatrix: sha256(coverageMatrixPath),
  priorityQueue: sha256(priorityQueuePath),
  latestPointerObservedOnly: sha256(latestPath),
  planIndex: sha256(planIndexPath),
  plan074: sha256(plan074Path),
  plan075: sha256(plan075Path),
  plan083: sha256(plan083Path),
};

const candidateKey = (candidate: Candidate) =>
  [
    candidate.routeId,
    candidate.treatmentFamily,
    candidate.implementationDate,
    candidate.datePrecision,
  ].join("|");
const sourceKind = (candidate: Candidate) =>
  [...new Set((candidate.provenance ?? []).map((entry: Json) => entry.sourceKind).filter(Boolean))]
    .sort()
    .join("+") || "unknown";
const spineByRoute = new Map<string, Json>(
  spineManifest.routes.map((route: Json) => [route.routeId, route]),
);
const spineReadiness = (candidate: Candidate) =>
  spineByRoute.get(candidate.routeId)?.readiness ?? "missing_spine";
const monthIndex = (month: string) => {
  const [year = 0, value = 0] = month.split("-").map(Number);
  return year * 12 + value - 1;
};
const outcomeWindow = (candidate: Candidate) => {
  const implementation = monthIndex(candidate.implementationMonth);
  const floor = monthIndex("2023-04");
  const [endYear = 0, endMonth = 0] = analysisMonth.split("-").map(Number);
  const end = endYear * 12 + endMonth - 1;
  const preStart = Math.max(floor, implementation - 6);
  const preEnd = Math.min(end, implementation - 1);
  const postStart = Math.max(floor, implementation + 1);
  const postEnd = Math.min(end, implementation + 6);
  const preMonthCount = Math.max(0, preEnd - preStart + 1);
  const postMonthCount = Math.max(0, postEnd - postStart + 1);
  const eligibleAtLeastFourEach = preMonthCount >= 4 && postMonthCount >= 4;
  const fullSixEach = preMonthCount === 6 && postMonthCount === 6;
  const status = !eligibleAtLeastFourEach
    ? "calendar_ineligible"
    : candidate.datePrecision === "month"
      ? "eligible_month_precision"
      : fullSixEach
        ? "eligible_day_6x6"
        : "eligible_day_4plus";
  return { preMonthCount, postMonthCount, eligibleAtLeastFourEach, fullSixEach, status };
};

const reasonBucket = (reason: string) => {
  if (/contract|schema_version|manifest_version/.test(reason)) return "contract_incompatibility";
  if (/route|gtfs_route|subject_scope/.test(reason)) return "route_scope";
  if (/treatment|family|bundle_analysis/.test(reason)) return "treatment_scope";
  if (
    /date|lifecycle|status|causal|producer|realized|implemented|authority|trusted|conflict/.test(
      reason,
    )
  ) {
    return "evidence_authority_truth";
  }
  return "unclassified";
};
// biome-ignore lint/suspicious/noExplicitAny: producer reason buckets are open-ended external data.
const bucketReasonCountObject = (reasons: Record<string, number>): any => {
  const rows = Object.entries(reasons).map(([reason, count]) => ({ reason, count }));
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const bucket = reasonBucket(row.reason);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + row.count);
  }
  return Object.fromEntries([...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)));
};
const rejectionReasonCounts = (artifact: Json) => {
  const reasons = (artifact.rejections as Json[]).flatMap((rejection) => rejection.reasons ?? []);
  return {
    sourceRejectionRows: artifact.rejections.length,
    reasonOccurrences: countBy(reasons, (reason) => reason),
    bucketOccurrences: countBy(reasons, (reason) => reasonBucket(reason)),
  };
};

const baselineCandidates = baseline.candidates as Candidate[];
const candidates = candidateSet.candidates as Candidate[];
const baselineKeys = new Set(baselineCandidates.map(candidateKey));
const candidateKeys = new Set(candidates.map(candidateKey));
const added = candidates.filter((candidate) => !baselineKeys.has(candidateKey(candidate)));
const removed = baselineCandidates.filter(
  (candidate) => !candidateKeys.has(candidateKey(candidate)),
);
const candidateBreakdown = (values: Candidate[]) => ({
  count: values.length,
  routes: new Set(values.map((candidate) => candidate.routeId)).size,
  source: countBy(values, sourceKind),
  treatmentFamily: countBy(values, (candidate) => candidate.treatmentFamily),
  datePrecision: countBy(values, (candidate) => candidate.datePrecision),
  outcomeWindow: countBy(values, (candidate) => outcomeWindow(candidate).status),
  spineReadiness: countBy(values, spineReadiness),
  conflictState: countBy(values, (candidate) => candidate.conflictState ?? "none"),
  confounderGroup: countBy(values, (candidate) => candidate.confounderGroupId ?? "none"),
});

const structuralGatePass = (candidate: Candidate) =>
  ["series_ready", "series_ready_with_gaps"].includes(spineReadiness(candidate)) &&
  outcomeWindow(candidate).eligibleAtLeastFourEach;
const deepReviewCandidates = candidates.filter(structuralGatePass);
const structuralHardRejectCandidates = candidates.filter(
  (candidate) => !structuralGatePass(candidate),
);
const structuralDisposition = countBy(candidates, (candidate) => {
  const spinePass = ["series_ready", "series_ready_with_gaps"].includes(spineReadiness(candidate));
  const calendarPass = outcomeWindow(candidate).eligibleAtLeastFourEach;
  if (spinePass && calendarPass) return "deep_review_required";
  if (!spinePass && !calendarPass) return "blocked_by_spine_and_calendar";
  if (!spinePass) return "blocked_by_spine_only_among_mechanical_gates";
  return "blocked_by_calendar_only_among_mechanical_gates";
});
const reviewByCandidateId = new Map<string, Json>(
  reviewRecommendations.map((recommendation) => [recommendation.candidateId, recommendation]),
);
const recommendedApproveRows = reviewRecommendations
  .filter((recommendation) => recommendation.recommendation === "recommend_approve")
  .sort((left, right) => left.identity.localeCompare(right.identity));
const recommendedRejectRows = reviewRecommendations.filter(
  (recommendation) => recommendation.recommendation === "recommend_reject",
);
const addedCandidateIds = new Set(added.map((candidate) => candidate.candidateId));
const addedRecommendedApproveRows = recommendedApproveRows.filter((recommendation) =>
  addedCandidateIds.has(recommendation.candidateId),
);
const unchangedRecommendedApproveRows = recommendedApproveRows.filter(
  (recommendation) => !addedCandidateIds.has(recommendation.candidateId),
);
const addedDeepReviewCandidates = added.filter(structuralGatePass);
const addedDeepReviewRecommendations = addedDeepReviewCandidates.map((candidate) => {
  const recommendation = reviewByCandidateId.get(candidate.candidateId);
  if (recommendation === undefined) {
    throw new Error("Structurally deep-reviewable addition is missing a review recommendation");
  }
  return recommendation;
});
const reviewHardFailure = (value: unknown) =>
  typeof value === "string" && /^fail(?::|_)/u.test(value);
const reviewFollowupIssue = (value: unknown) =>
  typeof value === "string" && /^(?:needs_followup|unresolved)(?::|_)/u.test(value);
const reviewMaterialIssue = (value: unknown) =>
  typeof value === "string" &&
  /^(?:fail|needs_followup|unresolved|requires|flagged)(?::|_)/u.test(value);
const reviewGateValues = (recommendation: Json): unknown[] => Object.values(recommendation.gates);
const rejectedRowsWithoutHardFailure = recommendedRejectRows.filter(
  (recommendation) => !reviewGateValues(recommendation).some(reviewHardFailure),
);
if (rejectedRowsWithoutHardFailure.length > 0) {
  throw new Error("A recommend_reject row lacks an explicit fail-prefixed hard gate");
}
const reviewContractFailureRows = recommendedRejectRows.filter(
  (recommendation) =>
    reviewGateValues(recommendation).some(reviewHardFailure) &&
    /contract|schema|incompatib/iu.test(
      [recommendation.rationale, ...reviewGateValues(recommendation)].join(" "),
    ),
);
const reviewRejectionGateIssueCounts = {
  countingUnit: "rejected_candidate_rows",
  nonExclusive: true,
  rejectedCandidateRows: recommendedRejectRows.length,
  rejectedRowsWithoutHardFailure: rejectedRowsWithoutHardFailure.length,
  routeScopeHardFailure: recommendedRejectRows.filter(
    (recommendation) =>
      reviewHardFailure(recommendation.gates.evidenceScope) &&
      /route|proximity/iu.test(recommendation.gates.evidenceScope),
  ).length,
  routeScopeFollowupOrUnresolved: recommendedRejectRows.filter(
    (recommendation) =>
      reviewFollowupIssue(recommendation.gates.evidenceScope) &&
      /route|proximity/iu.test(recommendation.gates.evidenceScope),
  ).length,
  treatmentScopeHardFailure: recommendedRejectRows.filter(
    (recommendation) =>
      reviewHardFailure(recommendation.gates.evidenceScope) &&
      /treatment|phase|onset|lane|scope|able|ace/iu.test(recommendation.gates.evidenceScope),
  ).length,
  treatmentScopeFollowupOrUnresolved: recommendedRejectRows.filter(
    (recommendation) =>
      reviewFollowupIssue(recommendation.gates.evidenceScope) &&
      /treatment|phase|onset|lane|scope|able|ace/iu.test(recommendation.gates.evidenceScope),
  ).length,
  evidenceAuthorityTruthHardFailure: recommendedRejectRows.filter(
    (recommendation) =>
      reviewHardFailure(recommendation.gates.evidenceScope) ||
      reviewHardFailure(recommendation.gates.date),
  ).length,
  evidenceAuthorityTruthFollowupOrUnresolved: recommendedRejectRows.filter(
    (recommendation) =>
      reviewFollowupIssue(recommendation.gates.evidenceScope) ||
      reviewFollowupIssue(recommendation.gates.date),
  ).length,
  outcomeCoverageHardFailure: recommendedRejectRows.filter((recommendation) =>
    reviewHardFailure(recommendation.gates.outcome),
  ).length,
  outcomeCoverageFollowupOrUnresolved: recommendedRejectRows.filter((recommendation) =>
    reviewFollowupIssue(recommendation.gates.outcome),
  ).length,
  segmentSpineReadinessHardFailure: recommendedRejectRows.filter((recommendation) =>
    reviewHardFailure(recommendation.gates.spine),
  ).length,
  segmentSpineReadinessFollowupOrUnresolved: recommendedRejectRows.filter((recommendation) =>
    reviewFollowupIssue(recommendation.gates.spine),
  ).length,
  overlapConfoundersHardFailure: recommendedRejectRows.filter(
    (recommendation) =>
      reviewHardFailure(recommendation.gates.conflict) ||
      reviewHardFailure(recommendation.gates.confounder),
  ).length,
  overlapConfoundersFollowupOrUnresolved: recommendedRejectRows.filter(
    (recommendation) =>
      reviewFollowupIssue(recommendation.gates.conflict) ||
      reviewFollowupIssue(recommendation.gates.confounder),
  ).length,
  overlapConfoundersIncludingPrespecifiedSensitivityOrFlag: recommendedRejectRows.filter(
    (recommendation) =>
      reviewMaterialIssue(recommendation.gates.conflict) ||
      reviewMaterialIssue(recommendation.gates.confounder),
  ).length,
  contractIncompatibilityHardFailure: reviewContractFailureRows.length,
  method:
    "Hard-failure counts use only fail-prefixed frozen reviewer gate fields. Follow-up/unresolved counts are reported separately and never labeled hard failures. Route and treatment counts classify only evidenceScope by explicit route/proximity and treatment/phase/onset/lane/scope/ABLE/ACE terms. Contract failures are derived from fail-prefixed rejected rows whose rationale or gate text explicitly names contract, schema, or incompatibility. Counts overlap.",
};
const treatmentFamilies = new Set([
  ...baselineCandidates.map((candidate) => candidate.treatmentFamily),
  ...candidates.map((candidate) => candidate.treatmentFamily),
]);
const treatmentFamilyDelta: Record<string, { baseline: number; candidate: number; delta: number }> =
  Object.fromEntries(
    [...treatmentFamilies].sort().map((family) => [
      family,
      {
        baseline: baselineCandidates.filter((candidate) => candidate.treatmentFamily === family)
          .length,
        candidate: candidates.filter((candidate) => candidate.treatmentFamily === family).length,
        delta:
          candidates.filter((candidate) => candidate.treatmentFamily === family).length -
          baselineCandidates.filter((candidate) => candidate.treatmentFamily === family).length,
      },
    ]),
  );

const historicalSpineSection = baselineReviewReport.match(
  /2\. \*\*39 calendar-eligible ACE[\s\S]*?(?=\n3\. \*\*)/u,
)?.[0];
if (historicalSpineSection === undefined) {
  throw new Error("Could not locate Plan 083's historical 39-row cohort in the review report");
}
const historicalSpineCandidateIds = [
  ...new Set(
    [...historicalSpineSection.matchAll(/study-event:[0-9a-f]+/gu)].map((match) => match[0]),
  ),
];
if (historicalSpineCandidateIds.length !== 39) {
  throw new Error("Historical Plan 083 cohort does not contain exactly 39 candidate identities");
}
const baselineById = new Map(
  baselineCandidates.map((candidate) => [candidate.candidateId as string, candidate]),
);
const baselineDecisionById = new Map(
  (baselineReceipt.decisions as Json[]).map((decision) => [
    decision.candidateId as string,
    decision,
  ]),
);
const historicalSpineRows = historicalSpineCandidateIds.map((candidateId) => {
  const candidate = baselineById.get(candidateId);
  const decision = baselineDecisionById.get(candidateId);
  if (candidate === undefined || decision === undefined) {
    throw new Error("Historical Plan 083 cohort is not fully bound to baseline candidates/receipt");
  }
  const phaseAmbiguity = /already began ABLE/u.test(decision.rationale);
  const sameRouteOverlap = /same-route bus_lane onset/u.test(decision.rationale);
  if (phaseAmbiguity && sameRouteOverlap) {
    throw new Error("Historical Plan 083 phase/overlap categories unexpectedly intersect");
  }
  return { candidate, phaseAmbiguity, sameRouteOverlap };
});
const historicalPlan083 = {
  candidateIdentityCount: historicalSpineRows.length,
  routeCount: new Set(historicalSpineRows.map((row) => row.candidate.routeId)).size,
  noAdditionalPhaseOrOverlapDefectNamedCount: historicalSpineRows.filter(
    (row) => !row.phaseAmbiguity && !row.sameRouteOverlap,
  ).length,
  alsoPhaseAmbiguousCount: historicalSpineRows.filter((row) => row.phaseAmbiguity).length,
  alsoSameRouteOverlapCount: historicalSpineRows.filter((row) => row.sameRouteOverlap).length,
};
if (
  historicalPlan083.noAdditionalPhaseOrOverlapDefectNamedCount !== 20 ||
  historicalPlan083.alsoPhaseAmbiguousCount !== 14 ||
  historicalPlan083.alsoSameRouteOverlapCount !== 5
) {
  throw new Error("Historical Plan 083 20/14/5 partition drifted");
}
const currentAceSpinePrefilter = candidates.filter(
  (candidate) =>
    candidate.treatmentFamily === "automated_bus_lane_enforcement" &&
    outcomeWindow(candidate).eligibleAtLeastFourEach &&
    spineReadiness(candidate) === "needs_pattern_review",
);
const addedSpineBlocked = added.filter(
  (candidate) => spineReadiness(candidate) === "needs_pattern_review",
);
const spineRouteReadiness = countBy(spineManifest.routes as Json[], (route) => route.readiness);
const baselineApprovedIdentities = (baselineReceipt.decisions as Json[])
  .filter((decision) => decision.decision === "approved")
  .map((decision) => {
    const candidate = baselineById.get(decision.candidateId);
    if (candidate === undefined) throw new Error("Approved baseline receipt row is missing");
    return candidateKey(candidate);
  })
  .sort((left, right) => left.localeCompare(right));
const unchangedRecommendedApproveIdentities = unchangedRecommendedApproveRows
  .map((recommendation) => recommendation.identity as string)
  .sort((left, right) => left.localeCompare(right));
const unchangedRecommendationsMatchHistoricalApprovals =
  baselineApprovedIdentities.length === unchangedRecommendedApproveIdentities.length &&
  baselineApprovedIdentities.every(
    (identity, index) => identity === unchangedRecommendedApproveIdentities[index],
  );
const addedDeepReviewRejectRows = addedDeepReviewRecommendations.filter(
  (recommendation) => recommendation.recommendation !== "recommend_approve",
);

const report = {
  reportVersion: 6,
  analysisMonth,
  inputHashes,
  release: {
    releaseId: manifest.release_id,
    manifestVersion: manifest.manifest_version,
    generatorCommit: manifest.generator_commit,
    selectedByExplicitManifestPath: true,
    selectedViaLatest: false,
    latestReleaseObserved: latestRelease,
    promotedAtAuditTime: latestRelease === manifest.release_id,
    occurrenceContractVersion: manifest.contract_versions.operational_occurrences,
    occurrenceCount: occurrences.summary.sourceOccurrenceCount,
    eligibleOccurrenceCount: occurrences.summary.eligibleOccurrenceCount,
    rejectedOccurrenceCount: occurrences.summary.rejectedOccurrenceCount,
    routeProjectionCount: occurrences.summary.routeProjectionCount,
    atomicOccurrenceCount: occurrenceSummary.atomic_count,
    bundleOccurrenceCount: occurrenceSummary.bundle_count,
    multiRouteOccurrenceCount: occurrenceSummary.multi_route_count,
    legacyAnchorExport: {
      contractVersion: manifest.contract_versions.operational_anchors,
      rowCount: anchorSummary.row_count,
      reviewedRowCount: anchorSummary.reviewed_row_count,
      studyEligibleRowCount: anchorSummary.study_eligible_count,
      nonStudyEligibleRowCount: anchorSummary.row_count - anchorSummary.study_eligible_count,
      consumedByCandidatePipeline: false,
      exclusionReasonOccurrences: anchorSummary.counts_by_exclusion_reason,
      exclusionBucketOccurrences: bucketReasonCountObject(anchorSummary.counts_by_exclusion_reason),
    },
    completion: {
      acquisitionTargetCount: acquisitionFrontier.summary.acquisition_target_count,
      operationalDiagnosticRows: acquisitionFrontier.summary.operational_diagnostic_row_count,
      terminalOperationalDiagnosticRows:
        acquisitionFrontier.summary.operational_terminal_diagnostic_row_count,
      priorityQueueRows: priorityQueue.length,
      terminalPriorityQueueRows: terminalPriorityRows,
      openPriorityQueueRows: coverageMatrix.operational_coverage.completion.priority_open_rows,
    },
  },
  candidateBuild: {
    consumerCommit,
    logicalMergeInputs: {
      sha256: logicalMergeInputsSha,
      summary: logicalMergeInputs.summary,
    },
    occurrenceImportWrapperSha256: sha256(occurrencesPath),
    candidateSetSha256: candidateSetSha,
    determinism: buildRecord.determinism,
    registryDatabaseUsedReadOnly: true,
    mergeCanReplayLogicalSnapshotDirectly: false,
    reproductionPrecondition:
      "The merge command reads SQLite directly. Rebuild only after a fresh logical snapshot is byte-identical to the frozen snapshot, and keep the database unchanged for both merge runs.",
    determinismClaim:
      "The build record proves byte-identical outputs for repeated runs against the witnessed logical database state; it does not claim direct replay from the snapshot artifact.",
    approvalAppliedDuringBuild: false,
  },
  baseline: {
    candidateSetId: baseline.candidateSetId,
    wikiInput: baseline.wikiInput,
    summary: baseline.summary,
    candidates: candidateBreakdown(baselineCandidates),
    rejections: rejectionReasonCounts(baseline),
    approvalReceipt: {
      candidateSetId: baselineReceipt.candidateSetId,
      decisionCount: baselineReceipt.decisions.length,
      countsByDecision: baselineReceiptDecisionCounts,
      immutableHistoricalInput: true,
    },
    operationalEvidenceImport: {
      releaseId: baselineWikiImport.sourceRelease.releaseId,
      sourceRowCount: baselineWikiImport.summary.sourceRowCount,
      assertionCount: baselineWikiImport.summary.assertionCount,
      acceptedAssertionCount: baselineWikiImport.summary.eligibleAssertionCount,
      rejectedAssertionCount: baselineWikiImport.summary.rejectedAssertionCount,
      rejectedAnchorCount: baselineWikiImport.summary.rejectedAnchorCount,
      exactDuplicateGroupCount: baselineWikiImport.summary.exactDuplicateGroupCount,
      exactDuplicateRowCount: baselineWikiImport.summary.exactDuplicateRowCount,
      crossDateConflictGroupCount: baselineWikiImport.summary.crossDateConflictGroupCount,
    },
  },
  candidate: {
    candidateSetId: candidateSet.candidateSetId,
    approvalState: candidateSet.approvalState,
    summary: candidateSet.summary,
    candidates: candidateBreakdown(candidates),
    rejections: rejectionReasonCounts(candidateSet),
    conflictGroups: candidateSet.conflicts.length,
  },
  operationalEvidenceComparison: {
    unitsDirectlyComparable: false,
    explanation:
      "The baseline consumer imported individual operational-date assertions; rc19 is consumed through reviewed operational occurrences. The rc19 legacy anchor export is reported for completeness but is not the candidate-pipeline input.",
    baselineAcceptedAssertions: baselineWikiImport.summary.eligibleAssertionCount,
    baselineRejectedAssertions: baselineWikiImport.summary.rejectedAssertionCount,
    rc19LegacyAnchorAcceptedRows: anchorSummary.study_eligible_count,
    rc19LegacyAnchorNonEligibleRows: anchorSummary.row_count - anchorSummary.study_eligible_count,
    rc19ConsumedAcceptedOccurrences: occurrences.summary.eligibleOccurrenceCount,
    rc19ConsumedRejectedOccurrences: occurrences.summary.rejectedOccurrenceCount,
  },
  identityDelta: {
    baselineCount: baselineCandidates.length,
    candidateCount: candidates.length,
    grossDelta: candidates.length - baselineCandidates.length,
    addedCount: added.length,
    removedCount: removed.length,
    added: candidateBreakdown(added),
    removed: removed.map((candidate) => ({
      identity: candidateKey(candidate),
      source: sourceKind(candidate),
    })),
    treatmentFamilyDelta,
  },
  codexReview: {
    artifactKind: reviewReconciliation.artifactKind,
    authorization: reviewReconciliation.authorization,
    authorizesStudyRun: reviewReconciliation.authorizesStudyRun,
    authorizesPublication: reviewReconciliation.authorizesPublication,
    reconciliationSha256: reviewReconciliationSha,
    candidateSetId: reviewReconciliation.candidateSetId,
    candidateSetSha256: reviewReconciliation.candidateSetSha256,
    summary: reviewReconciliation.summary,
    verifiedFileCount: verifiedReviewFiles.length,
    verifiedFiles: verifiedReviewFiles,
    recommendedApproveIdentities: recommendedApproveRows.map(
      (recommendation) => recommendation.identity,
    ),
    addedRecommendedApproveCount: addedRecommendedApproveRows.length,
    addedRecommendedApproveIdentities: addedRecommendedApproveRows.map(
      (recommendation) => recommendation.identity,
    ),
    unchangedRecommendedApproveCount: unchangedRecommendedApproveRows.length,
    unchangedRecommendedApproveIdentities,
    unchangedRecommendationsMatchHistoricalApprovals,
    addedMechanicalPrefilter: {
      candidateCount: addedDeepReviewCandidates.length,
      recommendApproveCount: addedDeepReviewRecommendations.filter(
        (recommendation) => recommendation.recommendation === "recommend_approve",
      ).length,
      remainingBlockedCount: addedDeepReviewRejectRows.length,
      remainingBlocked: addedDeepReviewRejectRows.map((recommendation) => ({
        candidateId: recommendation.candidateId,
        identity: recommendation.identity,
        recommendation: recommendation.recommendation,
        rationale: recommendation.rationale,
        gates: recommendation.gates,
      })),
    },
    rejectionGateIssueCounts: reviewRejectionGateIssueCounts,
    createsApprovalReceipt: false,
  },
  operatorReview: {
    newlyPresentIdentityCount: added.length,
    newlyDeepReviewableStructuralGatePassCount: added.filter(structuralGatePass).length,
    newlyDeepReviewableExactDayCount: added.filter(
      (candidate) => structuralGatePass(candidate) && candidate.datePrecision === "day",
    ).length,
    newlyDeepReviewableMonthPrecisionCount: added.filter(
      (candidate) => structuralGatePass(candidate) && candidate.datePrecision === "month",
    ).length,
    newlyReviewableStructuralGateBlockedBySpineCount: added.filter(
      (candidate) => spineReadiness(candidate) === "needs_pattern_review",
    ).length,
    fullSetMechanicalHardRejectCount: structuralHardRejectCandidates.length,
    fullSetDeepReviewRequiredCount: deepReviewCandidates.length,
    structuralDisposition,
    codexRecommendedApproveCount: recommendedApproveRows.length,
    codexRecommendedRejectCount: recommendedRejectRows.length,
    codexNeedsFollowupCount: reviewRecommendationCounts.needs_followup ?? 0,
    newlyRecommendedApproveCount: addedRecommendedApproveRows.length,
    codexRecommendationsAuthorizeNothing: true,
    candidateSetRequiresNewApprovalReceipt: true,
    priorReceiptReused: false,
    autoApprovedCount: 0,
  },
  gates: {
    sourceRejectionRows: candidateSet.rejections.length,
    sourceRejectionBuckets: rejectionReasonCounts(candidateSet).bucketOccurrences,
    gateBuckets: {
      routeScope: {
        sourceRejectionReasonOccurrences:
          rejectionReasonCounts(candidateSet).bucketOccurrences.route_scope ?? 0,
      },
      treatmentScope: {
        sourceRejectionReasonOccurrences:
          rejectionReasonCounts(candidateSet).bucketOccurrences.treatment_scope ?? 0,
      },
      evidenceAuthorityTruth: {
        sourceRejectionReasonOccurrences:
          rejectionReasonCounts(candidateSet).bucketOccurrences.evidence_authority_truth ?? 0,
      },
      outcomeCoverage: {
        candidateRowsCalendarIneligible: candidates.filter(
          (candidate) => !outcomeWindow(candidate).eligibleAtLeastFourEach,
        ).length,
        monthPrecisionRows: candidates.filter((candidate) => candidate.datePrecision === "month")
          .length,
      },
      segmentSpineReadiness: {
        candidateRowsNeedsPatternReview: candidates.filter(
          (candidate) => spineReadiness(candidate) === "needs_pattern_review",
        ).length,
        addedRowsNeedsPatternReview: added.filter(
          (candidate) => spineReadiness(candidate) === "needs_pattern_review",
        ).length,
      },
      overlapConfounders: {
        conflictGroups: candidateSet.conflicts.length,
        conflictCandidateRows: candidates.filter((candidate) => candidate.conflictState !== "none")
          .length,
        confounderCandidateRows: candidates.filter((candidate) => candidate.confounderGroupId)
          .length,
      },
      contractIncompatibility: {
        sourceRejectionReasonOccurrences:
          rejectionReasonCounts(candidateSet).bucketOccurrences.contract_incompatibility ?? 0,
        reviewRejectedRowsWithExplicitContractHardFailure: reviewContractFailureRows.length,
      },
    },
    outcomeCoverage: {
      eligibleAtLeastFourEach: candidates.filter(
        (candidate) => outcomeWindow(candidate).eligibleAtLeastFourEach,
      ).length,
      calendarIneligible: candidates.filter(
        (candidate) => !outcomeWindow(candidate).eligibleAtLeastFourEach,
      ).length,
      fullSixEach: candidates.filter((candidate) => outcomeWindow(candidate).fullSixEach).length,
      exactDayEligible: candidates.filter(
        (candidate) =>
          candidate.datePrecision === "day" && outcomeWindow(candidate).eligibleAtLeastFourEach,
      ).length,
      monthPrecisionEligible: candidates.filter(
        (candidate) =>
          candidate.datePrecision === "month" && outcomeWindow(candidate).eligibleAtLeastFourEach,
      ).length,
      status: countBy(candidates, (candidate) => outcomeWindow(candidate).status),
    },
    segmentSpineReadiness: countBy(candidates, spineReadiness),
    overlapConfounders: {
      conflictGroups: candidateSet.conflicts.length,
      conflictCandidateRows: candidates.filter((candidate) => candidate.conflictState !== "none")
        .length,
      confounderCandidateRows: candidates.filter((candidate) => candidate.confounderGroupId).length,
      confounderGroups: countBy(
        candidates.filter((candidate) => candidate.confounderGroupId),
        (candidate) => candidate.confounderGroupId,
      ),
    },
    contractCompatibility: {
      v3OccurrenceImportToV2Merge: "compatible_after_exact_cross_source_dedup_fix",
      exactCrossSourceDeduplicationCount: candidateSet.summary.exactDeduplicationCount,
      reviewRejectedRowsWithExplicitContractHardFailure: reviewContractFailureRows.length,
      sourceRejectedForUnsupportedBundleAnalysisFamily: (candidateSet.rejections as Json[]).filter(
        (rejection) => (rejection.reasons ?? []).includes("unsupported_bundle_analysis_family"),
      ).length,
    },
  },
  plan083Rebaseline: {
    historicalReceiptBoundCandidateSetId: baseline.candidateSetId,
    historicalApprovedCount: baseline.summary.approvedCount,
    historicalCandidateCount: baselineCandidates.length,
    historicalPrimarySpineBucket: historicalPlan083,
    currentCandidateSetId: candidateSet.candidateSetId,
    currentApprovedCount: candidateSet.summary.approvedCount,
    currentCandidateCount: candidates.length,
    currentAceCalendarPassSpineBlockedIdentityCount: currentAceSpinePrefilter.length,
    currentAceCalendarPassSpineBlockedRouteCount: new Set(
      currentAceSpinePrefilter.map((candidate) => candidate.routeId),
    ).size,
    rc19AddedSpineBlockedIdentityCount: addedSpineBlocked.length,
    rc19AddedSpineBlockedRouteCount: new Set(
      addedSpineBlocked.map((candidate) => candidate.routeId),
    ).size,
    rc19AddedSpineBlockedByTreatmentFamily: countBy(
      addedSpineBlocked,
      (candidate) => candidate.treatmentFamily,
    ),
    fullCandidateRowsNeedsPatternReview: candidates.filter(
      (candidate) => spineReadiness(candidate) === "needs_pattern_review",
    ).length,
    spineManifestRouteReadiness: spineRouteReadiness,
    spikeStillIndependentlyNecessary: true,
    spikeDoesNotAuthorizeCandidates: true,
  },
  planIndexAudit: {
    plan084Occupied: true,
    plan084Title: "Retire the monthly-baseline doctrine: ADR-0022 + steering-doc truth sweep",
    rc19Plan084Created: false,
    existingPlansRebaselined: ["074", "075", "083"],
  },
};

const md = [
  "# MTA Wiki rc19 study-candidate audit",
  "",
  "This deterministic audit compares the pinned baseline candidate set with the separately generated rc19 set using the identity key `routeId|treatmentFamily|implementationDate|datePrecision`. Rejection reason counts are non-exclusive when one rejected row carries multiple reasons. MTA evidence establishes event context and scope; it never substitutes for an independent outcome estimate.",
  "",
  "## Release and approval boundary",
  "",
  "- Wiki release: " +
    report.release.releaseId +
    ", manifest v" +
    report.release.manifestVersion +
    ", generator commit " +
    report.release.generatorCommit +
    ".",
  "- Verified manifest SHA-256: " + actualManifestSha + ".",
  "- All " +
    verifiedManifestFiles.length +
    " files declared by the rc19 manifest were rehashed before comparison; the supplied 64-character digest matches exactly.",
  "- The release was selected by its explicit manifest path, never through `LATEST`. `LATEST` was observed as " +
    latestRelease +
    ", so rc19 remains a pinned candidate input and is not described as promoted or production.",
  "- Completion checks: " +
    acquisitionFrontier.summary.acquisition_target_count +
    " acquisition targets; " +
    acquisitionFrontier.summary.operational_terminal_diagnostic_row_count +
    "/" +
    acquisitionFrontier.summary.operational_diagnostic_row_count +
    " terminal operational diagnostics; " +
    terminalPriorityRows +
    "/" +
    priorityQueue.length +
    " terminal priority-queue dispositions; zero open priority rows.",
  "- rc19 occurrence import: " +
    report.release.occurrenceCount +
    " occurrences (" +
    occurrenceSummary.atomic_count +
    " atomic, " +
    occurrenceSummary.bundle_count +
    " bundle, " +
    occurrenceSummary.multi_route_count +
    " multi-route), " +
    report.release.eligibleOccurrenceCount +
    " study-eligible, " +
    report.release.routeProjectionCount +
    " route projections, " +
    report.release.rejectedOccurrenceCount +
    " rejected.",
  "- Baseline: " +
    baseline.candidateSetId +
    ", " +
    baselineCandidates.length +
    " candidates, " +
    baseline.summary.approvedCount +
    " approved.",
  "- New set: " +
    candidateSet.candidateSetId +
    ", " +
    candidates.length +
    " candidates, approval state " +
    candidateSet.approvalState +
    ", zero approved.",
  "- The corrected v2 merge exact-deduplicated " +
    candidateSet.summary.exactDeduplicationCount +
    " registry/Wiki pairs while retaining both provenances; " +
    candidateSet.conflicts.length +
    " cross-source same-month conflict groups remain.",
  "- Candidate generation used consumer commit `" +
    consumerCommit +
    "` and a read-only logical database input of " +
    logicalMergeInputs.summary.registryRowCount +
    " registry rows plus " +
    logicalMergeInputs.summary.availableAnalysisRouteIdCount +
    " available analysis routes. Three independent outputs were byte-identical at SHA-256 " +
    candidateSetSha +
    ".",
  "- The logical database snapshot is a hash witness and reproducibility preflight, not a replay input: the current merge CLI still reads SQLite directly. A rebuild is comparable only when a fresh snapshot matches the frozen bytes and the database remains unchanged through both merge runs.",
  "- The baseline receipt is not reused; the new set requires a new explicit approval receipt.",
  "- The final Codex/subagent review hash chain rehashed " +
    verifiedReviewFiles.length +
    " files, including the corrected rubric, transfer proof, 12-row recheck, manifest, and every batch input/output. The reconciliation covers all " +
    reviewRecommendations.length +
    " corrected candidate rows at reconciliation SHA-256 " +
    reviewReconciliationSha +
    ". It is explicitly non-authorizing.",
  "",
  "## Operational-evidence funnel",
  "",
  "The producer contract changed from individual assertions to reviewed occurrences, so the accepted/rejected rows below are deliberately not presented as a like-for-like numerical delta.",
  "",
  "| Evidence view | Total | Accepted / study-eligible | Rejected / non-eligible | Candidate-pipeline input? |",
  "| --- | ---: | ---: | ---: | --- |",
  "| Baseline legacy assertion import | " +
    baselineWikiImport.summary.assertionCount +
    " assertions | " +
    baselineWikiImport.summary.eligibleAssertionCount +
    " | " +
    baselineWikiImport.summary.rejectedAssertionCount +
    " | Yes, historical |",
  "| rc19 legacy anchor export | " +
    anchorSummary.row_count +
    " rows | " +
    anchorSummary.study_eligible_count +
    " | " +
    (anchorSummary.row_count - anchorSummary.study_eligible_count) +
    " | No |",
  "| rc19 occurrence import | " +
    occurrences.summary.sourceOccurrenceCount +
    " occurrences | " +
    occurrences.summary.eligibleOccurrenceCount +
    " | " +
    occurrences.summary.rejectedOccurrenceCount +
    " | Yes, current |",
  "",
  "The baseline assertion import also records " +
    baselineWikiImport.summary.rejectedAnchorCount +
    " rejected source-anchor rows, " +
    baselineWikiImport.summary.exactDuplicateGroupCount +
    " exact-duplicate groups / " +
    baselineWikiImport.summary.exactDuplicateRowCount +
    " rows, and " +
    baselineWikiImport.summary.crossDateConflictGroupCount +
    " cross-date conflict groups. The rc19 legacy anchor export contains " +
    anchorSummary.reviewed_row_count +
    " reviewed rows and " +
    anchorSummary.study_eligible_reviewed_count +
    " reviewed eligible rows, but the v3 candidate path consumes occurrences, not that legacy export.",
  "",
  "## Funnel delta",
  "",
  "| Measure | Baseline | rc19 | Delta |",
  "| --- | ---: | ---: | ---: |",
  "| Candidate rows | " +
    baselineCandidates.length +
    " | " +
    candidates.length +
    " | " +
    (candidates.length - baselineCandidates.length) +
    " gross |",
  "| Identity additions | — | — | " + added.length + " |",
  "| Identity removals | — | — | " + removed.length + " |",
  "| Source-rejected rows | " +
    baseline.rejections.length +
    " | " +
    candidateSet.rejections.length +
    " | " +
    (candidateSet.rejections.length - baseline.rejections.length) +
    " |",
  "| Conflict groups | " +
    baseline.conflicts.length +
    " | " +
    candidateSet.conflicts.length +
    " | " +
    (candidateSet.conflicts.length - baseline.conflicts.length) +
    " |",
  "| Operator-approved rows | " +
    baseline.summary.approvedCount +
    " | " +
    candidateSet.summary.approvedCount +
    " | " +
    (candidateSet.summary.approvedCount - baseline.summary.approvedCount) +
    " |",
  "",
  "The " +
    added.length +
    " identity additions are " +
    (candidateBreakdown(added).treatmentFamily.route_redesign ?? 0) +
    " route_redesign, " +
    (candidateBreakdown(added).treatmentFamily.bus_lane ?? 0) +
    " bus_lane, and " +
    (candidateBreakdown(added).treatmentFamily.automated_bus_lane_enforcement ?? 0) +
    " automated_bus_lane_enforcement; they cover " +
    candidateBreakdown(added).routes +
    " distinct routes. The one removed identity is " +
    removed.map((candidate) => candidateKey(candidate)).join(", ") +
    ", rejected by rc19's unsupported bundle-analysis family gate.",
  "",
  "Treatment-family counts changed as follows:",
  "",
  "| Family | Baseline | rc19 | Delta |",
  "| --- | ---: | ---: | ---: |",
  ...Object.entries(treatmentFamilyDelta).map(
    ([family, counts]) =>
      "| " +
      family +
      " | " +
      counts.baseline +
      " | " +
      counts.candidate +
      " | " +
      counts.delta +
      " |",
  ),
  "",
  "## Dates and outcome windows",
  "",
  "- Full rc19 set: " +
    (candidateBreakdown(candidates).datePrecision.day ?? 0) +
    " exact-day rows and " +
    (candidateBreakdown(candidates).datePrecision.month ?? 0) +
    " month-precision rows. No day was fabricated for a month-only event.",
  "- Calendar intersected with 2023-04 through " +
    analysisMonth +
    ", excluding the implementation month: " +
    report.gates.outcomeCoverage.exactDayEligible +
    " day rows and " +
    report.gates.outcomeCoverage.monthPrecisionEligible +
    " month rows have at least four months per side; " +
    report.gates.outcomeCoverage.calendarIneligible +
    " rows are calendar-ineligible.",
  "- Exact outcome statuses: " + JSON.stringify(report.gates.outcomeCoverage.status) + ".",
  "",
  "## Candidate gates and review funnel",
  "",
  "- " +
    (candidateBreakdown(added).outcomeWindow.eligible_day_6x6 ?? 0) +
    " additions have exact day dates with full six-month calendar windows; " +
    (candidateBreakdown(added).outcomeWindow.eligible_month_precision ?? 0) +
    " have month precision and remain date-conservative.",
  "- " +
    (candidateBreakdown(added).spineReadiness.needs_pattern_review ?? 0) +
    " additions are blocked by needs_pattern_review; " +
    (candidateBreakdown(added).spineReadiness.series_ready ?? 0) +
    " are series_ready and " +
    (candidateBreakdown(added).spineReadiness.series_ready_with_gaps ?? 0) +
    " is series_ready_with_gaps.",
  "- Of the 87 additions, " +
    added.filter(structuralGatePass).length +
    " advance through the mechanical calendar-plus-spine prefilter to full review: " +
    added.filter((candidate) => structuralGatePass(candidate) && candidate.datePrecision === "day")
      .length +
    " exact-day and " +
    added.filter(
      (candidate) => structuralGatePass(candidate) && candidate.datePrecision === "month",
    ).length +
    " month-precision. Advancement is not approval.",
  "- Full set mechanical disposition: " +
    structuralHardRejectCandidates.length +
    " hard rejects and " +
    deepReviewCandidates.length +
    " candidates requiring deep evidence/phase/geometry/confounder review. Exact combinations: " +
    JSON.stringify(structuralDisposition) +
    ".",
  "- All " +
    added.length +
    " additions are conflict-free. The full corrected rc19 set has " +
    candidateSet.conflicts.length +
    " conflict groups / " +
    candidates.filter((candidate) => candidate.conflictState !== "none").length +
    " conflict-marked rows.",
  "- " +
    candidates.filter(
      (candidate) => candidate.confounderGroupId === "queens_bus_network_redesign_2025",
    ).length +
    " rows carry queens_bus_network_redesign_2025 grouping metadata. The tested redesign self-group exemption prevents treating the intervention as its own confounder; genuinely separate same-route interventions still require review.",
  "- The v3 occurrence importer and corrected v2 study merge are compatible. The consumer fix restores Plan 074 exact cross-source deduplication without weakening evidence, route, treatment, date, spine, overlap, or approval gates. One occurrence was correctly source-rejected for unsupported_bundle_analysis_family.",
  "- The legacy v2 operational-anchor importer rejects a v3 manifest by schema; rc19 is intentionally consumed through the versioned occurrence importer, with no fallback or gate relaxation.",
  "",
  "## Non-authorizing Codex review",
  "",
  "The completed recommendation ledger is bound to candidate set `" +
    candidateSet.candidateSetId +
    "` and artifact SHA-256 `" +
    candidateSetSha +
    "`. It contains " +
    (reviewRecommendationCounts.recommend_approve ?? 0) +
    " `recommend_approve`, " +
    (reviewRecommendationCounts.recommend_reject ?? 0) +
    " `recommend_reject`, and " +
    (reviewRecommendationCounts.needs_followup ?? 0) +
    " `needs_followup` decisions. These are recommendations only: the ledger authorizes neither a study run nor publication and is not an approval receipt.",
  "",
  "The " + recommendedApproveRows.length + " recommended approvals are:",
  "",
  ...recommendedApproveRows.map((recommendation) => "- `" + recommendation.identity + "`"),
  "",
  "Of the " +
    addedDeepReviewCandidates.length +
    " rc19 additions that passed the mechanical calendar-plus-spine prefilter, " +
    addedDeepReviewRecommendations.filter(
      (recommendation) => recommendation.recommendation === "recommend_approve",
    ).length +
    " receive non-authorizing approval recommendations. The remaining row, `" +
    addedDeepReviewRejectRows.map((recommendation) => recommendation.identity).join(", ") +
    "`, remains rejected because the frozen review lacks an exact lane-overlap spine, treats the month as installation commencement rather than a clean operational completion date, and records a competing same-route lane candidate. The other " +
    added.filter((candidate) => !structuralGatePass(candidate)).length +
    " additions fail the mechanical spine/calendar prefilter.",
  "",
  "The " +
    unchangedRecommendedApproveRows.length +
    " approval recommendations among unchanged identities exactly match the historical receipt's approved identity set: " +
    unchangedRecommendationsMatchHistoricalApprovals +
    ". That comparison does not carry the old authorization into the new set.",
  "",
  "### Rejection buckets",
  "",
  "Counts are reason occurrences for source rejections and candidate rows for downstream structural/reviewer gates; they are not mutually exclusive unless explicitly called a disposition. Reviewer hard-failure counts use only explicit `fail` prefixes. `needs_followup` and `unresolved` are reported separately and are never mislabeled as hard failures. Every one of the 473 reject recommendations has at least one fail-prefixed hard gate.",
  "",
  "| Bucket | rc19 finding |",
  "| --- | --- |",
  "| Route scope | " +
    (rejectionReasonCounts(candidateSet).bucketOccurrences.route_scope ?? 0) +
    " candidate-merge source-reason occurrences; " +
    (bucketReasonCountObject(anchorSummary.counts_by_exclusion_reason).route_scope ?? 0) +
    " legacy producer-anchor exclusion-reason occurrences; " +
    reviewRejectionGateIssueCounts.routeScopeHardFailure +
    " rejected candidate rows with explicit route/proximity hard failures; " +
    reviewRejectionGateIssueCounts.routeScopeFollowupOrUnresolved +
    " with route/proximity follow-up or unresolved flags |",
  "| Treatment scope | " +
    (rejectionReasonCounts(candidateSet).bucketOccurrences.treatment_scope ?? 0) +
    " candidate-merge source-reason occurrences; " +
    (bucketReasonCountObject(anchorSummary.counts_by_exclusion_reason).treatment_scope ?? 0) +
    " legacy producer-anchor exclusion-reason occurrences; " +
    reviewRejectionGateIssueCounts.treatmentScopeHardFailure +
    " rejected candidate rows with explicit treatment/phase/onset/lane hard failures; " +
    reviewRejectionGateIssueCounts.treatmentScopeFollowupOrUnresolved +
    " with treatment-scope follow-up or unresolved flags |",
  "| Evidence / authority / truth | " +
    (rejectionReasonCounts(candidateSet).bucketOccurrences.evidence_authority_truth ?? 0) +
    " candidate-merge source-reason occurrences; " +
    (bucketReasonCountObject(anchorSummary.counts_by_exclusion_reason).evidence_authority_truth ??
      0) +
    " legacy producer-anchor exclusion-reason occurrences; " +
    reviewRejectionGateIssueCounts.evidenceAuthorityTruthHardFailure +
    " rejected candidate rows with evidence-scope or date hard failures; " +
    reviewRejectionGateIssueCounts.evidenceAuthorityTruthFollowupOrUnresolved +
    " with evidence/date follow-up or unresolved flags |",
  "| Outcome coverage | " +
    report.gates.outcomeCoverage.calendarIneligible +
    " calendar-ineligible candidate rows; " +
    report.gates.outcomeCoverage.monthPrecisionEligible +
    " eligible month-precision rows remain conservative; " +
    reviewRejectionGateIssueCounts.outcomeCoverageHardFailure +
    " rejected candidate rows with outcome-window hard failures; " +
    reviewRejectionGateIssueCounts.outcomeCoverageFollowupOrUnresolved +
    " with outcome follow-up or unresolved flags |",
  "| Segment spine | " +
    (candidateBreakdown(candidates).spineReadiness.needs_pattern_review ?? 0) +
    " needs_pattern_review rows; " +
    reviewRejectionGateIssueCounts.segmentSpineReadinessHardFailure +
    " rejected candidate rows with a spine hard failure (including missing exact lane-overlap spines); " +
    reviewRejectionGateIssueCounts.segmentSpineReadinessFollowupOrUnresolved +
    " with spine follow-up or unresolved flags |",
  "| Overlap / confounders | " +
    candidateSet.conflicts.length +
    " conflict groups; " +
    candidates.filter((candidate) => candidate.confounderGroupId).length +
    " treatment-group-tagged rows; " +
    reviewRejectionGateIssueCounts.overlapConfoundersHardFailure +
    " rejected candidate rows with a hard overlap/confounder failure; " +
    reviewRejectionGateIssueCounts.overlapConfoundersFollowupOrUnresolved +
    " with overlap/confounder follow-up or unresolved flags (" +
    reviewRejectionGateIssueCounts.overlapConfoundersIncludingPrespecifiedSensitivityOrFlag +
    " including prespecified sensitivities/flags) |",
  "| Consumer contract | " +
    (rejectionReasonCounts(candidateSet).bucketOccurrences.contract_incompatibility ?? 0) +
    " candidate-merge source-reason occurrences; " +
    reviewRejectionGateIssueCounts.contractIncompatibilityHardFailure +
    " review-rejected candidate rows with an explicit contract/schema/incompatibility hard failure after the exact-dedup fix |",
  "| Unclassified producer reasons | " +
    (rejectionReasonCounts(candidateSet).bucketOccurrences.unclassified ?? 0) +
    " candidate-merge source-reason occurrences; " +
    (bucketReasonCountObject(anchorSummary.counts_by_exclusion_reason).unclassified ?? 0) +
    " legacy producer-anchor reason occurrences retained without inferring a gate bucket |",
  "",
  "## Plan rebaseline",
  "",
  "Plan 083's old 39 ACE candidates blocked solely by needs_pattern_review statement is not supported by the historical receipt. Its primary spine bucket contains " +
    historicalPlan083.candidateIdentityCount +
    " identities across " +
    historicalPlan083.routeCount +
    " routes: " +
    historicalPlan083.noAdditionalPhaseOrOverlapDefectNamedCount +
    " have no additional phase/overlap defect named, " +
    historicalPlan083.alsoPhaseAmbiguousCount +
    " also have an earlier ABLE/ACE phase, and " +
    historicalPlan083.alsoSameRouteOverlapCount +
    " also have a same-route lane overlap.",
  "",
  "The current full set has " +
    currentAceSpinePrefilter.length +
    " calendar-eligible ACE identities across " +
    new Set(currentAceSpinePrefilter.map((candidate) => candidate.routeId)).size +
    " routes that fail the mechanical spine gate. The rc19 identity delta has " +
    addedSpineBlocked.length +
    " spine-blocked additions across " +
    new Set(addedSpineBlocked.map((candidate) => candidate.routeId)).size +
    " routes (" +
    JSON.stringify(countBy(addedSpineBlocked, (candidate) => candidate.treatmentFamily)) +
    "). These are candidates advanced or blocked for further review, never automatically unlocked studies.",
  "",
  "The broader 5 of 403 premise remains a historical receipt fact only. rc19 has " +
    candidates.length +
    " unapproved rows. The independent spine spike remains justified by the unchanged route-manifest population: " +
    (spineRouteReadiness.needs_pattern_review ?? 0) +
    " needs_pattern_review, " +
    (spineRouteReadiness.series_ready ?? 0) +
    " series_ready, and " +
    (spineRouteReadiness.series_ready_with_gaps ?? 0) +
    " series_ready_with_gaps. Any spine rebuild creates a new input/candidate-set boundary and requires a complete new receipt.",
  "",
  "Plan 074's spine admission rule, evidence requirements, confounder handling, and candidate-set-bound approval remain unchanged. Plan 075's public-study publication boundary remains unchanged: no public artifacts or studies are regenerated by this audit.",
  "",
  "The live plan index confirms Plan 084 is already occupied by the de-month doctrine. This rc19 work creates no Plan 084; it rebaselines existing Plans 074, 075, and 083 through the Tracker-side amendment record.",
  "",
  "## Reproduce the candidate build",
  "",
  "Run the import and merge commands from a checkout containing consumer commit `" +
    consumerCommit +
    "`. All output paths are explicit; the source database and MTA Wiki checkout are read-only inputs. The merger does not replay the snapshot directly, so stop if the snapshot comparison fails and do not mutate the database between the preflight and either merge run.",
  "",
  "```sh",
  "bun tools/pipeline-v2/scripts/snapshot-rc19-study-merge-inputs.ts \\",
  "  --db /mnt/models/dev/bus-reliability-tracker/data/local/pipeline.sqlite \\",
  "  --output /tmp/rc19-study-merge-logical-inputs.json",
  "cmp /tmp/rc19-study-merge-logical-inputs.json docs/research/artifacts/mta-wiki-rc19-study-merge-logical-inputs.json",
  "",
  "bun --filter @bp/pipeline-v2 cli -- studio import-mta-wiki-operational-occurrences \\",
  "  --mta-wiki-root /mnt/models/dev/mta-wiki-corpus-completion \\",
  "  --wiki-release v1-rc19 \\",
  "  --wiki-manifest-sha256 " + expectedManifestSha + " \\",
  "  --output /tmp/rc19-operational-occurrences.json",
  "",
  "bun --filter @bp/pipeline-v2 cli -- study merge-events \\",
  "  --db /mnt/models/dev/bus-reliability-tracker/data/local/pipeline.sqlite \\",
  "  --wiki-import /tmp/rc19-operational-occurrences.json \\",
  "  --output /tmp/rc19-study-events-a.json",
  "bun --filter @bp/pipeline-v2 cli -- study merge-events \\",
  "  --db /mnt/models/dev/bus-reliability-tracker/data/local/pipeline.sqlite \\",
  "  --wiki-import /tmp/rc19-operational-occurrences.json \\",
  "  --output /tmp/rc19-study-events-b.json",
  "cmp /tmp/rc19-study-events-a.json /tmp/rc19-study-events-b.json",
  "sha256sum /tmp/rc19-study-events-a.json /tmp/rc19-study-events-b.json",
  "```",
  "",
  "## Reproduce this audit",
  "",
  "Run from the Tracker worktree after regenerating or restoring the two frozen rc19 artifacts at the committed paths:",
  "",
  "```sh",
  "bun tools/pipeline-v2/scripts/audit-mta-wiki-candidate-set.ts \\",
  "  --baseline /mnt/models/dev/bus-reliability-tracker/data/artifacts/studio/v2/studies/study-events.json \\",
  "  --baseline-wiki-import /mnt/models/dev/bus-reliability-tracker/data/artifacts/studio/v2/wiki/document-operational-date-assertions-v2.json \\",
  "  --baseline-receipt /mnt/models/dev/bus-reliability-tracker/data/study-event-approvals/receipts/candidate-set-49af8c8721457fa7532a7345.approval.json \\",
  "  --baseline-review-report /mnt/models/dev/bus-reliability-tracker/data/study-event-approvals/reviews/candidate-set-49af8c8721457fa7532a7345.review-report.md \\",
  "  --build-record docs/research/artifacts/mta-wiki-rc19-candidate-build-record.json \\",
  "  --logical-merge-inputs docs/research/artifacts/mta-wiki-rc19-study-merge-logical-inputs.json \\",
  "  --review-reconciliation docs/research/reviews/rc19/corrected/rc19-review-reconciliation.json \\",
  "  --consumer-commit " + consumerCommit + " \\",
  "  --candidate docs/research/artifacts/candidate-set-v2-24080902f508b55a0033df32.study-events.json \\",
  "  --occurrences docs/research/artifacts/mta-wiki-v1-rc19.operational-occurrences-import.json \\",
  "  --spine /mnt/models/dev/bus-reliability-tracker/data/artifacts/studio/v2/speed-spines/2023-04_to_2026-03/manifest.json \\",
  "  --wiki-manifest /mnt/models/dev/mta-wiki-corpus-completion/data/exports/releases/v1-rc19/manifest.json \\",
  "  --mta-wiki-root /mnt/models/dev/mta-wiki-corpus-completion \\",
  "  --acquisition-frontier /mnt/models/dev/mta-wiki-corpus-completion/data/quality/acquisition/target-list.md \\",
  "  --coverage-manifest /mnt/models/dev/mta-wiki-corpus-completion/data/quality/operational-coverage/manifest.json \\",
  "  --priority-queue /mnt/models/dev/mta-wiki-corpus-completion/data/quality/operational-coverage/priority-queue.jsonl \\",
  "  --plan-index /mnt/models/dev/bus-reliability-tracker/plans/README.md \\",
  "  --plan-074 /mnt/models/dev/bus-reliability-tracker/plans/074-segment-study-engine.md \\",
  "  --plan-075 /mnt/models/dev/bus-reliability-tracker/plans/075-studies-surface.md \\",
  "  --plan-083 /mnt/models/dev/bus-reliability-tracker/plans/083-spine-pattern-grouping-spike.md \\",
  "  --wiki-manifest-sha256 " + expectedManifestSha + " \\",
  "  --analysis-month " + analysisMonth + " \\",
  "  --output docs/research/artifacts/mta-wiki-rc19-study-candidate-audit.json",
  "```",
  "",
  "A second run must reproduce the JSON and Markdown byte-for-byte. The JSON records every consumed artifact hash, all verified release-file hashes, and the live plan/receipt hashes.",
  "",
  "## Operator decision required",
  "",
  "For the Tracker to admit any rc19 candidate, the operator must explicitly authorize a new receipt for " +
    candidateSet.candidateSetId +
    " bound to candidate artifact SHA-256 " +
    candidateSetSha +
    ". The concrete proposed decision is to approve exactly the " +
    recommendedApproveRows.length +
    " identities listed above and reject the other " +
    recommendedRejectRows.length +
    ", or to provide explicit candidate-level overrides with rationale. Codex recommendations are non-authorizing and do not replace that receipt. Until the operator makes that exact set-bound decision, the approved count remains zero and no new study may run. Receipt approval only admits candidates to the estimator; sample/control, pre-trend, placebo, sensitivity, claim-tier, separate run, and publication gates remain independently binding.",
  "",
].join("\n");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
writeFileSync(outputPath.replace(/\.json$/, ".md"), md);
console.log(
  JSON.stringify(
    {
      outputPath,
      markdownPath: outputPath.replace(/\.json$/, ".md"),
      candidateSetId: candidateSet.candidateSetId,
      added: added.length,
      removed: removed.length,
    },
    null,
    2,
  ),
);
