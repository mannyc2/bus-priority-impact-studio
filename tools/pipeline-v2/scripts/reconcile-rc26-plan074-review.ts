import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// biome-ignore lint/suspicious/noExplicitAny: immutable review artifacts are decoded dynamically.
type Json = any;

const RC25_CANDIDATE_SET_ID = "candidate-set-v3:575ee30a44f2e141e97f6a77";
const RC25_CANDIDATE_SHA256 = "b66c0cd70afdf99a0fa2779d9b0574ba328bcc5f49c7d0177eaa029b0bb2c195";
const RC26_IMPORT_SHA256 = "b9c41aafb499b3cf3c8b5e74192be64b1615393d50c5d2cf4edc66260857d6cd";
const RC26_CANDIDATE_SET_ID = "candidate-set-v3:80050ed598f3b2ab0d0a1e99";
const RC26_CANDIDATE_SHA256 = "fe4d3ce9fa9f73f660256034afa497a8a8935f3471c083358a171f5f719e5363";
const RC26_WORKSHEET_SHA256 = "b0577fc4d9eb44e62edfdd378eea2205884c5c5232e6edb3c649c5507f66aec5";
const RC26_MANIFEST_SHA256 = "c1792d1cbfdf498ea0481fa2374202b634dc2deea532f87a600390c6da382dc0";
const RC26_OCCURRENCES_SHA256 = "6cb8654efee370d7444405ce3a0cdb8ce6fa394e6ada2347982cbec49df701ef";
const FLATBUSH_OCCURRENCE_ID = "occurrence:8c987704152b459014217d44";
const B41_CANDIDATE_ID = "study-event-v2:6b70c52e0eec23eb63cab94f";
const B67_CANDIDATE_ID = "study-event-v2:d70a3ee36eb94ae88732065f";
const REMOVED_REGISTRY_DUPLICATE_IDS = [
  "study-event-v2:bc870a23ee602a9ea28d9160",
  "study-event-v2:e1d437f15fa4caee51760675",
] as const;

