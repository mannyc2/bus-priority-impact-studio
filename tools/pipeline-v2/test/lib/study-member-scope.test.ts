import { describe, expect, test } from "bun:test";
import type {
  StudyEventCandidateSetArtifactV4,
  StudyEventCandidateV4,
  StudyMemberPhysicalScopeBindingV2,
  StudyPhysicalScopeBindingsArtifact,
  StudyPhysicalScopeBindingsArtifactV2,
} from "@bp/domain/studio/study";
import {
  admitStudyMemberTreatmentScope,
  migrateStudyPhysicalScopeBindingsArtifactV2,
  validateStudyPhysicalScopeBindingsArtifactV2 as validateStudyPhysicalScopeBindingsArtifactV2Raw,
} from "../../src/lib/study-engine/scope.ts";

const CANDIDATE_SET_ID = `candidate-set-v4:${"a".repeat(24)}`;
const PROJECTION_SHA256 = "1".repeat(64);

function candidateProvenance(): StudyEventCandidateV4["provenance"][number] {
  return {
    sourceKind: "mta_wiki",
    sourceId: "queens_bus_network_redesign",
    sourceEventId: "occurrence:q45",
    releaseId: "v1-rc27",
    anchorIds: [],
    occurrenceId: "occurrence:q45",
    occurrenceAliases: [],
    manifestSha256: "2".repeat(64),
    artifactSha256: "3".repeat(64),
    occurrenceReviewDecisionId: "decision:q45",
    wikiRouteRecordId: "route:q45",
    gtfsRouteId: "Q45",
    analysisRouteId: "Q45",
    routeEvidenceBindings: [],
    treatmentEvidenceBindings: [],
    phaseRecordIds: [],
    phaseRelationRecordIds: [],
    phaseRelationEvidenceBindings: [],
    phaseRelationDisposition: "single_phase",
    physicalScopeRecordIds: [],
    physicalScopeRelationRecordIds: [],
    physicalScopeEvidenceBindings: [],
    relationshipBundleSha256: "4".repeat(64),
    relationshipEnforcementProofCanonicalSha256: "5".repeat(64),
    producerReviewCompatibility: "compatible",
  };
}

function memberExtent(
  overrides: Partial<StudyEventCandidateV4["memberExtents"][number]> = {},
): StudyEventCandidateV4["memberExtents"][number] {
  return {
    schema_version: 1,
    contract_id: "operational-occurrence-member-extent-v1",
    extent_id: "member-extent:q45-service",
    occurrence_id: "occurrence:q45",
    occurrence_review_decision_id: "decision:q45",
    route_record_id: "route:q45",
    gtfs_route_id: "Q45",
    treatment_record_id: "treatment:q45-service",
    treatment_family: "service_pattern",
    extent: "bounded_segment",
    components: [
      {
        component_kind: "segment",
        identity_namespace: "source_literal_v1",
        identifiers: ["source-literal:q45:188-st--kew-gardens"],
        description: "188 Street to Kew Gardens",
      },
    ],
    evidence_bindings: [
      {
        role: "extent_scope",
        record_id: "treatment:q45-service",
        source_id: "queens_bus_network_redesign",
        evidence_id: "q45#scope",
      },
    ],
    missing_roles: [],
    decision_id: "member-extent-review:q45",
    rationale: "The source names both endpoints.",
    authorizes_study: false,
    authorizes_cross_product: false,
    ...overrides,
  };
}

function candidate(overrides: Partial<StudyEventCandidateV4> = {}): StudyEventCandidateV4 {
  return {
    candidateId: "study-event-v2:q45",
    routeId: "Q45",
    treatmentFamily: "route_redesign",
    implementationDate: "2025-06-29",
    implementationMonth: "2025-06",
    datePrecision: "day",
    conflictState: "none",
    occurrenceId: "occurrence:q45",
    confounderGroupId: "qbnr-2025",
    treatmentScopeKind: "atomic",
    componentTreatmentFamilies: ["service_pattern"],
    provenance: [candidateProvenance()],
    memberExtents: [memberExtent()],
    ...overrides,
  };
}

