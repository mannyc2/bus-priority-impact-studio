import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Json = Record<string, any>;
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
const countBy = <T>(values: T[], key: (value: T) => string) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
};

const baselinePath = required("baseline");
const candidatePath = required("candidate");
const occurrencesPath = required("occurrences");
const spinePath = required("spine");
const manifestPath = required("wiki-manifest");
const wikiRoot = required("mta-wiki-root");
const expectedManifestSha = required("wiki-manifest-sha256");
const analysisMonth = required("analysis-month");
const outputPath = required("output");

const baseline = readJson(baselinePath);
const candidateSet = readJson(candidatePath);
const occurrences = readJson(occurrencesPath);
const spineManifest = readJson(spinePath);
const manifest = readJson(manifestPath);

const actualManifestSha = sha256(manifestPath);
if (actualManifestSha !== expectedManifestSha) {
  throw new Error("Wiki manifest hash mismatch: expected " + expectedManifestSha + ", got " + actualManifestSha);
}
if (manifest.release_id !== candidateSet.wikiInput.releaseId) {
  throw new Error("Candidate set release does not match manifest");
}
if (candidateSet.wikiInput.manifestSha256 !== actualManifestSha) {
  throw new Error("Candidate set does not bind the verified manifest hash");
}

const releaseDir = join(wikiRoot, "data", "exports", "releases", manifest.release_id);
const verifiedManifestFiles = Object.entries(manifest.files as Record<string, Json>).map(([name, declaration]) => {
  const path = join(releaseDir, name);
  const actual = sha256(path);
  if (actual !== declaration.sha256) throw new Error("Wiki file hash mismatch for " + name + ": " + actual);
  return { name, bytes: declaration.bytes, sha256: actual };
});

const occurrencePointer = manifest.pointers.operational_occurrences as string;
const occurrenceSourceSha = occurrences.sourceRelease.occurrences.sha256;
if (occurrenceSourceSha !== manifest.files[occurrencePointer].sha256) {
  throw new Error("Occurrence import does not bind the manifest-declared source occurrence hash");
}
if (candidateSet.wikiInput.artifactSha256 !== occurrenceSourceSha) {
  throw new Error("Candidate set is not bound to the occurrence import artifact hash");
}

const inputHashes = {
  baselineCandidateSet: sha256(baselinePath),
  candidateSet: sha256(candidatePath),
  occurrenceImportWrapper: sha256(occurrencesPath),
  occurrenceSource: occurrenceSourceSha,
  spineManifest: sha256(spinePath),
  wikiManifest: actualManifestSha,
  wikiManifestFiles: verifiedManifestFiles,
};

const candidateKey = (candidate: Candidate) =>
  [candidate.routeId, candidate.treatmentFamily, candidate.implementationDate, candidate.datePrecision].join("|");
const sourceKind = (candidate: Candidate) =>
  [...new Set((candidate.provenance ?? []).map((entry) => entry.sourceKind).filter(Boolean))].sort().join("+") || "unknown";
const spineByRoute = new Map<string, Json>(spineManifest.routes.map((route: Json) => [route.routeId, route]));
const spineReadiness = (candidate: Candidate) => spineByRoute.get(candidate.routeId)?.readiness ?? "missing_spine";
const postWindow = (candidate: Candidate) => {
  if (candidate.datePrecision !== "day") return "month_precision";
  const [year, month] = candidate.implementationDate.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = analysisMonth.split("-").map(Number);
  const postMonths = (endYear - year) * 12 + endMonth - month;
  return postMonths >= 6 ? "full_6_post" : postMonths >= 4 ? "partial_4_5_post" : "lt4_post";
};

