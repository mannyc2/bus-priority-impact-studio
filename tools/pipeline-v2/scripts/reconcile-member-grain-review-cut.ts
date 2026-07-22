import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import {
  StudyEventApprovalArtifactV4Schema,
  type StudyEventApprovalArtifactV5,
  type StudyEventCandidateV3,
  type StudyEventCandidateV4,
  StudyEventMergeArtifactV4AwaitingSchema,
  StudyEventMergeArtifactV5AwaitingSchema,
  StudyPhysicalScopeBindingsArtifactSchema,
  StudyPhysicalScopeBindingsArtifactV2Schema,
} from "@bp/domain/studio/study";
import {
  admitStudyMemberTreatmentScope,
  admitStudyTreatmentScope,
  validateStudyPhysicalScopeBindingsArtifactV2,
} from "../src/lib/study-engine/scope.ts";

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
const baselinePath = required("baseline");
const baselineReceiptPath = required("baseline-receipt");
const currentPath = required("current");
const priorScopePath = required("prior-scope");
const currentScopePath = required("current-scope");
const outputPath = required("output");
const approvalPath = required("approval-output");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}
function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function stable(value: unknown): string {
  return JSON.stringify(value);
}
function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
function mapUnique<T>(rows: readonly T[], key: (row: T) => string, label: string): Map<string, T> {
  const output = new Map<string, T>();
  for (const row of rows) {
    const id = key(row);
    if (output.has(id)) throw new Error(`${label} repeats ${id}`);
    output.set(id, row);
  }
  return output;
}
function monthIndex(month: string): number {
  const [year = 0, value = 0] = month.split("-").map(Number);
  return year * 12 + value - 1;
}
function outcomeWindow(implementationMonth: string, analysisMonth: string) {
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
    preMonthCount,
    postMonthCount,
    calendarMinimumFourPerSide: preMonthCount >= 4 && postMonthCount >= 4,
  };
}
function legacyScopeFact(
  candidate: StudyEventCandidateV3,
  binding: Parameters<typeof admitStudyTreatmentScope>[1],
) {
  const admission = admitStudyTreatmentScope(candidate, binding);
  return admission.status === "rejected"
    ? admission
    : admission.scope === "all_route_spines"
      ? admission
      : {
          status: admission.status,
          scope: admission.scope,
          evidence: admission.evidence,
          physicalScopeRecordIds: admission.binding.physicalScopeRecordIds,
          geometryFeatureIds: admission.binding.geometryFeatureIds,
          stableSpineSegmentIds: admission.binding.segmentBindings
            .map((row) => row.spineSegmentId)
            .toSorted(),
        };
}
function memberScopeFact(
  candidate: StudyEventCandidateV4,
  artifact: typeof StudyPhysicalScopeBindingsArtifactV2Schema.Type,
) {
  const admission = admitStudyMemberTreatmentScope(candidate, {
    artifact,
    candidateSetId: artifact.candidateSetId,
  });
  return admission.status === "rejected"
    ? admission
    : admission.scope === "all_route_spines"
      ? admission
      : {
          status: admission.status,
          scope: admission.scope,
          evidence: admission.evidence,
          memberBindings: admission.bindings.map((binding) => ({
            routeRecordId: binding.routeRecordId,
            treatmentRecordId: binding.treatmentRecordId,
            memberExtentId: binding.memberExtentId,
            producerComponentIds: binding.producerComponentIds,
            geometryFeatureIds: binding.geometryFeatureIds,
            stableSpineSegmentIds: binding.segmentBindings
              .map((row) => row.spineSegmentId)
              .toSorted(),
          })),
        };
}
function withoutMemberExtents(candidate: StudyEventCandidateV4): StudyEventCandidateV3 {
  const { memberExtents: _memberExtents, ...legacyShape } = candidate;
  return legacyShape;
}
function withoutContainerLineage(candidate: StudyEventCandidateV3): unknown {
  return {
    ...candidate,
    provenance: candidate.provenance.map((row) =>
      row.sourceKind === "mta_wiki"
        ? {
            ...row,
            releaseId: "<release-lineage>",
            manifestSha256: "<release-lineage>",
            relationshipBundleSha256: "<release-lineage>",
            relationshipEnforcementProofCanonicalSha256: "<release-lineage>",
          }
        : row,
    ),
  };
}

