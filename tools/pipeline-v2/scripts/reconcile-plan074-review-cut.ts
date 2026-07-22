import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { admitStudyTreatmentScope } from "../src/lib/study-engine/scope.ts";

// biome-ignore lint/suspicious/noExplicitAny: this script compares immutable JSON wire artifacts.
type Json = any;

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
const stable = (value: unknown): string => JSON.stringify(value);
const writeJson = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};
const monthIndex = (month: string): number => {
  const [year = 0, value = 0] = month.split("-").map(Number);
  return year * 12 + value - 1;
};
const outcomeWindow = (implementationMonth: string, analysisMonth: string) => {
  const implementation = monthIndex(implementationMonth);
  const floor = monthIndex("2023-04");
  const analysis = monthIndex(analysisMonth);
  const preMonthCount = Math.max(
    0,
    Math.min(analysis, implementation - 1) - Math.max(floor, implementation - 6) + 1,
  );
  const postMonthCount = Math.max(
    0,
    Math.min(analysis, implementation + 6) - Math.max(floor, implementation + 1) + 1,
  );
  return {
    analysisMonth,
    preMonthCount,
    postMonthCount,
    calendarMinimumFourPerSide: preMonthCount >= 4 && postMonthCount >= 4,
  };
};
const mapUnique = (rows: Json[], key: string, label: string): Map<string, Json> => {
  const output = new Map<string, Json>();
  for (const row of rows) {
    const id = row[key] as string;
    if (output.has(id)) throw new Error(`${label} repeats ${id}`);
    output.set(id, row);
  }
  return output;
};
const scopeFact = (candidate: Json, binding: Json | undefined) => {
  const result = admitStudyTreatmentScope(candidate, binding);
  if (result.status === "rejected") return result;
  return result.scope === "all_route_spines"
    ? result
    : {
        status: result.status,
        scope: result.scope,
        evidence: result.evidence,
        geometryFeatureIds: [...result.binding.geometryFeatureIds],
        physicalScopeRecordIds: [...result.binding.physicalScopeRecordIds],
        stableSpineSegmentIds: result.binding.segmentBindings
          .map((row) => row.spineSegmentId)
          .toSorted(),
      };
};

const baselineCandidatePath = required("baseline-candidate");
const currentCandidatePath = required("current-candidate");
const baselineReceiptPath = required("baseline-receipt");
const oldManifestPath = required("old-manifest");
const newManifestPath = required("new-manifest");
const oldScopePath = required("old-scope");
const newScopePath = required("new-scope");
const reviewInputsPath = required("review-inputs");
const worksheetPath = required("worksheet");
const outputPath = required("output");

const baselineCandidate = readJson(baselineCandidatePath);
const currentCandidate = readJson(currentCandidatePath);
const baselineReceipt = readJson(baselineReceiptPath);
const oldManifest = readJson(oldManifestPath);
const newManifest = readJson(newManifestPath);
const oldScope = readJson(oldScopePath);
const newScope = readJson(newScopePath);
const reviewInputs = readJson(reviewInputsPath);
const worksheet = readJson(worksheetPath);

if (
  baselineCandidate.candidateSetId !== currentCandidate.candidateSetId ||
  currentCandidate.candidateSetId !== baselineReceipt.candidateSetId ||
  currentCandidate.candidateSetId !== newScope.candidateSetId ||
  currentCandidate.reviewCutId !== worksheet.reviewCutId ||
  currentCandidate.reviewCutId !== worksheet.sourceArtifact.reviewCutId ||
  currentCandidate.approvalState !== "awaiting_approval" ||
  currentCandidate.approval !== null ||
  currentCandidate.reviewInputs.analysisMonth !== "2026-05" ||
  !stable(currentCandidate.reviewInputs).includes(reviewInputs.outcomeSnapshot.logicalSha256)
) {
  throw new Error("Review-cut inputs do not share one exact candidate universe and May cut");
}
if (stable(baselineCandidate.candidates) !== stable(currentCandidate.candidates)) {
  throw new Error("Pinned rc26 candidate semantics changed during the outcome-only cycle");
}
const candidates = currentCandidate.candidates as Json[];
const baselineDecisions = mapUnique(baselineReceipt.decisions, "candidateId", "baseline receipt");
if (
  candidates.length !== 484 ||
  worksheet.decisions.length !== candidates.length ||
  baselineDecisions.size !== candidates.length
) {
  throw new Error("Review coverage is not exactly the complete 484-candidate universe");
}