const args = new Map<string, string>();
for (let index = 2; index < Bun.argv.length; index += 2) {
  const flag = Bun.argv[index];
  const value = Bun.argv[index + 1];
  if (!flag?.startsWith("--") || value === undefined) {
    throw new Error(`Expected --flag value, received ${flag ?? "end of arguments"}`);
  }
  args.set(flag.slice(2), value);
}
const required = (name: string): string => {
  const value = args.get(name);
  if (value === undefined) throw new Error(`Missing --${name}`);
  return value;
};
const readJson = (path: string): Json => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const writeJson = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};
const assertEqual = (actual: unknown, expected: unknown, label: string): void => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, found ${String(actual)}`);
  }
};
const stableJson = (value: unknown): string => JSON.stringify(value);
const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].toSorted();
const candidateMap = (artifact: Json, label: string): Map<string, Json> => {
  const result = new Map<string, Json>();
  for (const candidate of artifact.candidates as Json[]) {
    if (result.has(candidate.candidateId)) {
      throw new Error(`${label} repeats candidate ${candidate.candidateId}`);
    }
    result.set(candidate.candidateId, candidate);
  }
  return result;
};
const decisionMap = (artifact: Json): Map<string, Json> => {
  const result = new Map<string, Json>();
  for (const decision of artifact.decisions as Json[]) {
    if (result.has(decision.candidateId)) {
      throw new Error(`Receipt repeats decision ${decision.candidateId}`);
    }
    result.set(decision.candidateId, decision);
  }
  return result;
};
const candidateSemantics = (candidate: Json) => ({
  candidateId: candidate.candidateId,
  routeId: candidate.routeId,
  treatmentFamily: candidate.treatmentFamily,
  componentTreatmentFamilies: candidate.componentTreatmentFamilies,
  treatmentScopeKind: candidate.treatmentScopeKind,
  implementationDate: candidate.implementationDate,
  implementationMonth: candidate.implementationMonth,
  datePrecision: candidate.datePrecision,
  occurrenceId: candidate.occurrenceId,
  confounderGroupId: candidate.confounderGroupId,
  conflictState: candidate.conflictState,
});
const candidateSemanticsWithoutDate = (candidate: Json) => {
  const {
    implementationDate: _implementationDate,
    implementationMonth: _implementationMonth,
    datePrecision: _datePrecision,
    ...stable
  } = candidateSemantics(candidate);
  return stable;
};

const rc25CandidatePath = required("rc25-candidate");
const rc25ReceiptPath = required("rc25-receipt");
const rc25ScopePath = required("rc25-scope-bindings");
const rc26ImportPath = required("rc26-import");
const rc26CandidatePath = required("rc26-candidate");
const rc26WorksheetPath = required("rc26-worksheet");
const receiptPath = required("receipt");
const scopePath = required("scope-bindings");
const reconciliationPath = required("reconciliation");

const rc25Candidate = readJson(rc25CandidatePath);
const rc25Receipt = readJson(rc25ReceiptPath);
const rc25Scope = readJson(rc25ScopePath);
const rc26Import = readJson(rc26ImportPath);
const rc26Candidate = readJson(rc26CandidatePath);
const rc26Worksheet = readJson(rc26WorksheetPath);

assertEqual(sha256(rc25CandidatePath), RC25_CANDIDATE_SHA256, "rc25 candidate hash");
assertEqual(rc25Candidate.candidateSetId, RC25_CANDIDATE_SET_ID, "rc25 candidate set");
assertEqual(rc25Candidate.candidates.length, 486, "rc25 candidate count");
assertEqual(rc25Receipt.candidateSetId, RC25_CANDIDATE_SET_ID, "rc25 receipt candidate set");
assertEqual(rc25Receipt.decisions.length, 486, "rc25 receipt decision count");
assertEqual(rc25Scope.candidateSetId, RC25_CANDIDATE_SET_ID, "rc25 scope candidate set");
assertEqual(sha256(rc26ImportPath), RC26_IMPORT_SHA256, "rc26 import hash");
assertEqual(rc26Import.sourceRelease.releaseId, "v1-rc26", "rc26 release id");
assertEqual(rc26Import.sourceRelease.manifestSha256, RC26_MANIFEST_SHA256, "rc26 manifest hash");
assertEqual(
  rc26Import.sourceRelease.occurrences.sha256,
  RC26_OCCURRENCES_SHA256,
  "rc26 occurrences hash",
);
assertEqual(sha256(rc26CandidatePath), RC26_CANDIDATE_SHA256, "rc26 candidate hash");
assertEqual(rc26Candidate.candidateSetId, RC26_CANDIDATE_SET_ID, "rc26 candidate set");
assertEqual(rc26Candidate.approvalState, "awaiting_approval", "rc26 approval state");
assertEqual(rc26Candidate.candidates.length, 484, "rc26 candidate count");
assertEqual(sha256(rc26WorksheetPath), RC26_WORKSHEET_SHA256, "rc26 worksheet hash");
assertEqual(rc26Worksheet.candidateSetId, RC26_CANDIDATE_SET_ID, "rc26 worksheet candidate set");
assertEqual(rc26Worksheet.summary.reviewRequiredCount, 484, "rc26 worksheet review count");
assertEqual(rc26Worksheet.focus.occurrenceId, FLATBUSH_OCCURRENCE_ID, "focus occurrence");
assertEqual(rc26Worksheet.focus.routeId, "B67", "focus route");

const rc25ById = candidateMap(rc25Candidate, "rc25");
const rc26ById = candidateMap(rc26Candidate, "rc26");
const oldDecisions = decisionMap(rc25Receipt);
if (oldDecisions.size !== rc25ById.size) throw new Error("rc25 receipt is not complete");
const addedCandidateIds = [...rc26ById.keys()].filter((candidateId) => !rc25ById.has(candidateId));
const removedCandidateIds = [...rc25ById.keys()]
  .filter((candidateId) => !rc26ById.has(candidateId))
  .toSorted();
assertEqual(stableJson(addedCandidateIds), "[]", "rc26 added candidate ids");
assertEqual(
  stableJson(removedCandidateIds),
  stableJson([...REMOVED_REGISTRY_DUPLICATE_IDS].toSorted()),
  "rc26 removed exact-dedup candidates",
);

for (const [candidateId, rc26] of rc26ById) {
  const rc25 = rc25ById.get(candidateId);
  if (rc25 === undefined) throw new Error(`Missing rc25 candidate ${candidateId}`);
  const projection =
    candidateId === B41_CANDIDATE_ID || candidateId === B67_CANDIDATE_ID
      ? candidateSemanticsWithoutDate
      : candidateSemantics;
  assertEqual(
    stableJson(projection(rc26)),
    stableJson(projection(rc25)),
    `${candidateId} admission semantics`,
  );
}

for (const candidateId of [B41_CANDIDATE_ID, B67_CANDIDATE_ID]) {
  const candidate = rc26ById.get(candidateId);
  if (candidate === undefined) throw new Error(`Missing Flatbush candidate ${candidateId}`);
  assertEqual(candidate.implementationDate, "2025-10-02", `${candidateId} implementation date`);
  assertEqual(candidate.implementationMonth, "2025-10", `${candidateId} implementation month`);
  assertEqual(candidate.datePrecision, "day", `${candidateId} date precision`);
  assertEqual(candidate.occurrenceId, FLATBUSH_OCCURRENCE_ID, `${candidateId} occurrence`);
  const sourceKinds = uniqueSorted(
    candidate.provenance.map((entry: Json) => entry.sourceKind as string),
  );
  assertEqual(stableJson(sourceKinds), '["mta_wiki","registry"]', `${candidateId} exact dedup`);
  const wikiRows = candidate.provenance.filter((entry: Json) => entry.sourceKind === "mta_wiki");
  if (
    wikiRows.length === 0 ||
    wikiRows.some(
      (entry: Json) =>
        entry.releaseId !== "v1-rc26" ||
        entry.phaseRelationDisposition !== "related_phases" ||
        !entry.phaseRecordIds.includes("event_flatbush-phase1-operational-opening-2025-10-02") ||
        !entry.phaseRelationRecordIds.includes(
          "relation_flatbush-phase1-installation-precedes-opening-2025-10-02",
        ),
    )
  ) {
    throw new Error(`${candidateId} lacks reviewed rc26 phase lineage`);
  }
}

const reviewer = "Codex Plan 074 rc26 delegated resumption, 2026-07-21";
const decisions = [...rc26ById.keys()].toSorted().map((candidateId) => {
  const prior = oldDecisions.get(candidateId);
  if (prior === undefined) throw new Error(`Missing prior decision for ${candidateId}`);
  if (candidateId === B41_CANDIDATE_ID) {
    return {
      candidateId,
      decision: "rejected",
      reviewer,
      rationale:
        "Rejected for rc26: the producer evidence now cleanly resolves Flatbush Phase 1 operational opening as 2025-10-02 and exact-deduplicates the NYC DOT registry lane row into the stable occurrence, but the current B41 speed spine remains needs_pattern_review (partial_months_require_pattern_grouping), a dispositive admission failure. The corrected date and retained exact scope do not override the independent spine gate.",
    };
  }
  if (candidateId === B67_CANDIDATE_ID) {
    return {
      candidateId,
      decision: "approved",
      reviewer,
      rationale:
        "Approved for estimator admission only: v1-rc26 preserves the stable Flatbush Phase 1 occurrence and proves that September installation precedes the 2025-10-02 operational opening on the same Livingston-to-State bounded corridor. Exact deduplication with the NYC DOT registry row removes the competing-onset ambiguity. The candidate-bound scope mapping, series_ready_with_gaps B67 spine, 6-pre/5-post nominal calendar, and conflict checks pass; sample, controls, estimator gates, anchor review, and publication remain independent.",
    };
  }
  return prior;
});
const approvedCandidateIds = decisions
  .filter((decision) => decision.decision === "approved")
  .map((decision) => decision.candidateId);
assertEqual(approvedCandidateIds.length, 7, "rc26 approved count");

const receipt = {
  artifactKind: "bp.studio.study_event_approvals.v3",
  schemaVersion: 3,
  candidateSetId: RC26_CANDIDATE_SET_ID,
  decisions,
};
writeJson(receiptPath, receipt);

assertEqual(rc25Scope.bindings.length, 2, "rc25 physical scope binding count");
assertEqual(
  stableJson(uniqueSorted(rc25Scope.bindings.map((binding: Json) => binding.candidateId))),
  stableJson([B41_CANDIDATE_ID, B67_CANDIDATE_ID].toSorted()),
  "Flatbush scope binding candidates",
);
const scopeBindings = {
  ...rc25Scope,
  candidateSetId: RC26_CANDIDATE_SET_ID,
  sourceRelease: {
    releaseId: "v1-rc26",
    manifestSha256: RC26_MANIFEST_SHA256,
    occurrencesSha256: RC26_OCCURRENCES_SHA256,
  },
};
writeJson(scopePath, scopeBindings);

const reconciliation = {
  artifactKind: "bp.studio.plan074_rc26_review_reconciliation.v1",
  authorization: "owner_directed_flatbush_operational_onset_resumption",
  authorizesStudyRun: true,
  authorizesPublication: false,
  priorCandidateSet: {
    candidateSetId: RC25_CANDIDATE_SET_ID,
    candidateSha256: RC25_CANDIDATE_SHA256,
    decisionCount: 486,
  },
  candidateSetId: RC26_CANDIDATE_SET_ID,
  candidateSha256: RC26_CANDIDATE_SHA256,
  worksheetSha256: RC26_WORKSHEET_SHA256,
  sourceRelease: {
    releaseId: "v1-rc26",
    manifestSha256: RC26_MANIFEST_SHA256,
    occurrencesSha256: RC26_OCCURRENCES_SHA256,
    trackerImportSha256: RC26_IMPORT_SHA256,
  },
  summary: {
    candidateCount: 484,
    preservedDecisionCount: 482,
    revisedDecisionCount: 2,
    approvedCount: 7,
    rejectedCount: 477,
    removedExactDuplicateCount: 2,
  },
  removedExactDuplicateCandidateIds: removedCandidateIds,
  revisedDecisions: decisions.filter(
    (decision) =>
      decision.candidateId === B41_CANDIDATE_ID || decision.candidateId === B67_CANDIDATE_ID,
  ),
  approvedCandidateIds,
  outputs: {
    receiptSha256: sha256(receiptPath),
    scopeBindingsSha256: sha256(scopePath),
  },
  notice:
    "The rc25 decisions were explicitly replayed only for surviving candidates whose admission semantics are unchanged. B41 and B67 were re-adjudicated against rc26; estimator, anchor-review, and publication gates remain independent.",
};
writeJson(reconciliationPath, reconciliation);

console.log(
  JSON.stringify(
    {
      receipt: receiptPath,
      receiptSha256: sha256(receiptPath),
      scopeBindings: scopePath,
      scopeBindingsSha256: sha256(scopePath),
      reconciliation: reconciliationPath,
      reconciliationSha256: sha256(reconciliationPath),
      candidateCount: decisions.length,
      approvedCount: approvedCandidateIds.length,
      approvedCandidateIds,
    },
    null,
    2,
  ),
);