const baseline = decodeStrict(StudyEventMergeArtifactV4AwaitingSchema)(readJson(baselinePath));
const baselineReceipt = decodeStrict(StudyEventApprovalArtifactV4Schema)(
  readJson(baselineReceiptPath),
);
const current = decodeStrict(StudyEventMergeArtifactV5AwaitingSchema)(readJson(currentPath));
const priorScope = decodeStrict(StudyPhysicalScopeBindingsArtifactSchema)(readJson(priorScopePath));
const currentScope = decodeStrict(StudyPhysicalScopeBindingsArtifactV2Schema)(
  readJson(currentScopePath),
);

if (
  baseline.candidateSetId !== baselineReceipt.candidateSetId ||
  baseline.reviewCutId !== baselineReceipt.reviewCutId ||
  baseline.approvalState !== "awaiting_approval" ||
  baseline.approval !== null ||
  baseline.approvedEvents.length !== 0
) {
  throw new Error("Baseline awaiting event set and receipt do not bind the same immutable May cut");
}
if (
  current.approvalState !== "awaiting_approval" ||
  current.approval !== null ||
  current.approvedEvents.length !== 0
) {
  throw new Error("Current member-grain cut must be complete and non-authorizing");
}
if (
  baseline.reviewInputs.analysisMonth !== current.reviewInputs.analysisMonth ||
  stable(baseline.reviewInputs.outcomeSnapshot) !== stable(current.reviewInputs.outcomeSnapshot) ||
  stable(baseline.reviewInputs.speedSpineSnapshot) !==
    stable(current.reviewInputs.speedSpineSnapshot) ||
  baseline.reviewInputs.engineVersion !== current.reviewInputs.engineVersion ||
  baseline.reviewInputs.reviewPolicyVersion !== current.reviewInputs.reviewPolicyVersion ||
  baseline.reviewInputs.physicalScopeSnapshot.analysisMonth !==
    current.reviewInputs.physicalScopeSnapshot.analysisMonth ||
  baseline.reviewInputs.physicalScopeSnapshot.localBusLaneSha256 !==
    current.reviewInputs.physicalScopeSnapshot.localBusLaneSha256 ||
  baseline.reviewInputs.physicalScopeSnapshot.localBusLaneCoordinateSha256 !==
    current.reviewInputs.physicalScopeSnapshot.localBusLaneCoordinateSha256
) {
  throw new Error("May outcome, spine, engine, policy, or physical source inputs changed");
}
if (
  priorScope.candidateSetId !== baseline.candidateSetId ||
  currentScope.candidateSetId !== current.candidateSetId ||
  priorScope.analysisMonth !== currentScope.analysisMonth ||
  current.reviewInputs.physicalScopeSnapshot.candidateSetId !== current.candidateSetId
) {
  throw new Error("Physical-scope artifacts do not bind their exact candidate cuts");
}
validateStudyPhysicalScopeBindingsArtifactV2({
  artifact: currentScope,
  candidateSetId: current.candidateSetId,
  candidates: current.candidates,
  sourceRelease: currentScope.sourceRelease,
});

const baselineCandidates = mapUnique(baseline.candidates, (row) => row.candidateId, "baseline");
const currentCandidates = mapUnique(current.candidates, (row) => row.candidateId, "current");
const baselineDecisions = mapUnique(
  baselineReceipt.decisions,
  (row) => row.candidateId,
  "baseline receipt",
);
const priorBindings = mapUnique(priorScope.bindings, (row) => row.candidateId, "prior scope");
if (
  baselineCandidates.size !== baselineDecisions.size ||
  baselineCandidates.size !== currentCandidates.size ||
  [...baselineCandidates.keys()].some((candidateId) => !currentCandidates.has(candidateId))
) {
  throw new Error("Candidate universe changed cardinality or stable study-event identity");
}

