import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { RouteTreatmentInterventionEventRow } from "@bp/analytics/interventions";
import { decodeStrict } from "@bp/domain/decode";
import {
  type StudyEventApprovalArtifactV3,
  type StudyEventApprovalArtifactV4,
  StudyEventMergeArtifactV3Schema,
  StudyEventMergeArtifactV4Schema,
  type StudyReviewInputsArtifactV1,
  StudyReviewInputsArtifactV1Schema,
} from "@bp/domain/studio/study";
import { fromRepoRoot } from "../../src/lib/paths.ts";
import {
  buildStudyEventMergeArtifactV3,
  buildStudyEventMergeArtifactV4,
  type PinnedWikiOccurrenceStudyInputV4,
  validateStudyEventMergeArtifactV4,
} from "../../src/lib/study-engine/study-events.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);

function registryEvent(description = "ACE route activation"): RouteTreatmentInterventionEventRow {
  return {
    event_id: "ace-b60",
    route_id: "B60",
    intervention_type: "automated_bus_lane_enforcement",
    source_id: "mta_ace_routes",
    program: "ACE",
    implementation_date: "2025-12-08",
    implementation_month: "2025-12",
    event_status: "implemented",
    description,
  };
}

const wiki: PinnedWikiOccurrenceStudyInputV4 = {
  releaseId: "v1-rc26",
  manifestSha256: HASH_A,
  artifactSha256: HASH_B,
  relationshipBundleSha256: HASH_C,
  relationshipEnforcementProofCanonicalSha256: HASH_D,
  producerReviewCompatibility: "compatible",
  occurrences: [],
};

function reviewInputs(candidateSetId: string, month = "2026-05"): StudyReviewInputsArtifactV1 {
  return decodeStrict(StudyReviewInputsArtifactV1Schema)({
    artifactKind: "bp.studio.study_review_inputs.v1",
    schemaVersion: 1,
    analysisMonth: month,
    outcomeSnapshot: {
      sourceId: "bus_segment_speeds_2025",
      sourceTable: "local_route_segment_speed",
      projectionVersion: "study-outcome-projection-v1",
      coverageStartMonth: month,
      coverageEndMonth: month,
      rowCount: 10,
      routeCount: 1,
      busTripCount: 100,
      months: [{ month, rowCount: 10, routeCount: 1, busTripCount: 100 }],
      logicalSha256: HASH_A,
      availability: {
        latestCompleteMonth: month,
        artifact: { sha256: HASH_B, byteCount: 100 },
      },
    },
    speedSpineSnapshot: {
      startMonth: month,
      endMonth: month,
      toleranceMeters: 110,
      routeCount: 1,
      logicalSha256: HASH_C,
      manifest: { sha256: HASH_D, byteCount: 200 },
      routes: [
        {
          routeId: "B60",
          readiness: "series_ready",
          artifactKey: "studio/v2/routes/b60/speed-spine.json",
          artifact: { sha256: HASH_A, byteCount: 300 },
        },
      ],
    },
    physicalScopeSnapshot: {
      bindings: { sha256: HASH_B, byteCount: 400 },
      candidateSetId,
      analysisMonth: month,
      localBusLaneSha256: HASH_C,
      localBusLaneCoordinateSha256: HASH_D,
    },
    engineVersion: "segment-matched-did-v2",
    reviewPolicyVersion: "plan074-admission-v1",
  });
}

function awaiting(description = "ACE route activation", month = "2026-05") {
  const registryEvents = [registryEvent(description)];
  const base = buildStudyEventMergeArtifactV3({
    registryEvents,
    wiki,
    availableAnalysisRouteIds: new Set(["B60"]),
  });
  if (base.approvalState !== "awaiting_approval") throw new Error("unexpected blocked fixture");
  return buildStudyEventMergeArtifactV4({
    registryEvents,
    wiki,
    availableAnalysisRouteIds: new Set(["B60"]),
    reviewInputs: reviewInputs(base.candidateSetId, month),
  });
}

function approvalFor(artifact: ReturnType<typeof awaiting>): StudyEventApprovalArtifactV4 {
  return {
    artifactKind: "bp.studio.study_event_approvals.v4",
    schemaVersion: 4,
    candidateSetId: artifact.candidateSetId,
    reviewCutId: artifact.reviewCutId,
    decisions: artifact.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      decision: "approved",
      reviewer: "test-operator",
      rationale: "Exact fixture facts reviewed.",
    })),
  };
}