function binding(
  overrides: Partial<StudyMemberPhysicalScopeBindingV2> = {},
): StudyMemberPhysicalScopeBindingV2 {
  return {
    candidateId: "study-event-v2:q45",
    routeId: "Q45",
    occurrenceId: "occurrence:q45",
    physicalScopeRecordIds: ["source-literal:q45:188-st--kew-gardens"],
    geometrySourceId: "nyc_dot_bus_lanes",
    geometryFeatureIds: ["geometry:q45:1"],
    selectedGeometryRowsSha256: "6".repeat(64),
    speedSpineSha256: "7".repeat(64),
    segmentBindings: [
      {
        sourceSegmentId: "Q45:2026-05:N:1:100:200",
        spineSegmentId: "q45-n-node-001-node-002",
      },
    ],
    routeRecordId: "route:q45",
    treatmentRecordId: "treatment:q45-service",
    memberExtentId: "member-extent:q45-service",
    memberExtentKind: "bounded_segment",
    memberExtentProjectionSha256: PROJECTION_SHA256,
    producerComponentIds: ["source-literal:q45:188-st--kew-gardens"],
    ...overrides,
  };
}

function artifact(
  bindings: readonly StudyMemberPhysicalScopeBindingV2[] = [binding()],
  overrides: Partial<StudyPhysicalScopeBindingsArtifactV2> = {},
): StudyPhysicalScopeBindingsArtifactV2 {
  return {
    artifactKind: "bp.studio.study_physical_scope_bindings.v2",
    schemaVersion: 2,
    candidateSetId: CANDIDATE_SET_ID,
    analysisMonth: "2026-05",
    sourceRelease: {
      releaseId: "v1-rc27",
      manifestSha256: "2".repeat(64),
      occurrencesSha256: "3".repeat(64),
      memberExtentManifestSha256: "8".repeat(64),
      memberExtentProjectionSha256: PROJECTION_SHA256,
    },
    inputs: {
      busLaneSnapshotSha256: "9".repeat(64),
      routeShapeSnapshotSha256: "a".repeat(64),
      stopSnapshotSha256: "b".repeat(64),
    },
    bindings: [...bindings],
    ...overrides,
  };
}

function bindingContext(value: StudyPhysicalScopeBindingsArtifactV2 = artifact()): {
  readonly artifact: StudyPhysicalScopeBindingsArtifactV2;
  readonly candidateSetId: string;
} {
  return { artifact: value, candidateSetId: CANDIDATE_SET_ID };
}

function validateStudyPhysicalScopeBindingsArtifactV2(input: {
  readonly artifact: StudyPhysicalScopeBindingsArtifactV2;
  readonly candidateSetId: string;
  readonly candidates: readonly StudyEventCandidateV4[];
}) {
  return validateStudyPhysicalScopeBindingsArtifactV2Raw({
    ...input,
    sourceRelease: artifact().sourceRelease,
  });
}

