import { describe, expect, test } from "bun:test";
import type { RouteTreatmentInterventionEventRow } from "@bp/analytics/interventions";
import { decodeStrict } from "@bp/domain/decode";
import {
  type OperationalOccurrenceMemberExtentRowV1,
  OperationalOccurrenceMemberExtentRowV1Schema,
  type OperationalOccurrenceRowV2,
  OperationalOccurrenceRowV2Schema,
} from "@bp/domain/documents/operational-occurrence";
import {
  type StudyEventApprovalArtifactV4,
  type StudyEventApprovalArtifactV5,
  StudyEventMergeArtifactV5Schema,
  type StudyReviewInputsArtifactV1,
  StudyReviewInputsArtifactV1Schema,
} from "@bp/domain/studio/study";
import { buildStudyEventReviewWorksheet } from "../../src/commands/study/prepare-review-worksheet.ts";
import {
  buildStudyEventCandidateSetArtifactV4,
  buildStudyEventMergeArtifactV3,
  buildStudyEventMergeArtifactV5,
  type PinnedWikiOccurrenceMemberExtentStudyInput,
  validateStudyEventMergeArtifactV5,
} from "../../src/lib/study-engine/study-events.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const HASH_E = "e".repeat(64);
const HASH_F = "f".repeat(64);

const ONSET = {
  role: "event_date" as const,
  record_id: "event:ace-b60",
  source_id: "source:official",
  evidence_id: "source:official#onset",
};
const ROUTE_IDENTITY = {
  role: "route_identity" as const,
  record_id: "route:b60",
  source_id: "source:official",
  evidence_id: "source:official#route-b60",
};
const TREATMENT_DEFINITION = {
  role: "treatment_definition" as const,
  record_id: "treatment:ace",
  source_id: "source:official",
  evidence_id: "source:official#ace",
};

function occurrence(): OperationalOccurrenceRowV2 {
  return decodeStrict(OperationalOccurrenceRowV2Schema)({
    schema_version: 2,
    occurrence_id: "occurrence:ace-b60",
    occurrence_aliases: [],
    occurrence_review_decision_id: "decision:ace-b60",
    founding_key: "ace-b60",
    resolution_cluster_id: null,
    observations: [
      {
        event_record_id: "event:ace-b60",
        relation_record_ids: [],
        document_time_statuses: ["implemented"],
        document_time_dates: [
          {
            raw: "December 8, 2025",
            normalized: "2025-12-08",
            precision: "day",
            source_field: "event_date",
          },
        ],
        status_as_of_dates: [],
      },
    ],
    resolved_status: "realized",
    resolved_onset: {
      date: "2025-12-08",
      precision: "day",
      resolver_ids: ["decision:ace-b60"],
      publication_dates: ["2025-12-08"],
      retrieval_dates: ["2026-01-01"],
      evidence_bindings: [ONSET],
    },
    routes: [
      {
        route_record_id: "route:b60",
        gtfs_route_id: "B60",
        evidence_bindings: [ROUTE_IDENTITY],
      },
    ],
    treatment: {
      kind: "atomic",
      member: {
        treatment_record_id: "treatment:ace",
        treatment_family: "automated_bus_lane_enforcement",
        evidence_bindings: [TREATMENT_DEFINITION],
      },
    },
    source_ids: ["source:official"],
    evidence_bindings: [ONSET, ROUTE_IDENTITY, TREATMENT_DEFINITION],
    exclusion_reasons: [],
    review_state: "approved",
    study_projection_eligible: true,
    phase_record_ids: ["event:ace-b60"],
    phase_relation_record_ids: [],
    phase_relation_evidence_bindings: [],
    phase_relation_disposition: "single_phase",
    physical_scope_record_ids: [],
    physical_scope_relation_record_ids: [],
    physical_scope_evidence_bindings: [],
    provenance: {
      anchor_review_decision_ids: ["anchor:ace-b60"],
      event_record_ids: ["event:ace-b60"],
      relation_record_ids: [],
      route_record_ids: ["route:b60"],
      treatment_record_ids: ["treatment:ace"],
    },
  });
}