describe("versioned study review cuts", () => {
  test("identical inputs produce identical identities and bytes", () => {
    const left = awaiting();
    const right = awaiting();
    expect(left.reviewCutId).toBe(right.reviewCutId);
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
    expect(() => decodeStrict(StudyEventMergeArtifactV4Schema)(left)).not.toThrow();
  });

  test("analysis month, outcome, spine, and source universe each change the cut", () => {
    const baseline = awaiting();
    expect(awaiting("ACE route activation", "2026-06").reviewCutId).not.toBe(baseline.reviewCutId);

    const changedOutcome = structuredClone(baseline.reviewInputs) as {
      outcomeSnapshot: { logicalSha256: string };
    } & StudyReviewInputsArtifactV1;
    changedOutcome.outcomeSnapshot.logicalSha256 = HASH_D;
    const outcomeCut = buildStudyEventMergeArtifactV4({
      registryEvents: [registryEvent()],
      wiki,
      availableAnalysisRouteIds: new Set(["B60"]),
      reviewInputs: changedOutcome,
    });
    expect(outcomeCut.reviewCutId).not.toBe(baseline.reviewCutId);

    const changedSpine = structuredClone(baseline.reviewInputs) as {
      speedSpineSnapshot: { logicalSha256: string };
    } & StudyReviewInputsArtifactV1;
    changedSpine.speedSpineSnapshot.logicalSha256 = HASH_D;
    const spineCut = buildStudyEventMergeArtifactV4({
      registryEvents: [registryEvent()],
      wiki,
      availableAnalysisRouteIds: new Set(["B60"]),
      reviewInputs: changedSpine,
    });
    expect(spineCut.reviewCutId).not.toBe(baseline.reviewCutId);

    const sourceCut = awaiting("ACE route activation with revised raw registry text");
    expect(sourceCut.candidateSetId).toBe(baseline.candidateSetId);
    expect(sourceCut.candidateUniverse.logicalSha256).not.toBe(
      baseline.candidateUniverse.logicalSha256,
    );
    expect(sourceCut.reviewCutId).not.toBe(baseline.reviewCutId);
  });

  test("engine drift and review-cut tampering fail closed", () => {
    const artifact = awaiting();
    const badEngine = structuredClone(artifact) as unknown as {
      reviewInputs: { engineVersion: string };
    };
    badEngine.reviewInputs.engineVersion = "segment-matched-did-v3";
    expect(() => decodeStrict(StudyEventMergeArtifactV4Schema)(badEngine)).toThrow();

    const badHash = structuredClone(artifact) as typeof artifact & {
      reviewInputs: { outcomeSnapshot: { logicalSha256: string } };
    };
    badHash.reviewInputs.outcomeSnapshot.logicalSha256 = HASH_D;
    expect(() => validateStudyEventMergeArtifactV4(badHash)).toThrow(
      "Study review-cut identity mismatch",
    );
  });

  test("v3, incomplete, duplicate, and stale receipts cannot authorize a cut", () => {
    const artifact = awaiting();
    const v3Approval: StudyEventApprovalArtifactV3 = {
      artifactKind: "bp.studio.study_event_approvals.v3",
      schemaVersion: 3,
      candidateSetId: artifact.candidateSetId,
      decisions: [],
    };
    expect(() =>
      buildStudyEventMergeArtifactV4({
        registryEvents: [registryEvent()],
        wiki,
        availableAnalysisRouteIds: new Set(["B60"]),
        reviewInputs: artifact.reviewInputs,
        approval: v3Approval as unknown as StudyEventApprovalArtifactV4,
      }),
    ).toThrow("fresh v4 approval");

    const approval = approvalFor(artifact);
    expect(() =>
      buildStudyEventMergeArtifactV4({
        registryEvents: [registryEvent()],
        wiki,
        availableAnalysisRouteIds: new Set(["B60"]),
        reviewInputs: artifact.reviewInputs,
        approval: { ...approval, decisions: [] },
      }),
    ).toThrow("exactly one decision");
    expect(() =>
      buildStudyEventMergeArtifactV4({
        registryEvents: [registryEvent()],
        wiki,
        availableAnalysisRouteIds: new Set(["B60"]),
        reviewInputs: artifact.reviewInputs,
        approval: { ...approval, decisions: [...approval.decisions, ...approval.decisions] },
      }),
    ).toThrow("duplicate candidate decisions");
    expect(() =>
      buildStudyEventMergeArtifactV4({
        registryEvents: [registryEvent()],
        wiki,
        availableAnalysisRouteIds: new Set(["B60"]),
        reviewInputs: artifact.reviewInputs,
        approval: { ...approval, reviewCutId: "study-review-cut-v1:000000000000000000000000" },
      }),
    ).toThrow("approval is stale");
  });

  test("the committed rc26 v3 artifact still decodes byte-for-byte", async () => {
    const path = fromRepoRoot(
      "docs/research/artifacts/candidate-set-v3-80050ed598f3b2ab0d0a1e99.study-events.json",
    );
    const bytes = await readFile(path);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "fe4d3ce9fa9f73f660256034afa497a8a8935f3471c083358a171f5f719e5363",
    );
    expect(() =>
      decodeStrict(StudyEventMergeArtifactV3Schema)(JSON.parse(bytes.toString())),
    ).not.toThrow();
  });
});