describe("member-grain study treatment-scope admission", () => {
  test("preserves independent exact ACE registry scope for registry-only and unresolved producer candidates", () => {
    const registryProvenance: StudyEventCandidateV4["provenance"][number] = {
      ...candidateProvenance(),
      sourceKind: "registry",
      sourceId: "mta_ace_routes",
      releaseId: null,
      occurrenceId: null,
      wikiRouteRecordId: null,
      gtfsRouteId: null,
    };
    const registryOnly = candidate({
      treatmentFamily: "automated_bus_lane_enforcement",
      occurrenceId: null,
      provenance: [registryProvenance],
      memberExtents: [],
    });
    expect(admitStudyMemberTreatmentScope(registryOnly)).toEqual({
      status: "admitted",
      scope: "all_route_spines",
      evidence: "mta_ace_route_registry",
    });

    const unresolved = candidate({
      treatmentFamily: "automated_bus_lane_enforcement",
      memberExtents: [
        memberExtent({
          extent: "unresolved",
          components: [],
          missing_roles: ["bounded_scope_identity"],
        }),
      ],
      provenance: [candidateProvenance(), registryProvenance],
    });
    expect(admitStudyMemberTreatmentScope(unresolved)).toEqual({
      status: "admitted",
      scope: "all_route_spines",
      evidence: "mta_ace_route_registry",
    });
  });

  test("admits route-wide members without manufacturing a geometry binding", () => {
    const routeWide = candidate({
      memberExtents: [
        memberExtent({
          extent: "route_wide",
          components: [
            {
              component_kind: "route",
              identity_namespace: "canonical_record",
              identifiers: ["route:q45"],
              description: "Whole Q45 service",
            },
          ],
        }),
      ],
    });

    expect(admitStudyMemberTreatmentScope(routeWide)).toEqual({
      status: "admitted",
      scope: "all_route_spines",
      evidence: "exact_member_route_wide",
      memberExtentIds: ["member-extent:q45-service"],
    });
    expect(admitStudyMemberTreatmentScope(routeWide, bindingContext())).toEqual({
      status: "rejected",
      reason: "route_wide_member_binding_forbidden",
    });
  });

  test("admits bounded members only with the exact member and producer-component binding", () => {
    expect(admitStudyMemberTreatmentScope(candidate(), bindingContext())).toEqual({
      status: "admitted",
      scope: "lane_overlap_spines",
      evidence: "exact_member_physical_scope_bindings",
      bindings: [binding()],
    });
    expect(admitStudyMemberTreatmentScope(candidate())).toEqual({
      status: "rejected",
      reason: "bounded_member_scope_binding_required",
    });
    expect(
      admitStudyMemberTreatmentScope(candidate(), bindingContext(artifact([binding(), binding()]))),
    ).toEqual({
      status: "rejected",
      reason: "bounded_member_scope_binding_duplicate",
    });
    expect(
      admitStudyMemberTreatmentScope(candidate(), {
        artifact: artifact(),
        candidateSetId: `candidate-set-v4:${"c".repeat(24)}`,
      }),
    ).toEqual({
      status: "rejected",
      reason: "member_scope_binding_candidate_set_mismatch",
    });
  });

  test("rejects unresolved, stop-set, mixed, and heterogeneous member scopes", () => {
    expect(
      admitStudyMemberTreatmentScope(
        candidate({
          memberExtents: [
            memberExtent({
              extent: "unresolved",
              components: [],
              evidence_bindings: [],
              missing_roles: ["bounded_scope_identity"],
              decision_id: null,
            }),
          ],
        }),
      ),
    ).toEqual({ status: "rejected", reason: "member_extent_unresolved" });
    expect(
      admitStudyMemberTreatmentScope(
        candidate({
          memberExtents: [
            memberExtent({
              extent: "stop_set",
              components: [
                {
                  component_kind: "stop",
                  identity_namespace: "canonical_record",
                  identifiers: ["stop:1"],
                  description: "One stop",
                },
              ],
            }),
          ],
        }),
      ),
    ).toEqual({ status: "rejected", reason: "member_extent_stop_set_unsupported" });
    expect(
      admitStudyMemberTreatmentScope(
        candidate({ memberExtents: [memberExtent({ extent: "mixed" })] }),
      ),
    ).toEqual({ status: "rejected", reason: "member_extent_mixed_unsupported" });
    expect(
      admitStudyMemberTreatmentScope(
        candidate({
          memberExtents: [
            memberExtent(),
            memberExtent({
              extent_id: "member-extent:q45-route-name",
              treatment_record_id: "treatment:q45-z-route-name",
              extent: "route_wide",
              components: [
                {
                  component_kind: "route",
                  identity_namespace: "canonical_record",
                  identifiers: ["route:q45"],
                  description: "Whole Q45 service",
                },
              ],
            }),
          ],
        }),
      ),
    ).toEqual({ status: "rejected", reason: "heterogeneous_member_scope_unsupported" });
  });

  test("rejects empty or stale candidate member lineage", () => {
    expect(admitStudyMemberTreatmentScope(candidate({ memberExtents: [] }))).toEqual({
      status: "rejected",
      reason: "member_extent_required",
    });
    expect(
      admitStudyMemberTreatmentScope(
        candidate({
          memberExtents: [memberExtent({ route_record_id: "route:other" })],
        }),
      ),
    ).toEqual({ status: "rejected", reason: "member_extent_lineage_mismatch" });
  });
});