function memberExtent(
  options: { projectionDetail?: string; treatmentRecordId?: string } = {},
): OperationalOccurrenceMemberExtentRowV1 {
  const treatmentRecordId = options.treatmentRecordId ?? "treatment:ace";
  return decodeStrict(OperationalOccurrenceMemberExtentRowV1Schema)({
    schema_version: 1,
    contract_id: "operational-occurrence-member-extent-v1",
    extent_id: `extent:ace-b60:${treatmentRecordId.replaceAll(":", "-")}`,
    occurrence_id: "occurrence:ace-b60",
    occurrence_review_decision_id: "decision:ace-b60",
    route_record_id: "route:b60",
    gtfs_route_id: "B60",
    treatment_record_id: treatmentRecordId,
    treatment_family: "automated_bus_lane_enforcement",
    extent: "route_wide",
    components: [
      {
        component_kind: "route",
        identity_namespace: "canonical_record",
        identifiers: ["route:b60"],
        description: options.projectionDetail ?? "The reviewed member applies route-wide.",
      },
    ],
    evidence_bindings: [
      {
        role: "reviewed_extent_decision",
        record_id: treatmentRecordId,
        source_id: "source:official",
        evidence_id: "source:official#member-extent",
      },
    ],
    missing_roles: [],
    decision_id: "member-decision:ace-b60",
    rationale: "Reviewed exact occurrence, route, and treatment-member extent.",
    authorizes_study: false,
    authorizes_cross_product: false,
  });
}

function wiki(
  options: {
    manifestSha256?: string;
    projectionSha256?: string;
    memberExtents?: OperationalOccurrenceMemberExtentRowV1[];
  } = {},
): PinnedWikiOccurrenceMemberExtentStudyInput {
  const memberExtents = options.memberExtents ?? [memberExtent()];
  return {
    releaseId: "v1-rc-member-fixture",
    generatorCommit: "1".repeat(40),
    manifestSha256: HASH_A,
    artifactSha256: HASH_B,
    relationshipBundleSha256: HASH_C,
    relationshipEnforcementProofCanonicalSha256: HASH_D,
    producerReviewCompatibility: "compatible",
    occurrences: [occurrence()],
    memberExtentLineage: {
      identityGrain: "occurrence_route_member",
      sourceOccurrenceReleaseId: "v1-rc26",
      manifestSha256: options.manifestSha256 ?? HASH_E,
      projectionSha256: options.projectionSha256 ?? HASH_F,
      rowCount: memberExtents.length,
      eligibleRowCount: memberExtents.length,
    },
    memberExtents,
  };
}

function registryEvent(): RouteTreatmentInterventionEventRow {
  return {
    event_id: "ace-b60",
    route_id: "B60",
    intervention_type: "automated_bus_lane_enforcement",
    source_id: "mta_ace_routes",
    program: "ACE",
    implementation_date: "2025-12-08",
    implementation_month: "2025-12",
    event_status: "implemented",
    description: "ACE route activation",
  };
}

function candidateSet(wikiInput = wiki()) {
  return buildStudyEventCandidateSetArtifactV4({
    registryEvents: [registryEvent()],
    wiki: wikiInput,
    availableAnalysisRouteIds: new Set(["B60"]),
  });
}

function reviewInputs(
  candidateSetId: string,
  options: {
    month?: string;
    outcomeSha256?: string;
    spineSha256?: string;
  } = {},
): StudyReviewInputsArtifactV1 {
  const month = options.month ?? "2026-05";
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
      logicalSha256: options.outcomeSha256 ?? HASH_A,
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
      logicalSha256: options.spineSha256 ?? HASH_C,
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

function awaiting(wikiInput = wiki(), inputs?: StudyReviewInputsArtifactV1) {
  const set = candidateSet(wikiInput);
  return buildStudyEventMergeArtifactV5({
    registryEvents: [registryEvent()],
    wiki: wikiInput,
    availableAnalysisRouteIds: new Set(["B60"]),
    reviewInputs: inputs ?? reviewInputs(set.candidateSetId),
  });
}

function approvalFor(artifact: ReturnType<typeof awaiting>): StudyEventApprovalArtifactV5 {
  return {
    artifactKind: "bp.studio.study_event_approvals.v5",
    schemaVersion: 5,
    candidateSetId: artifact.candidateSetId,
    reviewCutId: artifact.reviewCutId,
    decisions: artifact.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      decision: "approved",
      reviewer: "test-operator",
      rationale: "Reviewed exact fixture admission facts.",
    })),
  };
}