const spineByRoute = mapUnique(
  current.reviewInputs.speedSpineSnapshot.routes,
  (row) => row.routeId,
  "current spine snapshot",
);
const ready = new Set(["series_ready", "series_ready_with_gaps"]);
const recommendations = current.candidates
  .map((candidate) => {
    const priorCandidate = baselineCandidates.get(candidate.candidateId);
    const priorDecision = baselineDecisions.get(candidate.candidateId);
    if (priorCandidate === undefined || priorDecision === undefined) {
      throw new Error(`Missing baseline review for ${candidate.candidateId}`);
    }
    const priorScopeFact = legacyScopeFact(
      priorCandidate,
      priorBindings.get(candidate.candidateId),
    );
    const currentScopeFact = memberScopeFact(candidate, currentScope);
    const spine = spineByRoute.get(candidate.routeId) ?? null;
    const window = outcomeWindow(candidate.implementationMonth, current.reviewInputs.analysisMonth);
    const earlierSameFamily = current.candidates
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
        candidate.provenance.flatMap((row) =>
          row.sourceKind === "mta_wiki" && row.phaseRelationDisposition !== null
            ? [row.phaseRelationDisposition]
            : [],
        ),
      ),
    ].toSorted();
    const legacyCandidate = withoutMemberExtents(candidate);
    const exactCandidateEqual = stable(priorCandidate) === stable(legacyCandidate);
    const admissionSemanticsEqual =
      stable(withoutContainerLineage(priorCandidate)) ===
      stable(withoutContainerLineage(legacyCandidate));
    const sourceLineageChanged = !exactCandidateEqual && admissionSemanticsEqual;
    const memberExtentIntroduced = candidate.memberExtents.length > 0;
    const positiveMemberExtent =
      memberExtentIntroduced &&
      candidate.memberExtents.every(
        (member) => member.extent === "route_wide" || member.extent === "bounded_segment",
      );
    const basicAdmissionGatesPass =
      admissionSemanticsEqual &&
      currentScopeFact.status === "admitted" &&
      spine !== null &&
      ready.has(spine.readiness) &&
      window.calendarMinimumFourPerSide &&
      candidate.conflictState === "none";
    const newlyResolvedMemberScope =
      priorScopeFact.status === "rejected" &&
      currentScopeFact.status === "admitted" &&
      positiveMemberExtent;
    const newWikiAdmissionGatesPass =
      basicAdmissionGatesPass &&
      candidate.datePrecision === "day" &&
      stable(wikiPhaseDispositions) === '["single_phase"]' &&
      earlierSameFamily.length === 0;

    let recommendation: "recommend_approve" | "recommend_reject" =
      priorDecision.decision === "approved" ? "recommend_approve" : "recommend_reject";
    if (priorDecision.decision === "approved" && !basicAdmissionGatesPass) {
      recommendation = "recommend_reject";
    } else if (priorDecision.decision === "rejected" && newlyResolvedMemberScope) {
      recommendation = newWikiAdmissionGatesPass ? "recommend_approve" : "recommend_reject";
    }
    const reviewMode =
      exactCandidateEqual && !memberExtentIntroduced
        ? "transferred_after_exact_fact_comparison"
        : "fresh_adjudication";
    const rationale =
      reviewMode === "transferred_after_exact_fact_comparison"
        ? `Transferred the May ${priorDecision.decision} decision only after exact candidate, scope, calendar, spine, phase, conflict, engine, and policy comparison. Prior rationale: ${priorDecision.rationale}`
        : `${recommendation === "recommend_approve" ? "Approve" : "Reject"} for estimator admission after fresh member-grain review. Prior=${priorDecision.decision}; member extents=${candidate.memberExtents.map((member) => `${member.treatment_record_id}:${member.extent}`).join(", ") || "none"}; prior scope=${priorScopeFact.status === "admitted" ? priorScopeFact.scope : priorScopeFact.reason}; current scope=${currentScopeFact.status === "admitted" ? currentScopeFact.scope : currentScopeFact.reason}; spine=${spine?.readiness ?? "missing"}; calendar=${window.preMonthCount} pre/${window.postMonthCount} post; earlier same-family=${earlierSameFamily.length}; phase=${wikiPhaseDispositions.join(",") || "not_applicable"}. Member extent changes only the scope-identity gate; all other gates remain independent.`;
    return {
      candidateId: candidate.candidateId,
      routeId: candidate.routeId,
      treatmentFamily: candidate.treatmentFamily,
      baselineDecision: priorDecision.decision,
      recommendation,
      reviewMode,
      rationale,
      facts: {
        exactCandidateEqual,
        admissionSemanticsEqual,
        sourceLineageChanged,
        memberExtentIntroduced,
        memberExtents: candidate.memberExtents,
        priorScope: priorScopeFact,
        currentScope: currentScopeFact,
        spine,
        window,
        earlierSameFamily,
        conflictState: candidate.conflictState,
        wikiPhaseDispositions,
      },
    };
  })
  .toSorted((left, right) => left.candidateId.localeCompare(right.candidateId));

