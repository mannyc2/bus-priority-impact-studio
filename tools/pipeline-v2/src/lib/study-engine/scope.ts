import type { StudyEventCandidateV3 } from "@bp/domain/studio/study";

export type StudyTreatmentScopeAdmission =
  | {
      readonly status: "admitted";
      readonly scope: "all_route_spines";
      readonly evidence: "mta_ace_route_registry";
    }
  | {
      readonly status: "rejected";
      readonly reason:
        | "bounded_scope_binding_required"
        | "bounded_scope_evidence_missing"
        | "route_wide_evidence_missing";
    };

function hasPhysicalScopeEvidence(candidate: StudyEventCandidateV3): boolean {
  return candidate.provenance.some(
    (provenance) =>
      provenance.physicalScopeRecordIds.length > 0 ||
      provenance.physicalScopeRelationRecordIds.length > 0 ||
      provenance.physicalScopeEvidenceBindings.length > 0,
  );
}

function hasAffirmativeAceRouteEvidence(candidate: StudyEventCandidateV3): boolean {
  return (
    candidate.treatmentFamily === "automated_bus_lane_enforcement" &&
    candidate.provenance.some(
      (provenance) =>
        provenance.sourceKind === "registry" && provenance.sourceId === "mta_ace_routes",
    )
  );
}

/**
 * Fail-closed v1 scope admission for new Plan 074 execution.
 *
 * The trusted ACE registry is route-grain affirmative evidence. Bounded
 * treatments stay ineligible until a separate reviewed artifact binds their
 * exact occurrence scope to geometry, current source segments, and one stable
 * Plan 078 spine per segment. Empty physical-scope arrays never imply
 * route-wide coverage.
 */
export function admitStudyTreatmentScope(
  candidate: StudyEventCandidateV3,
): StudyTreatmentScopeAdmission {
  if (hasAffirmativeAceRouteEvidence(candidate)) {
    return {
      status: "admitted",
      scope: "all_route_spines",
      evidence: "mta_ace_route_registry",
    };
  }
  if (hasPhysicalScopeEvidence(candidate)) {
    return { status: "rejected", reason: "bounded_scope_binding_required" };
  }
  if (candidate.treatmentFamily === "bus_lane" || candidate.treatmentFamily === "busway") {
    return { status: "rejected", reason: "bounded_scope_evidence_missing" };
  }
  return { status: "rejected", reason: "route_wide_evidence_missing" };
}