describe("member-grain study candidate universe and review cut", () => {
  test("prepares a non-authorizing v5 worksheet with exact member lineage", () => {
    const artifact = awaiting();
    const worksheet = buildStudyEventReviewWorksheet({
      artifact,
      generatedFrom: "fixture/study-events.json",
      generatedFromSha256: HASH_A,
      focusOccurrenceId: "occurrence:ace-b60",
      focusRouteId: "B60",
    });
    expect(worksheet.reviewCutId).toBe(artifact.reviewCutId);
    expect(worksheet.approval).toBeNull();
    expect(worksheet.sourceArtifact.artifactKind).toBe("bp.studio.study_events.v5");
    expect(worksheet.focus.pinnedLineage.memberExtent).toEqual({
      manifestSha256: HASH_E,
      projectionSha256: HASH_F,
    });
    const decision = worksheet.decisions[0];
    expect(decision !== undefined && "memberExtents" in decision).toBe(true);
    if (decision === undefined || !("memberExtents" in decision)) {
      throw new Error("v5 worksheet decision lost member extents");
    }
    expect(decision.memberExtents[0]?.treatment_record_id).toBe("treatment:ace");
  });

  test("identical inputs produce identical IDs and bytes", () => {
    const leftSet = candidateSet();
    const rightSet = candidateSet();
    expect(leftSet.candidateSetId).toBe(rightSet.candidateSetId);
    expect(JSON.stringify(leftSet)).toBe(JSON.stringify(rightSet));

    const left = awaiting();
    const right = awaiting();
    expect(left.reviewCutId).toBe(right.reviewCutId);
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
    expect(() => decodeStrict(StudyEventMergeArtifactV5Schema)(left)).not.toThrow();
  });

  test("preserves stable v3 candidate IDs and exact treatment-member IDs", () => {
    const wikiInput = wiki();
    const legacy = buildStudyEventMergeArtifactV3({
      registryEvents: [registryEvent()],
      wiki: wikiInput,
      availableAnalysisRouteIds: new Set(["B60"]),
    });
    const memberSet = candidateSet(wikiInput);

    expect(memberSet.candidates.map((candidate) => candidate.candidateId)).toEqual(
      legacy.candidates.map((candidate) => candidate.candidateId),
    );
    expect(memberSet.candidates).toHaveLength(1);
    expect(memberSet.candidates[0]?.memberExtents.map((row) => row.treatment_record_id)).toEqual([
      "treatment:ace",
    ]);
  });

  test("member manifest, projection, and exact member projection each change the universe and cut", () => {
    const baseline = awaiting();
    const changedManifest = awaiting(wiki({ manifestSha256: HASH_D }));
    const changedProjection = awaiting(wiki({ projectionSha256: HASH_E }));
    const changedMember = awaiting(
      wiki({ memberExtents: [memberExtent({ projectionDetail: "Reviewed revised extent." })] }),
    );

    for (const changed of [changedManifest, changedProjection, changedMember]) {
      expect(changed.candidateSetId).not.toBe(baseline.candidateSetId);
      expect(changed.candidateUniverse.logicalSha256).not.toBe(
        baseline.candidateUniverse.logicalSha256,
      );
      expect(changed.reviewCutId).not.toBe(baseline.reviewCutId);
    }
  });

  test("raw registry and available-route universe changes re-identify the candidate set", () => {
    const baseline = candidateSet();
    const changedRegistry = buildStudyEventCandidateSetArtifactV4({
      registryEvents: [{ ...registryEvent(), description: "Same candidate, revised source row." }],
      wiki: wiki(),
      availableAnalysisRouteIds: new Set(["B60"]),
    });
    const changedRoutes = buildStudyEventCandidateSetArtifactV4({
      registryEvents: [registryEvent()],
      wiki: wiki(),
      availableAnalysisRouteIds: new Set(["B60", "M57"]),
    });

    expect(changedRegistry.candidates).toEqual(baseline.candidates);
    expect(changedRoutes.candidates).toEqual(baseline.candidates);
    for (const changed of [changedRegistry, changedRoutes]) {
      expect(changed.candidateSetId).not.toBe(baseline.candidateSetId);
      expect(changed.candidateUniverse.logicalSha256).not.toBe(
        baseline.candidateUniverse.logicalSha256,
      );
    }
  });

  test("analysis month, outcome, and spine changes produce distinct cuts", () => {
    const set = candidateSet();
    const baseline = awaiting(wiki(), reviewInputs(set.candidateSetId));
    const changedMonth = awaiting(wiki(), reviewInputs(set.candidateSetId, { month: "2026-06" }));
    const changedOutcome = awaiting(
      wiki(),
      reviewInputs(set.candidateSetId, { outcomeSha256: HASH_D }),
    );
    const changedSpine = awaiting(
      wiki(),
      reviewInputs(set.candidateSetId, { spineSha256: HASH_D }),
    );

    expect(changedMonth.reviewCutId).not.toBe(baseline.reviewCutId);
    expect(changedOutcome.reviewCutId).not.toBe(baseline.reviewCutId);
    expect(changedSpine.reviewCutId).not.toBe(baseline.reviewCutId);
  });

  test("engine, candidate-universe, and receipt mismatches fail closed", () => {
    const artifact = awaiting();
    const badEngine = structuredClone(artifact.reviewInputs) as unknown as {
      engineVersion: string;
    };
    badEngine.engineVersion = "segment-matched-did-v3";
    expect(() => decodeStrict(StudyReviewInputsArtifactV1Schema)(badEngine)).toThrow();

    const staleScope = structuredClone(artifact.reviewInputs) as unknown as {
      physicalScopeSnapshot: { candidateSetId: string };
    } & StudyReviewInputsArtifactV1;
    staleScope.physicalScopeSnapshot.candidateSetId = "candidate-set-v4:000000000000000000000000";
    expect(() => awaiting(wiki(), staleScope)).toThrow("Physical-scope review input is stale");

    const tamperedCandidate = structuredClone(artifact) as unknown as {
      candidates: Array<{ routeId: string }>;
    } & typeof artifact;
    const firstCandidate = tamperedCandidate.candidates[0];
    if (firstCandidate === undefined) throw new Error("fixture requires one candidate");
    firstCandidate.routeId = "B61";
    expect(() => validateStudyEventMergeArtifactV5(tamperedCandidate)).toThrow(
      "Member-grain candidate-set identity mismatch",
    );

    const staleCut = structuredClone(artifact) as unknown as {
      reviewCutId: string;
    } & typeof artifact;
    staleCut.reviewCutId = "study-review-cut-v1:000000000000000000000000";
    expect(() => validateStudyEventMergeArtifactV5(staleCut)).toThrow(
      "Study review-cut identity mismatch",
    );
  });

  test("v4, incomplete, duplicate, and stale receipts cannot authorize v5", () => {
    const artifact = awaiting();
    const v4Approval: StudyEventApprovalArtifactV4 = {
      artifactKind: "bp.studio.study_event_approvals.v4",
      schemaVersion: 4,
      candidateSetId: artifact.candidateSetId,
      reviewCutId: artifact.reviewCutId,
      decisions: [],
    };
    // @ts-expect-error A legacy v4 receipt cannot satisfy the v5 approval contract.
    const compileTimeRejected: StudyEventApprovalArtifactV5 = v4Approval;
    expect((compileTimeRejected as unknown as { artifactKind: string }).artifactKind).toBe(
      "bp.studio.study_event_approvals.v4",
    );
    expect(() =>
      buildStudyEventMergeArtifactV5({
        registryEvents: [registryEvent()],
        wiki: wiki(),
        availableAnalysisRouteIds: new Set(["B60"]),
        reviewInputs: artifact.reviewInputs,
        approval: v4Approval as unknown as StudyEventApprovalArtifactV5,
      }),
    ).toThrow("fresh v5 approval");

    const approval = approvalFor(artifact);
    const base = {
      registryEvents: [registryEvent()],
      wiki: wiki(),
      availableAnalysisRouteIds: new Set(["B60"]),
      reviewInputs: artifact.reviewInputs,
    };
    expect(() =>
      buildStudyEventMergeArtifactV5({
        ...base,
        approval: { ...approval, decisions: [] },
      }),
    ).toThrow("exactly one decision");
    expect(() =>
      buildStudyEventMergeArtifactV5({
        ...base,
        approval: { ...approval, decisions: [...approval.decisions, ...approval.decisions] },
      }),
    ).toThrow("duplicate candidate decisions");
    expect(() =>
      buildStudyEventMergeArtifactV5({
        ...base,
        approval: {
          ...approval,
          candidateSetId: "candidate-set-v4:000000000000000000000000",
        },
      }),
    ).toThrow("approval is stale");
    expect(() =>
      buildStudyEventMergeArtifactV5({
        ...base,
        approval: {
          ...approval,
          reviewCutId: "study-review-cut-v1:000000000000000000000000",
        },
      }),
    ).toThrow("approval is stale");
  });
});