if (
  recommendations.length !== current.candidates.length ||
  new Set(recommendations.map((row) => row.candidateId)).size !== current.candidates.length
) {
  throw new Error("Fresh member-grain review is incomplete or duplicated");
}
const decisionDelta = recommendations.filter(
  (row) =>
    (row.recommendation === "recommend_approve" ? "approved" : "rejected") !== row.baselineDecision,
);
const changedBaseSemantics = recommendations.filter((row) => !row.facts.admissionSemanticsEqual);
if (changedBaseSemantics.length !== 0) {
  throw new Error(
    `Producer occurrence semantics changed for ${changedBaseSemantics.length} candidates; this outcome-only reconciliation cannot transfer or adjudicate them`,
  );
}
const recommendedApproved = recommendations.filter(
  (row) => row.recommendation === "recommend_approve",
);
const laterAce = recommendations.filter(
  (row) =>
    row.treatmentFamily === "automated_bus_lane_enforcement" &&
    row.facts.earlierSameFamily.length > 0,
);
if (laterAce.some((row) => row.recommendation !== "recommend_reject")) {
  throw new Error("A later ACE phase escaped its independent quarantine");
}

const approval: StudyEventApprovalArtifactV5 = {
  artifactKind: "bp.studio.study_event_approvals.v5",
  schemaVersion: 5,
  candidateSetId: current.candidateSetId,
  reviewCutId: current.reviewCutId,
  decisions: recommendations.map((row) => ({
    candidateId: row.candidateId,
    decision: row.recommendation === "recommend_approve" ? "approved" : "rejected",
    reviewer: "codex-plan096-member-grain-review",
    rationale: row.rationale,
  })),
};
const focusRoutes = new Set(["Q45", "Q63", "Q80", "Q86", "Q87", "B41", "M57"]);
const report = {
  artifactKind: "bp.studio.member_grain_review_reconciliation.v1",
  schemaVersion: 1,
  authorizesStudyRun: false,
  authorizesPublication: false,
  candidateSetId: current.candidateSetId,
  reviewCutId: current.reviewCutId,
  analysisMonth: current.reviewInputs.analysisMonth,
  pinnedProducerRelease: {
    releaseId: current.wikiInput.releaseId,
    generatorCommit: current.wikiInput.generatorCommit,
    manifestSha256: current.wikiInput.manifestSha256,
    occurrenceArtifactSha256: current.wikiInput.artifactSha256,
    memberExtent: current.wikiInput.memberExtent,
  },
  inputs: {
    baseline: { sha256: sha256File(baselinePath) },
    baselineReceipt: { sha256: sha256File(baselineReceiptPath) },
    current: { sha256: sha256File(currentPath) },
    priorScope: { sha256: sha256File(priorScopePath) },
    currentScope: { sha256: sha256File(currentScopePath) },
  },
  unchangedReviewInputs: {
    outcomeSnapshot: true,
    speedSpineSnapshot: true,
    engineVersion: true,
    reviewPolicyVersion: true,
    physicalSourceHashes: true,
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
    laterAceQuarantineCount: laterAce.length,
  },
  decisionDelta,
  focus: recommendations.filter((row) => focusRoutes.has(row.routeId)),
  recommendations,
  notice:
    "Complete estimator-admission review only. This receipt does not authorize a study run, publication, D1 mutation, production pointer, or deploy.",
};

writeJson(outputPath, report);
writeJson(approvalPath, approval);
console.log(
  JSON.stringify(
    {
      outputPath,
      outputSha256: sha256File(outputPath),
      approvalPath,
      approvalSha256: sha256File(approvalPath),
      summary: report.summary,
      decisionDelta: decisionDelta.map((row) => ({
        candidateId: row.candidateId,
        routeId: row.routeId,
        from: row.baselineDecision,
        to: row.recommendation,
      })),
    },
    null,
    2,
  ),
);