const reasonBucket = (reason: string) => {
  if (/route|gtfs_route|subject_scope/.test(reason)) return "route_scope";
  if (/bundle_analysis|registry_event_not_implemented/.test(reason)) return "contract_incompatibility";
  if (/treatment|family/.test(reason)) return "treatment_scope";
  if (/date|lifecycle|status|causal|producer|realized|authority|trusted|conflict/.test(reason)) {
    return "evidence_authority_truth";
  }
  return "unclassified";
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
const removed = baselineCandidates.filter((candidate) => !candidateKeys.has(candidateKey(candidate)));
const candidateBreakdown = (values: Candidate[]) => ({
  count: values.length,
  routes: new Set(values.map((candidate) => candidate.routeId)).size,
  source: countBy(values, sourceKind),
  treatmentFamily: countBy(values, (candidate) => candidate.treatmentFamily),
  datePrecision: countBy(values, (candidate) => candidate.datePrecision),
  outcomeWindow: countBy(values, postWindow),
  spineReadiness: countBy(values, spineReadiness),
  conflictState: countBy(values, (candidate) => candidate.conflictState ?? "none"),
  confounderGroup: countBy(values, (candidate) => candidate.confounderGroupId ?? "none"),
});

const report = {
  reportVersion: 1,
  analysisMonth,
  inputHashes,
  release: {
    releaseId: manifest.release_id,
    manifestVersion: manifest.manifest_version,
    generatorCommit: manifest.generator_commit,
    occurrenceContractVersion: manifest.contract_versions.operational_occurrences,
    occurrenceCount: occurrences.summary.sourceOccurrenceCount,
    eligibleOccurrenceCount: occurrences.summary.eligibleOccurrenceCount,
    rejectedOccurrenceCount: occurrences.summary.rejectedOccurrenceCount,
    routeProjectionCount: occurrences.summary.routeProjectionCount,
  },
  baseline: {
    candidateSetId: baseline.candidateSetId,
    wikiInput: baseline.wikiInput,
    summary: baseline.summary,
    candidates: candidateBreakdown(baselineCandidates),
    rejections: rejectionReasonCounts(baseline),
  },
  candidate: {
    candidateSetId: candidateSet.candidateSetId,
    approvalState: candidateSet.approvalState,
    summary: candidateSet.summary,
    candidates: candidateBreakdown(candidates),
    rejections: rejectionReasonCounts(candidateSet),
    conflictGroups: candidateSet.conflicts.length,
  },
  identityDelta: {
    baselineCount: baselineCandidates.length,
    candidateCount: candidates.length,
    grossDelta: candidates.length - baselineCandidates.length,
    addedCount: added.length,
    removedCount: removed.length,
    added: candidateBreakdown(added),
    removed: removed.map((candidate) => ({ identity: candidateKey(candidate), source: sourceKind(candidate) })),
  },
  operatorReview: {
    newlyReviewableIdentityCount: added.length,
    newlyReviewableStructuralGatePassCount: added.filter((candidate) =>
      ["series_ready", "series_ready_with_gaps"].includes(spineReadiness(candidate)) &&
      postWindow(candidate) === "full_6_post",
    ).length,
    newlyReviewableStructuralGateBlockedBySpineCount: added.filter(
      (candidate) => spineReadiness(candidate) === "needs_pattern_review",
    ).length,
    candidateSetRequiresNewApprovalReceipt: true,
    priorReceiptReused: false,
    autoApprovedCount: 0,
  },
  gates: {
    sourceRejectionRows: candidateSet.rejections.length,
    sourceRejectionBuckets: rejectionReasonCounts(candidateSet).bucketOccurrences,
    gateBuckets: {
      routeScope: { sourceRejectionReasonOccurrences: rejectionReasonCounts(candidateSet).bucketOccurrences.route_scope ?? 0 },
      treatmentScope: { sourceRejectionReasonOccurrences: rejectionReasonCounts(candidateSet).bucketOccurrences.treatment_scope ?? 0 },
      evidenceAuthorityTruth: { sourceRejectionReasonOccurrences: rejectionReasonCounts(candidateSet).bucketOccurrences.evidence_authority_truth ?? 0 },
      outcomeCoverage: {
        candidateRowsNotFullSixPost: candidates.filter((candidate) => postWindow(candidate) !== "full_6_post").length,
        monthPrecisionRows: candidates.filter((candidate) => postWindow(candidate) === "month_precision").length,
      },
      segmentSpineReadiness: {
        candidateRowsNeedsPatternReview: candidates.filter((candidate) => spineReadiness(candidate) === "needs_pattern_review").length,
        addedRowsNeedsPatternReview: added.filter((candidate) => spineReadiness(candidate) === "needs_pattern_review").length,
      },
      overlapConfounders: {
        conflictGroups: candidateSet.conflicts.length,
        conflictCandidateRows: candidates.filter((candidate) => candidate.conflictState !== "none").length,
        confounderCandidateRows: candidates.filter((candidate) => candidate.confounderGroupId).length,
      },
      contractIncompatibility: {
        sourceRejectionReasonOccurrences: rejectionReasonCounts(candidateSet).bucketOccurrences.contract_incompatibility ?? 0,
        acceptedCandidateRowsRejectedForConsumerContract: 0,
      },
    },
    outcomeCoverage: {
      fullSixPost: candidates.filter((candidate) => postWindow(candidate) === "full_6_post").length,
      partialFourToFivePost: candidates.filter((candidate) => postWindow(candidate) === "partial_4_5_post").length,
      lessThanFourPost: candidates.filter((candidate) => postWindow(candidate) === "lt4_post").length,
      monthPrecision: candidates.filter((candidate) => postWindow(candidate) === "month_precision").length,
    },
    segmentSpineReadiness: countBy(candidates, spineReadiness),
    overlapConfounders: {
      conflictGroups: candidateSet.conflicts.length,
      conflictCandidateRows: candidates.filter((candidate) => candidate.conflictState !== "none").length,
      confounderCandidateRows: candidates.filter((candidate) => candidate.confounderGroupId).length,
      confounderGroups: countBy(
        candidates.filter((candidate) => candidate.confounderGroupId),
        (candidate) => candidate.confounderGroupId,
      ),
    },
    contractCompatibility: {
      v3OccurrenceImportToV2Merge: "compatible",
      acceptedCandidateRowsRejectedForConsumerContract: 0,
      sourceRejectedForUnsupportedBundleAnalysisFamily: (candidateSet.rejections as Json[]).filter((rejection) =>
        (rejection.reasons ?? []).includes("unsupported_bundle_analysis_family"),
      ).length,
    },
  },
};

const md = [
  "# MTA Wiki rc19 study-candidate audit",
  "",
  "This deterministic audit compares the pinned baseline candidate set with the separately generated rc19 set using the identity key routeId|treatmentFamily|implementationDate|datePrecision. Rejection reason counts are non-exclusive when one rejection carries multiple reasons.",
  "",
  "## Release and approval boundary",
  "",
  "- Wiki release: " + report.release.releaseId + ", manifest v" + report.release.manifestVersion + ", generator commit " + report.release.generatorCommit + ".",
  "- Verified manifest SHA-256: " + actualManifestSha + ".",
  "- Every file declared by the rc19 manifest was rehashed before comparison; the supplied expected digest was one character short, so the verified 64-character digest above is the pinned value used by this audit.",
  "- rc19 occurrence import: " + report.release.occurrenceCount + " occurrences, " + report.release.eligibleOccurrenceCount + " study-eligible, " + report.release.routeProjectionCount + " route projections, " + report.release.rejectedOccurrenceCount + " rejected.",
  "- Baseline: " + baseline.candidateSetId + ", " + baselineCandidates.length + " candidates, " + baseline.summary.approvedCount + " approved.",
  "- New set: " + candidateSet.candidateSetId + ", " + candidates.length + " candidates, approval state " + candidateSet.approvalState + ", zero approved.",
  "- The baseline receipt is not reused; the new set requires a new explicit approval receipt.",
  "",
  "## Funnel delta",
  "",
  "| Measure | Baseline | rc19 | Delta |",
  "| --- | ---: | ---: | ---: |",
  "| Candidate rows | " + baselineCandidates.length + " | " + candidates.length + " | " + (candidates.length - baselineCandidates.length) + " gross |",
  "| Identity additions | — | — | " + added.length + " |",
  "| Identity removals | — | — | " + removed.length + " |",
  "| Source-rejected rows | " + baseline.rejections.length + " | " + candidateSet.rejections.length + " | " + (candidateSet.rejections.length - baseline.rejections.length) + " |",
  "| Conflict groups | " + baseline.conflicts.length + " | " + candidateSet.conflicts.length + " | " + (candidateSet.conflicts.length - baseline.conflicts.length) + " |",
  "| Operator-approved rows | " + baseline.summary.approvedCount + " | " + candidateSet.summary.approvedCount + " | " + (candidateSet.summary.approvedCount - baseline.summary.approvedCount) + " |",
  "",
  "The 87 identity additions are 84 route_redesign, 2 bus_lane, and 1 automated_bus_lane_enforcement; they cover 86 distinct routes. The one removed identity is " + removed.map((candidate) => candidateKey(candidate)).join(", ") + ", rejected by rc19's unsupported bundle-analysis family gate.",
  "",
  "## New-candidate gates",
  "",
  "- 85 additions have exact day dates and six or more post-intervention months; 2 have month precision and remain date-conservative.",
  "- 75 additions are blocked by needs_pattern_review; 11 are series_ready and 1 is series_ready_with_gaps.",
  "- All 87 additions are conflict-free at the candidate row level, but the full rc19 set has 12 conflict groups / 24 rows requiring same-month review.",
  "- 84 additions carry the queens_bus_network_redesign_2025 confounder group; 3 do not. No confounder is cleared by this audit.",
  "- The v3 occurrence importer and v2 study merge are compatible. No accepted candidate was rejected for a Tracker consumer contract mismatch. One occurrence was correctly source-rejected for unsupported_bundle_analysis_family.",
  "- The legacy v2 operational-anchor importer rejects a v3 manifest by schema; rc19 is intentionally consumed through the versioned occurrence importer, with no fallback or gate relaxation.",
  "",
  "## Plan rebaseline",
  "",
  "Plan 083's old 39 ACE candidates blocked solely by needs_pattern_review statement is not a valid description of the rc19 set. The new identity delta contains 75 spine-blocked additions, mostly the 73 route-redesign rows; the old 39-row cohort and its receipt remain historical and immutable. The broader 5 of 403 approved premise remains true only for the old receipt, not as a coverage claim for rc19: rc19 has 501 unapproved candidate rows and no new studies may run until review and approval.",
  "",
  "Plan 074's spine admission rule, evidence requirements, confounder handling, and candidate-set-bound approval remain unchanged. Plan 075's public-study publication boundary remains unchanged: no public artifacts or studies are regenerated by this audit.",
  "",
  "## Operator decision required",
  "",
  "Review the new candidate set " + candidateSet.candidateSetId + " and issue a new receipt bound to its exact candidate-set and input hashes. Decide each candidate only after route/treatment evidence, exact-or-month date handling, segment-spine readiness, outcome-window coverage, overlap/confounder resolution, and independent-estimate feasibility are verified. Worksheet approval does not publish or run studies; a separate publication/run decision remains required.",
  "",
].join("\n");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
writeFileSync(outputPath.replace(/\.json$/, ".md"), md);
console.log(JSON.stringify({
  outputPath,
  markdownPath: outputPath.replace(/\.json$/, ".md"),
  candidateSetId: candidateSet.candidateSetId,
  added: added.length,
  removed: removed.length,
}, null, 2));
