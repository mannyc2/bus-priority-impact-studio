import type {
  StudyEventCandidateSetArtifactV4,
  StudyEventCandidateV3,
  StudyEventCandidateV4,
  StudyMemberPhysicalScopeBindingV2,
  StudyPhysicalScopeBinding,
  StudyPhysicalScopeBindingsArtifact,
  StudyPhysicalScopeBindingsArtifactV2,
} from "@bp/domain/studio/study";

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

export type StudyMemberTreatmentScopeAdmission =
  | {
      readonly status: "admitted";
      readonly scope: "all_route_spines";
      readonly evidence: "exact_member_route_wide";
      readonly memberExtentIds: readonly string[];
    }
  | {
      readonly status: "admitted";
      readonly scope: "lane_overlap_spines";
      readonly evidence: "exact_member_physical_scope_bindings";
      readonly bindings: readonly StudyMemberPhysicalScopeBindingV2[];
    }
  | {
      readonly status: "rejected";
      readonly reason:
        | "member_extent_required"
        | "member_extent_lineage_mismatch"
        | "member_extent_unresolved"
        | "member_extent_stop_set_unsupported"
        | "member_extent_mixed_unsupported"
        | "heterogeneous_member_scope_unsupported"
        | "member_scope_binding_candidate_set_mismatch"
        | "bounded_member_scope_binding_required"
        | "bounded_member_scope_binding_duplicate"
        | "bounded_member_scope_binding_mismatch"
        | "route_wide_member_binding_forbidden";
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

function exactArray(values: readonly string[], expected: readonly string[]): boolean {
  return (
    values.length === expected.length && values.every((value, index) => value === expected[index])
  );
}

function memberComponentIds(member: StudyEventCandidateV4["memberExtents"][number]): string[] {
  return [...new Set(member.components.flatMap((component) => component.identifiers))].toSorted();
}

function candidateOccurrenceIds(candidate: StudyEventCandidateV4): string[] {
  return [
    ...new Set(
      [candidate.occurrenceId, ...candidate.provenance.map((row) => row.occurrenceId)].filter(
        (value): value is string => value !== null,
      ),
    ),
  ].toSorted();
}

function candidateRouteRecordIds(candidate: StudyEventCandidateV4): string[] {
  return [
    ...new Set(
      candidate.provenance.flatMap((row) =>
        row.sourceKind === "mta_wiki" && row.wikiRouteRecordId !== null
          ? [row.wikiRouteRecordId]
          : [],
      ),
    ),
  ].toSorted();
}

function memberBindingKey(binding: StudyMemberPhysicalScopeBindingV2): string {
  return [
    binding.candidateId,
    binding.occurrenceId,
    binding.routeId,
    binding.routeRecordId,
    binding.treatmentRecordId,
  ].join("\u0000");
}

function memberExtentKey(input: {
  readonly candidateId: string;
  readonly occurrenceId: string;
  readonly routeId: string;
  readonly routeRecordId: string;
  readonly treatmentRecordId: string;
}): string {
  return [
    input.candidateId,
    input.occurrenceId,
    input.routeId,
    input.routeRecordId,
    input.treatmentRecordId,
  ].join("\u0000");
}

function exactMemberBindingMatches(input: {
  readonly candidate: StudyEventCandidateV4;
  readonly member: StudyEventCandidateV4["memberExtents"][number];
  readonly binding: StudyMemberPhysicalScopeBindingV2;
  readonly memberExtentProjectionSha256: string;
}): boolean {
  const expectedComponentIds = memberComponentIds(input.member);
  return (
    input.member.extent === "bounded_segment" &&
    input.binding.candidateId === input.candidate.candidateId &&
    input.binding.occurrenceId === input.member.occurrence_id &&
    input.binding.routeId === input.candidate.routeId &&
    input.binding.routeRecordId === input.member.route_record_id &&
    input.binding.treatmentRecordId === input.member.treatment_record_id &&
    input.binding.memberExtentId === input.member.extent_id &&
    input.binding.memberExtentKind === "bounded_segment" &&
    input.binding.memberExtentProjectionSha256 === input.memberExtentProjectionSha256 &&
    exactArray(input.binding.producerComponentIds, expectedComponentIds) &&
    exactArray(input.binding.physicalScopeRecordIds, expectedComponentIds)
  );
}

function candidateMemberLineageIsExact(candidate: StudyEventCandidateV4): boolean {
  const occurrenceIds = candidateOccurrenceIds(candidate);
  const routeRecordIds = candidateRouteRecordIds(candidate);
  if (
    candidate.occurrenceId === null ||
    occurrenceIds.length !== 1 ||
    occurrenceIds[0] !== candidate.occurrenceId ||
    routeRecordIds.length !== 1
  ) {
    return false;
  }
  const routeRecordId = routeRecordIds[0];
  const gtfsRouteIds = [
    ...new Set(
      candidate.provenance.flatMap((row) =>
        row.sourceKind === "mta_wiki" &&
        row.wikiRouteRecordId === routeRecordId &&
        row.gtfsRouteId !== null
          ? [row.gtfsRouteId]
          : [],
      ),
    ),
  ];
  if (gtfsRouteIds.length !== 1) return false;
  const memberKeys = new Set<string>();
  const extentIds = new Set<string>();
  let priorTreatmentRecordId = "";
  for (const member of candidate.memberExtents) {
    if (
      member.occurrence_id !== candidate.occurrenceId ||
      member.route_record_id !== routeRecordId ||
      member.gtfs_route_id !== gtfsRouteIds[0] ||
      member.treatment_record_id <= priorTreatmentRecordId ||
      memberKeys.has(member.treatment_record_id) ||
      extentIds.has(member.extent_id)
    ) {
      return false;
    }
    priorTreatmentRecordId = member.treatment_record_id;
    memberKeys.add(member.treatment_record_id);
    extentIds.add(member.extent_id);
  }
  return true;
}

function candidateProducerLineageMatches(
  candidate: StudyEventCandidateV4,
  artifact: StudyPhysicalScopeBindingsArtifactV2,
): boolean {
  const wikiRows = candidate.provenance.filter((row) => row.sourceKind === "mta_wiki");
  return (
    wikiRows.length > 0 &&
    wikiRows.every(
      (row) =>
        row.releaseId === artifact.sourceRelease.releaseId &&
        row.manifestSha256 === artifact.sourceRelease.manifestSha256 &&
        row.artifactSha256 === artifact.sourceRelease.occurrencesSha256,
    )
  );
}

/**
 * Validate a v2 binding artifact at exact candidate × occurrence × route ×
 * treatment-member grain. This checks only scope-binding identity; it grants
 * no calendar, pattern, estimator, approval, or publication authority.
 */
export function validateStudyPhysicalScopeBindingsArtifactV2(input: {
  readonly artifact: StudyPhysicalScopeBindingsArtifactV2;
  readonly candidateSetId: string;
  readonly candidates: readonly StudyEventCandidateV4[];
  readonly sourceRelease: StudyPhysicalScopeBindingsArtifactV2["sourceRelease"];
}): ReadonlyMap<string, StudyMemberPhysicalScopeBindingV2> {
  if (input.artifact.candidateSetId !== input.candidateSetId) {
    throw new Error(
      `Member scope-binding candidate set mismatch: expected ${input.candidateSetId}, received ${input.artifact.candidateSetId}`,
    );
  }
  if (
    input.artifact.sourceRelease.releaseId !== input.sourceRelease.releaseId ||
    input.artifact.sourceRelease.manifestSha256 !== input.sourceRelease.manifestSha256 ||
    input.artifact.sourceRelease.occurrencesSha256 !== input.sourceRelease.occurrencesSha256 ||
    input.artifact.sourceRelease.memberExtentManifestSha256 !==
      input.sourceRelease.memberExtentManifestSha256 ||
    input.artifact.sourceRelease.memberExtentProjectionSha256 !==
      input.sourceRelease.memberExtentProjectionSha256
  ) {
    throw new Error("Member scope-binding source release or member-extent lineage mismatch");
  }
  const candidates = new Map<string, StudyEventCandidateV4>();
  const expectedMembers = new Map<
    string,
    {
      readonly candidate: StudyEventCandidateV4;
      readonly member: StudyEventCandidateV4["memberExtents"][number];
    }
  >();
  for (const candidate of input.candidates) {
    if (candidates.has(candidate.candidateId)) {
      throw new Error(`Duplicate member-grain candidate ${candidate.candidateId}`);
    }
    candidates.set(candidate.candidateId, candidate);
    if (candidate.memberExtents.length === 0) continue;
    if (!candidateMemberLineageIsExact(candidate)) {
      throw new Error(`Member extent lineage mismatch for candidate ${candidate.candidateId}`);
    }
    if (!candidateProducerLineageMatches(candidate, input.artifact)) {
      throw new Error(`Member scope producer lineage mismatch for ${candidate.candidateId}`);
    }
    for (const member of candidate.memberExtents) {
      const key = memberExtentKey({
        candidateId: candidate.candidateId,
        occurrenceId: member.occurrence_id,
        routeId: candidate.routeId,
        routeRecordId: member.route_record_id,
        treatmentRecordId: member.treatment_record_id,
      });
      if (expectedMembers.has(key)) throw new Error(`Duplicate candidate member ${key}`);
      expectedMembers.set(key, { candidate, member });
    }
  }

  const bindings = new Map<string, StudyMemberPhysicalScopeBindingV2>();
  let priorKey = "";
  for (const binding of input.artifact.bindings) {
    const key = memberBindingKey(binding);
    if (key <= priorKey || bindings.has(key)) {
      throw new Error(`Duplicate or unsorted member scope binding ${key}`);
    }
    priorKey = key;
    const segmentKeys = binding.segmentBindings.map(
      (row) => `${row.sourceSegmentId}\u0000${row.spineSegmentId}`,
    );
    if (
      binding.geometryFeatureIds.some(
        (value, index) => index > 0 && value <= (binding.geometryFeatureIds[index - 1] ?? ""),
      ) ||
      segmentKeys.some((value, index) => index > 0 && value <= (segmentKeys[index - 1] ?? ""))
    ) {
      throw new Error(
        `Member scope binding geometry and segments must be sorted and unique: ${key}`,
      );
    }
    const expected = expectedMembers.get(key);
    if (expected === undefined) {
      throw new Error(`Stale or non-member scope binding ${key}`);
    }
    if (
      !exactMemberBindingMatches({
        ...expected,
        binding,
        memberExtentProjectionSha256: input.artifact.sourceRelease.memberExtentProjectionSha256,
      })
    ) {
      throw new Error(`Member scope-binding mismatch for ${key}`);
    }
    bindings.set(key, binding);
  }
  return bindings;
}

/**
 * Rebind unchanged reviewed v1 geometry to the exact member-grain universe.
 * This is intentionally same-month only and carries no route-only authority:
 * each legacy binding must resolve one bounded member whose producer component
 * IDs exactly equal the old reviewed physical-scope IDs.
 */
export function migrateStudyPhysicalScopeBindingsArtifactV2(input: {
  readonly legacy: StudyPhysicalScopeBindingsArtifact;
  readonly candidateSet: StudyEventCandidateSetArtifactV4;
}): StudyPhysicalScopeBindingsArtifactV2 {
  const candidates = new Map(input.candidateSet.candidates.map((row) => [row.candidateId, row]));
  const bindings = input.legacy.bindings
    .map((legacy): StudyMemberPhysicalScopeBindingV2 => {
      const candidate = candidates.get(legacy.candidateId);
      if (
        candidate === undefined ||
        candidate.routeId !== legacy.routeId ||
        candidate.occurrenceId !== legacy.occurrenceId
      ) {
        throw new Error(
          `Legacy scope binding does not match member candidate ${legacy.candidateId}`,
        );
      }
      const legacyScopeIds = [...legacy.physicalScopeRecordIds].toSorted();
      const matches = candidate.memberExtents.filter(
        (member) =>
          member.extent === "bounded_segment" &&
          member.occurrence_id === legacy.occurrenceId &&
          member.gtfs_route_id === legacy.routeId &&
          exactArray(memberComponentIds(member), legacyScopeIds),
      );
      if (matches.length !== 1) {
        throw new Error(
          `Legacy scope binding ${legacy.candidateId} must resolve exactly one bounded treatment member; received ${matches.length}`,
        );
      }
      const member = matches[0];
      if (member === undefined) throw new Error("unreachable legacy member-scope migration");
      return {
        ...legacy,
        physicalScopeRecordIds: legacyScopeIds,
        routeRecordId: member.route_record_id,
        treatmentRecordId: member.treatment_record_id,
        memberExtentId: member.extent_id,
        memberExtentKind: "bounded_segment",
        memberExtentProjectionSha256: input.candidateSet.wikiInput.memberExtent.projectionSha256,
        producerComponentIds: memberComponentIds(member),
      };
    })
    .toSorted((left, right) => memberBindingKey(left).localeCompare(memberBindingKey(right)));
  const artifact: StudyPhysicalScopeBindingsArtifactV2 = {
    artifactKind: "bp.studio.study_physical_scope_bindings.v2",
    schemaVersion: 2,
    candidateSetId: input.candidateSet.candidateSetId,
    analysisMonth: input.legacy.analysisMonth,
    sourceRelease: {
      releaseId: input.candidateSet.wikiInput.releaseId,
      manifestSha256: input.candidateSet.wikiInput.manifestSha256,
      occurrencesSha256: input.candidateSet.wikiInput.artifactSha256,
      memberExtentManifestSha256: input.candidateSet.wikiInput.memberExtent.manifestSha256,
      memberExtentProjectionSha256: input.candidateSet.wikiInput.memberExtent.projectionSha256,
    },
    inputs: input.legacy.inputs,
    bindings,
  };
  validateStudyPhysicalScopeBindingsArtifactV2({
    artifact,
    candidateSetId: input.candidateSet.candidateSetId,
    candidates: input.candidateSet.candidates,
    sourceRelease: artifact.sourceRelease,
  });
  return artifact;
}

/**
 * Fail-closed member-grain scope admission. A producer member extent resolves
 * only the extent-identity gate: bounded members still require an exact v2
 * geometry/spine binding, while route-wide members require no geometry
 * binding. Unsupported or heterogeneous member scopes remain ineligible.
 */
export function admitStudyMemberTreatmentScope(
  candidate: StudyEventCandidateV4,
  bindingContext?:
    | {
        readonly artifact: StudyPhysicalScopeBindingsArtifactV2;
        readonly candidateSetId: string;
      }
    | undefined,
): StudyMemberTreatmentScopeAdmission {
  if (candidate.memberExtents.length === 0) {
    return { status: "rejected", reason: "member_extent_required" };
  }
  if (!candidateMemberLineageIsExact(candidate)) {
    return { status: "rejected", reason: "member_extent_lineage_mismatch" };
  }
  if (candidate.memberExtents.some((member) => member.extent === "unresolved")) {
    return { status: "rejected", reason: "member_extent_unresolved" };
  }
  if (candidate.memberExtents.some((member) => member.extent === "stop_set")) {
    return { status: "rejected", reason: "member_extent_stop_set_unsupported" };
  }
  if (candidate.memberExtents.some((member) => member.extent === "mixed")) {
    return { status: "rejected", reason: "member_extent_mixed_unsupported" };
  }
  const extentKinds = new Set(candidate.memberExtents.map((member) => member.extent));
  if (extentKinds.size !== 1) {
    return { status: "rejected", reason: "heterogeneous_member_scope_unsupported" };
  }
  if (
    bindingContext !== undefined &&
    (bindingContext.artifact.candidateSetId !== bindingContext.candidateSetId ||
      !candidateProducerLineageMatches(candidate, bindingContext.artifact))
  ) {
    return { status: "rejected", reason: "member_scope_binding_candidate_set_mismatch" };
  }
  if (extentKinds.has("route_wide")) {
    if (
      bindingContext?.artifact.bindings.some(
        (binding) => binding.candidateId === candidate.candidateId,
      ) === true
    ) {
      return { status: "rejected", reason: "route_wide_member_binding_forbidden" };
    }
    return {
      status: "admitted",
      scope: "all_route_spines",
      evidence: "exact_member_route_wide",
      memberExtentIds: candidate.memberExtents.map((member) => member.extent_id).toSorted(),
    };
  }
  if (bindingContext === undefined) {
    return { status: "rejected", reason: "bounded_member_scope_binding_required" };
  }
  const candidateBindings = bindingContext.artifact.bindings.filter(
    (binding) => binding.candidateId === candidate.candidateId,
  );
  const byKey = new Map<string, StudyMemberPhysicalScopeBindingV2[]>();
  for (const binding of candidateBindings) {
    const key = memberBindingKey(binding);
    const values = byKey.get(key) ?? [];
    values.push(binding);
    byKey.set(key, values);
  }
  const exactBindings: StudyMemberPhysicalScopeBindingV2[] = [];
  for (const member of candidate.memberExtents) {
    const key = memberExtentKey({
      candidateId: candidate.candidateId,
      occurrenceId: member.occurrence_id,
      routeId: candidate.routeId,
      routeRecordId: member.route_record_id,
      treatmentRecordId: member.treatment_record_id,
    });
    const matches = byKey.get(key) ?? [];
    if (matches.length === 0) {
      return { status: "rejected", reason: "bounded_member_scope_binding_required" };
    }
    if (matches.length > 1) {
      return { status: "rejected", reason: "bounded_member_scope_binding_duplicate" };
    }
    const binding = matches[0];
    if (
      binding === undefined ||
      !exactMemberBindingMatches({
        candidate,
        member,
        binding,
        memberExtentProjectionSha256:
          bindingContext.artifact.sourceRelease.memberExtentProjectionSha256,
      })
    ) {
      return { status: "rejected", reason: "bounded_member_scope_binding_mismatch" };
    }
    exactBindings.push(binding);
  }
  if (exactBindings.length !== candidateBindings.length) {
    return { status: "rejected", reason: "bounded_member_scope_binding_mismatch" };
  }
  return {
    status: "admitted",
    scope: "lane_overlap_spines",
    evidence: "exact_member_physical_scope_bindings",
    bindings: exactBindings.toSorted((left, right) =>
      memberBindingKey(left).localeCompare(memberBindingKey(right)),
    ),
  };
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
