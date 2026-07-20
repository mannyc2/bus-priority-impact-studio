import { describe, expect, test } from "bun:test";
import type { StudyEventCandidateV3 } from "@bp/domain/studio/study";
import { eventRouteExclusions } from "../../src/lib/study-engine/interference.ts";
import { admitStudyTreatmentScope } from "../../src/lib/study-engine/scope.ts";

function registryProvenance(routeId = "M15+"): StudyEventCandidateV3["provenance"][number] {
  return {
    sourceKind: "registry",
    sourceId: "mta_ace_routes",
    sourceEventId: `ace:${routeId}:ACE:2024-06-01`,
    releaseId: null,
    anchorIds: [],
    occurrenceId: null,
    occurrenceAliases: [],
    manifestSha256: null,
    artifactSha256: null,
    occurrenceReviewDecisionId: null,
    wikiRouteRecordId: null,
    gtfsRouteId: null,
    analysisRouteId: routeId,
    routeEvidenceBindings: [],
    treatmentEvidenceBindings: [],
    phaseRecordIds: [],
    phaseRelationRecordIds: [],
    phaseRelationEvidenceBindings: [],
    phaseRelationDisposition: null,
    physicalScopeRecordIds: [],
    physicalScopeRelationRecordIds: [],
    physicalScopeEvidenceBindings: [],
    relationshipBundleSha256: null,
    relationshipEnforcementProofCanonicalSha256: null,
    producerReviewCompatibility: null,
  };
}

function candidate(overrides: Partial<StudyEventCandidateV3> = {}): StudyEventCandidateV3 {
  return {
    candidateId: "study-event-v2:treated",
    routeId: "M15+",
    treatmentFamily: "automated_bus_lane_enforcement",
    implementationDate: "2024-06-01",
    implementationMonth: "2024-06",
    datePrecision: "day",
    conflictState: "none",
    occurrenceId: null,
    confounderGroupId: null,
    treatmentScopeKind: "atomic",
    componentTreatmentFamilies: ["automated_bus_lane_enforcement"],
    provenance: [registryProvenance()],
    ...overrides,
  };
}

describe("study control interference", () => {
  test("excludes every candidate route within the inclusive nine-month window", () => {
    const treated = candidate();
    const exclusions = eventRouteExclusions(treated, [
      treated,
      candidate({ candidateId: "minus-nine", routeId: "B41", implementationMonth: "2023-09" }),
      candidate({ candidateId: "plus-nine", routeId: "BX12+", implementationMonth: "2025-03" }),
      candidate({ candidateId: "minus-ten", routeId: "Q44+", implementationMonth: "2023-08" }),
      candidate({ candidateId: "plus-ten", routeId: "S79+", implementationMonth: "2025-04" }),
      candidate({
        candidateId: "other-family",
        routeId: "M23+",
        treatmentFamily: "route_redesign",
        implementationMonth: "2024-07",
      }),
    ]);

    expect([...exclusions].toSorted()).toEqual(["B41", "BX12+", "M15+", "M23+"]);
  });
});

describe("study treatment-scope admission", () => {
  test("admits route-wide scope only from affirmative MTA ACE registry provenance", () => {
    expect(admitStudyTreatmentScope(candidate())).toEqual({
      status: "admitted",
      scope: "all_route_spines",
      evidence: "mta_ace_route_registry",
    });
  });

  test("does not treat an empty physical-scope array as route-wide evidence", () => {
    expect(
      admitStudyTreatmentScope(
        candidate({
          treatmentFamily: "route_redesign",
          provenance: [
            {
              ...registryProvenance(),
              sourceKind: "mta_wiki",
              sourceId: "queens_bus_network_redesign",
              occurrenceId: "occurrence:redesign",
              releaseId: "v1-rc25",
              manifestSha256: "a".repeat(64),
              artifactSha256: "b".repeat(64),
            },
          ],
        }),
      ),
    ).toEqual({ status: "rejected", reason: "route_wide_evidence_missing" });
  });

  test("rejects bounded scope until an exact geometry-to-spine binding exists", () => {
    expect(
      admitStudyTreatmentScope(
        candidate({
          routeId: "B41",
          treatmentFamily: "bus_lane",
          provenance: [
            {
              ...registryProvenance("B41"),
              sourceKind: "mta_wiki",
              sourceId: "flatbush_ave_bus_priority_mtp_briefing_apr2026",
              occurrenceId: "occurrence:8c987704152b459014217d44",
              releaseId: "v1-rc25",
              manifestSha256: "a".repeat(64),
              artifactSha256: "b".repeat(64),
              physicalScopeRecordIds: ["corridor_flatbush-phase1-livingston-state"],
              physicalScopeRelationRecordIds: ["relation:flatbush-phase1"],
              physicalScopeEvidenceBindings: [
                {
                  role: "physical_scope",
                  record_id: "relation:flatbush-phase1",
                  source_id: "flatbush_ave_bus_priority_mtp_briefing_apr2026",
                  evidence_id: "flatbush#p004_c0002",
                },
              ],
            },
          ],
        }),
      ),
    ).toEqual({ status: "rejected", reason: "bounded_scope_binding_required" });
  });

  test("rejects lane families with missing physical-scope evidence", () => {
    expect(
      admitStudyTreatmentScope(
        candidate({
          treatmentFamily: "bus_lane",
          provenance: [
            {
              ...registryProvenance(),
              sourceId: "nyc_dot_bus_lanes",
            },
          ],
        }),
      ),
    ).toEqual({ status: "rejected", reason: "bounded_scope_evidence_missing" });
  });
});
