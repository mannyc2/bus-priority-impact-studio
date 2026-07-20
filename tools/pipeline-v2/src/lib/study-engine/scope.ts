import type { StudyEventCandidateV3, StudyPhysicalScopeBinding } from "@bp/domain/studio/study";

export type StudyTreatmentScopeAdmission =
  | {
      readonly status: "admitted";
      readonly scope: "all_route_spines";
      readonly evidence: "mta_ace_route_registry";
    }
  | {
      readonly status: "admitted";
      readonly scope: "lane_overlap_spines";
      readonly evidence: "exact_physical_scope_binding";
      readonly binding: StudyPhysicalScopeBinding;
    }
  | {
      readonly status: "rejected";
      readonly reason:
        | "bounded_scope_binding_required"
        | "bounded_scope_binding_mismatch"
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

function physicalScopeRecordIds(candidate: StudyEventCandidateV3): string[] {
  return [
    ...new Set(candidate.provenance.flatMap((provenance) => provenance.physicalScopeRecordIds)),
  ].toSorted();
}

function exactBindingMatches(
  candidate: StudyEventCandidateV3,
  binding: StudyPhysicalScopeBinding,
): boolean {
  const candidateOccurrenceIds = [
    ...new Set(
      [candidate.occurrenceId, ...candidate.provenance.map((row) => row.occurrenceId)].filter(
        (value): value is string => value !== null,
      ),
    ),
  ];
  return (
    binding.candidateId === candidate.candidateId &&
    binding.routeId === candidate.routeId &&
    candidateOccurrenceIds.length === 1 &&
    candidateOccurrenceIds[0] === binding.occurrenceId &&
    JSON.stringify(physicalScopeRecordIds(candidate)) ===
      JSON.stringify([...binding.physicalScopeRecordIds].toSorted())
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
  binding?: StudyPhysicalScopeBinding | undefined,
): StudyTreatmentScopeAdmission {
  if (hasAffirmativeAceRouteEvidence(candidate)) {
    return {
      status: "admitted",
      scope: "all_route_spines",
      evidence: "mta_ace_route_registry",
    };
  }
  if (hasPhysicalScopeEvidence(candidate)) {
    if (binding === undefined) {
      return { status: "rejected", reason: "bounded_scope_binding_required" };
    }
    return exactBindingMatches(candidate, binding)
      ? {
          status: "admitted",
          scope: "lane_overlap_spines",
          evidence: "exact_physical_scope_binding",
          binding,
        }
      : { status: "rejected", reason: "bounded_scope_binding_mismatch" };
  }
  if (candidate.treatmentFamily === "bus_lane" || candidate.treatmentFamily === "busway") {
    return { status: "rejected", reason: "bounded_scope_evidence_missing" };
  }
  return { status: "rejected", reason: "route_wide_evidence_missing" };
}

/** Select an exact reviewed geometry set and reject absent or ambiguous IDs. */
export function selectExactGeometryFeatures<T extends { readonly segmentId: string }>(
  features: readonly T[],
  expectedIds: ReadonlySet<string>,
): T[] {
  const byId = new Map<string, T>();
  for (const feature of features) {
    if (byId.has(feature.segmentId)) {
      throw new Error(`Ambiguous treatment geometry feature: ${feature.segmentId}`);
    }
    byId.set(feature.segmentId, feature);
  }
  const missing = [...expectedIds].filter((segmentId) => !byId.has(segmentId)).toSorted();
  if (missing.length > 0) {
    throw new Error(`Missing exact treatment geometry feature(s): ${missing.join(", ")}`);
  }
  return [...expectedIds]
    .toSorted()
    .map((segmentId) => byId.get(segmentId))
    .filter((feature): feature is T => feature !== undefined);
}