describe("member-grain scope-binding artifact validation", () => {
  test("migrates unchanged same-month v1 geometry to one exact treatment member", () => {
    const legacy = {
      artifactKind: "bp.studio.study_physical_scope_bindings.v1",
      schemaVersion: 1,
      candidateSetId: `candidate-set-v3:${"d".repeat(24)}`,
      analysisMonth: "2026-05",
      sourceRelease: {
        releaseId: "v1-rc26",
        manifestSha256: "d".repeat(64),
        occurrencesSha256: "e".repeat(64),
      },
      inputs: artifact().inputs,
      bindings: [
        {
          candidateId: "study-event-v2:q45",
          routeId: "Q45",
          occurrenceId: "occurrence:q45",
          physicalScopeRecordIds: ["source-literal:q45:188-st--kew-gardens"],
          geometrySourceId: "nyc_dot_bus_lanes",
          geometryFeatureIds: ["geometry:q45:1"],
          selectedGeometryRowsSha256: "6".repeat(64),
          speedSpineSha256: "7".repeat(64),
          segmentBindings: [
            {
              sourceSegmentId: "Q45:2026-05:N:1:100:200",
              spineSegmentId: "q45-n-node-001-node-002",
            },
          ],
        },
      ],
    } satisfies StudyPhysicalScopeBindingsArtifact;
    const candidateSet = {
      candidateSetId: CANDIDATE_SET_ID,
      wikiInput: {
        releaseId: "v1-rc27",
        manifestSha256: "2".repeat(64),
        artifactSha256: "3".repeat(64),
        memberExtent: {
          manifestSha256: "8".repeat(64),
          projectionSha256: PROJECTION_SHA256,
        },
      },
      candidates: [candidate()],
    } as unknown as StudyEventCandidateSetArtifactV4;

    const migrated = migrateStudyPhysicalScopeBindingsArtifactV2({ legacy, candidateSet });
    expect(migrated.candidateSetId).toBe(CANDIDATE_SET_ID);
    expect(migrated.sourceRelease.releaseId).toBe("v1-rc27");
    expect(migrated.bindings).toEqual([binding()]);
  });

  test("does not migrate route-only or ambiguous legacy scope", () => {
    const legacy = {
      artifactKind: "bp.studio.study_physical_scope_bindings.v1",
      schemaVersion: 1,
      candidateSetId: `candidate-set-v3:${"d".repeat(24)}`,
      analysisMonth: "2026-05",
      sourceRelease: {
        releaseId: "v1-rc26",
        manifestSha256: "d".repeat(64),
        occurrencesSha256: "e".repeat(64),
      },
      inputs: artifact().inputs,
      bindings: [
        {
          candidateId: "study-event-v2:q45",
          routeId: "Q45",
          occurrenceId: "occurrence:q45",
          physicalScopeRecordIds: ["route:q45"],
          geometrySourceId: "nyc_dot_bus_lanes",
          geometryFeatureIds: ["geometry:q45:1"],
          selectedGeometryRowsSha256: "6".repeat(64),
          speedSpineSha256: "7".repeat(64),
          segmentBindings: [
            {
              sourceSegmentId: "Q45:2026-05:N:1:100:200",
              spineSegmentId: "q45-n-node-001-node-002",
            },
          ],
        },
      ],
    } satisfies StudyPhysicalScopeBindingsArtifact;
    const candidateSet = {
      candidateSetId: CANDIDATE_SET_ID,
      wikiInput: {
        releaseId: "v1-rc27",
        manifestSha256: "2".repeat(64),
        artifactSha256: "3".repeat(64),
        memberExtent: {
          manifestSha256: "8".repeat(64),
          projectionSha256: PROJECTION_SHA256,
        },
      },
      candidates: [candidate()],
    } as unknown as StudyEventCandidateSetArtifactV4;
    expect(() => migrateStudyPhysicalScopeBindingsArtifactV2({ legacy, candidateSet })).toThrow(
      "must resolve exactly one bounded treatment member",
    );
  });

  test("returns an exact member-grain index for a valid artifact", () => {
    const result = validateStudyPhysicalScopeBindingsArtifactV2({
      artifact: artifact(),
      candidateSetId: CANDIDATE_SET_ID,
      candidates: [candidate()],
    });
    expect([...result.values()]).toEqual([binding()]);
  });

  test("rejects stale candidate-set and duplicate bindings", () => {
    expect(() =>
      validateStudyPhysicalScopeBindingsArtifactV2({
        artifact: artifact(),
        candidateSetId: `candidate-set-v4:${"c".repeat(24)}`,
        candidates: [candidate()],
      }),
    ).toThrow("candidate set mismatch");
    expect(() =>
      validateStudyPhysicalScopeBindingsArtifactV2({
        artifact: artifact([binding(), binding()]),
        candidateSetId: CANDIDATE_SET_ID,
        candidates: [candidate()],
      }),
    ).toThrow("Duplicate or unsorted member scope binding");
    expect(() =>
      validateStudyPhysicalScopeBindingsArtifactV2Raw({
        artifact: artifact(),
        candidateSetId: CANDIDATE_SET_ID,
        candidates: [candidate()],
        sourceRelease: {
          ...artifact().sourceRelease,
          memberExtentManifestSha256: "c".repeat(64),
        },
      }),
    ).toThrow("source release or member-extent lineage mismatch");
  });

  test("rejects every route-only, occurrence-only, family-only, or stale-member key", () => {
    const invalidKeys: readonly [string, Partial<StudyMemberPhysicalScopeBindingV2>][] = [
      ["candidate", { candidateId: "study-event-v2:other" }],
      ["occurrence", { occurrenceId: "occurrence:other" }],
      ["route", { routeId: "Q46" }],
      ["route record", { routeRecordId: "route:other" }],
      ["family-only", { treatmentRecordId: "service_pattern" }],
      ["stale member", { treatmentRecordId: "treatment:q45-retired" }],
    ];
    for (const [, overrides] of invalidKeys) {
      expect(() =>
        validateStudyPhysicalScopeBindingsArtifactV2({
          artifact: artifact([binding(overrides)]),
          candidateSetId: CANDIDATE_SET_ID,
          candidates: [candidate()],
        }),
      ).toThrow("Stale or non-member scope binding");
    }
  });

  test("rejects extent, projection, producer-component, and physical-scope mismatches", () => {
    const mismatches: readonly [string, Partial<StudyMemberPhysicalScopeBindingV2>][] = [
      ["extent", { memberExtentId: "member-extent:stale" }],
      ["projection", { memberExtentProjectionSha256: "c".repeat(64) }],
      ["producer component", { producerComponentIds: ["segment:wrong"] }],
      ["physical scope", { physicalScopeRecordIds: ["segment:wrong"] }],
    ];
    for (const [, overrides] of mismatches) {
      expect(() =>
        validateStudyPhysicalScopeBindingsArtifactV2({
          artifact: artifact([binding(overrides)]),
          candidateSetId: CANDIDATE_SET_ID,
          candidates: [candidate()],
        }),
      ).toThrow("Member scope-binding mismatch");
    }
  });

  test("rejects duplicate candidates and tampered candidate member lineage", () => {
    expect(() =>
      validateStudyPhysicalScopeBindingsArtifactV2({
        artifact: artifact(),
        candidateSetId: CANDIDATE_SET_ID,
        candidates: [candidate(), candidate()],
      }),
    ).toThrow("Duplicate member-grain candidate");
    expect(() =>
      validateStudyPhysicalScopeBindingsArtifactV2({
        artifact: artifact(),
        candidateSetId: CANDIDATE_SET_ID,
        candidates: [
          candidate({
            memberExtents: [memberExtent({ occurrence_id: "occurrence:stale" })],
          }),
        ],
      }),
    ).toThrow("Member extent lineage mismatch");
  });
});