const oldSpines = mapUnique(oldManifest.routes, "routeId", "old spine manifest");
const newSpines = mapUnique(newManifest.routes, "routeId", "new spine manifest");
const oldBindings = mapUnique(oldScope.bindings, "candidateId", "old scope bindings");
const newBindings = mapUnique(newScope.bindings, "candidateId", "new scope bindings");
const oldArtifactRoot = oldManifest.source.artifactRoot as string;
const newArtifactRoot = newManifest.source.artifactRoot as string;
const artifactPath = (manifestRoot: string, row: Json | undefined): string | null => {
  if (row === undefined || row.artifactWritten !== true) return null;
  if (isAbsolute(row.artifactPath)) return row.artifactPath;
  return resolve(
    isAbsolute(manifestRoot) ? manifestRoot : required("old-repo-root"),
    row.artifactPath,
  );
};
const routeArtifact = (manifestRoot: string, row: Json | undefined) => {
  const path = artifactPath(manifestRoot, row);
  return path === null
    ? null
    : {
        sha256: sha256(path),
        readiness: row.readiness,
        reasons: row.reasons,
      };
};

const B60 = "study-event-v2:d75ce301dd2c427f5bf61c1e";
const B68 = "study-event-v2:45b1a3e59f241408afefc42d";
const M57 = "study-event-v2:754e5c72aaec62607149061c";
const focusIds = new Set([B60, B68, M57]);
const ready = new Set(["series_ready", "series_ready_with_gaps"]);
const recommendations = candidates
  .map((candidate) => {
    const prior = baselineDecisions.get(candidate.candidateId);
    if (prior === undefined) throw new Error(`Missing baseline decision ${candidate.candidateId}`);
    const oldSpine = routeArtifact(oldArtifactRoot, oldSpines.get(candidate.routeId));
    const newSpine = routeArtifact(newArtifactRoot, newSpines.get(candidate.routeId));
    const oldWindow = outcomeWindow(candidate.implementationMonth, "2026-03");
    const newWindow = outcomeWindow(candidate.implementationMonth, "2026-05");
    const oldScopeFact = scopeFact(candidate, oldBindings.get(candidate.candidateId));
    const newScopeFact = scopeFact(candidate, newBindings.get(candidate.candidateId));
    const earlierSameFamily = candidates
      .filter(
        (other) =>
          other.candidateId !== candidate.candidateId &&
          other.routeId === candidate.routeId &&
          other.treatmentFamily === candidate.treatmentFamily &&
          other.implementationDate < candidate.implementationDate,
      )
      .map((other) => ({
        candidateId: other.candidateId,
        implementationDate: other.implementationDate,
      }))
      .toSorted((left, right) => left.implementationDate.localeCompare(right.implementationDate));
    const wikiPhaseDispositions = [
      ...new Set(
        candidate.provenance
          .filter((row: Json) => row.sourceKind === "mta_wiki")
          .map((row: Json) => row.phaseRelationDisposition as string | null)
          .filter((value: string | null) => value !== null),
      ),
    ].toSorted();
    const facts = {
      staticCandidateSemanticsUnchanged: true,
      oldWindow,
      currentWindow: newWindow,
      oldSpine,
      currentSpine: newSpine,
      oldScope: oldScopeFact,
      currentScope: newScopeFact,
      earlierSameFamily,
      conflictState: candidate.conflictState,
      occurrenceId: candidate.occurrenceId,
      wikiPhaseDispositions,
    };
    const exactFactsUnchanged =
      stable(oldWindow) === stable(newWindow) &&
      stable(oldSpine) === stable(newSpine) &&
      stable(oldScopeFact) === stable(newScopeFact);
    let recommendation = prior.decision === "approved" ? "recommend_approve" : "recommend_reject";
    let rationale = `Fresh May 2026 review preserves the rc26 ${prior.decision} disposition after exact candidate comparison. Current scope=${newScopeFact.status === "admitted" ? newScopeFact.scope : newScopeFact.reason}; spine=${newSpine?.readiness ?? "missing"}; calendar=${newWindow.preMonthCount} pre/${newWindow.postMonthCount} post. Prior substantive review: ${prior.rationale}`;
    if (candidate.candidateId === B60 || candidate.candidateId === B68) {
      if (
        candidate.occurrenceId !== "occurrence:1ed365a241353614f72f025e" ||
        candidate.implementationDate !== "2025-12-08" ||
        candidate.datePrecision !== "day" ||
        candidate.conflictState !== "none" ||
        stable(wikiPhaseDispositions) !== '["single_phase"]' ||
        earlierSameFamily.length !== 0 ||
        newScopeFact.status !== "admitted" ||
        newScopeFact.scope !== "all_route_spines" ||
        newSpine === null ||
        !ready.has(newSpine.readiness) ||
        !newWindow.calendarMinimumFourPerSide
      ) {
        throw new Error(`${candidate.routeId} failed a required fresh ACE admission check`);
      }
      recommendation = "recommend_approve";
      rationale = `Recommend estimator admission only for ${candidate.routeId}: pinned rc26 occurrence occurrence:1ed365a241353614f72f025e proves the exact 2025-12-08 day onset and single phase; no earlier same-route ACE onset or conflict exists; trusted mta_ace_routes provenance proves route-wide scope; the fresh spine is ${newSpine.readiness}; and the unchanged window rule now supplies ${newWindow.preMonthCount} pre/${newWindow.postMonthCount} post months. Estimator, causal, anchor, and publication gates remain independent.`;
    } else if (candidate.candidateId === M57) {
      if (newSpine?.readiness !== "needs_pattern_review") {
        throw new Error("M57 no longer has its expected independent pattern failure");
      }
      recommendation = "recommend_reject";
      rationale = `Recommend rejection for M57: its exact 2025-12-08 ACE occurrence now has ${newWindow.preMonthCount} pre/${newWindow.postMonthCount} post months, but the fresh full spine remains needs_pattern_review (${newSpine.reasons.join(", ")}). Calendar sufficiency cannot override the unchanged readiness gate.`;
    }
    return {
      candidateId: candidate.candidateId,
      routeId: candidate.routeId,
      treatmentFamily: candidate.treatmentFamily,
      recommendation,
      reviewMode: exactFactsUnchanged
        ? "transferred_after_exact_fact_comparison"
        : "fresh_adjudication",
      baselineDecision: prior.decision,
      rationale,
      facts,
    };
  })
  .toSorted((left, right) => left.candidateId.localeCompare(right.candidateId));

const recommendedApproved = recommendations.filter(
  (row) => row.recommendation === "recommend_approve",
);
const decisionDelta = recommendations.filter(
  (row) =>
    (row.recommendation === "recommend_approve" ? "approved" : "rejected") !== row.baselineDecision,
);
if (
  recommendations.length !== 484 ||
  new Set(recommendations.map((row) => row.candidateId)).size !== 484 ||
  recommendedApproved.length !== 9 ||
  stable(decisionDelta.map((row) => row.candidateId).toSorted()) !== stable([B60, B68].toSorted())
) {
  throw new Error("Fresh recommendation coverage or exact decision delta is unexpected");
}
const report = {
  artifactKind: "bp.studio.plan074_review_cut_reconciliation.v1",
  schemaVersion: 1,
  authorizesStudyRun: false,
  authorizesPublication: false,
  candidateSetId: currentCandidate.candidateSetId,
  reviewCutId: currentCandidate.reviewCutId,
  analysisMonth: "2026-05",
  pinnedProducerRelease: {
    releaseId: currentCandidate.wikiInput.releaseId,
    manifestSha256: currentCandidate.wikiInput.manifestSha256,
    occurrenceArtifactSha256: currentCandidate.wikiInput.artifactSha256,
    memberExtentLineage: currentCandidate.candidateUniverse.memberExtentLineage,
  },
  inputs: {
    baselineCandidate: { sha256: sha256(baselineCandidatePath) },
    baselineReceipt: { sha256: sha256(baselineReceiptPath) },
    currentCandidate: { sha256: sha256(currentCandidatePath) },
    reviewInputs: { sha256: sha256(reviewInputsPath) },
    worksheet: { sha256: sha256(worksheetPath) },
    oldSpineManifest: { sha256: sha256(oldManifestPath) },
    newSpineManifest: { sha256: sha256(newManifestPath) },
    oldScopeBindings: { sha256: sha256(oldScopePath) },
    newScopeBindings: { sha256: sha256(newScopePath) },
  },
  summary: {
    candidateCount: recommendations.length,
    freshAdjudicationCount: recommendations.filter((row) => row.reviewMode === "fresh_adjudication")
      .length,
    exactTransferCount: recommendations.filter(
      (row) => row.reviewMode === "transferred_after_exact_fact_comparison",
    ).length,
    recommendedApproveCount: recommendedApproved.length,
    recommendedRejectCount: recommendations.length - recommendedApproved.length,
    decisionDeltaCount: decisionDelta.length,
  },
  decisionDelta,
  focus: recommendations.filter((row) => focusIds.has(row.candidateId)),
  recommendations,
  notice:
    "Non-authorizing complete-cut review only. No approval receipt exists; no study run or publication is authorized.",
};
writeJson(outputPath, report);
console.log(
  JSON.stringify(
    {
      outputPath,
      sha256: sha256(outputPath),
      summary: report.summary,
      decisionDelta: decisionDelta.map((row) => row.candidateId),
    },
    null,
    2,
  ),
);
