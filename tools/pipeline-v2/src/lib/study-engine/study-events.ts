import { createHash } from "node:crypto";
import {
  normalizeRouteTreatmentType,
  type RouteTreatmentInterventionEventRow,
} from "@bp/analytics/interventions";
import {
  computeCausalAnchorEligibility,
  type WikiOperationalDateAssertion,
} from "@bp/domain/documents/operational-date";
import type {
  MtaWikiOperationalOccurrenceImportArtifact,
  OperationalOccurrenceEvidenceBinding,
  OperationalOccurrenceRow,
} from "@bp/domain/documents/operational-occurrence";
import type {
  StudyEventApprovalArtifact,
  StudyEventApprovalArtifactV2,
  StudyEventCandidate,
  StudyEventCandidateV2,
  StudyEventConflict,
  StudyEventMergeArtifact,
  StudyEventMergeArtifactV2,
  StudyEventProvenance,
  StudyEventRejection,
  StudyTreatmentFamily,
} from "@bp/domain/studio/study";

const trustedRegistrySources = new Set(["mta_ace_routes", "nyc_dot_bus_lanes"]);

export type PinnedWikiStudyInput = {
  releaseId: string;
  manifestSha256: string;
  artifactSha256: string;
  assertions: readonly WikiOperationalDateAssertion[];
};

export type BuildStudyEventMergeInput = {
  registryEvents: readonly RouteTreatmentInterventionEventRow[];
  wiki: PinnedWikiStudyInput | null;
  withoutWikiAnchors: boolean;
  approval?: StudyEventApprovalArtifact | undefined;
};

type CandidateDraft = Omit<StudyEventCandidate, "candidateId" | "conflictState">;

function isStringKeyedRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (!isStringKeyedRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value)
    .toSorted()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function digest(prefix: string, value: unknown): string {
  return `${prefix}:${createHash("sha256").update(stableJson(value)).digest("hex").slice(0, 24)}`;
}

function routeId(value: string): string {
  return value.trim().toUpperCase().replace(/-SBS$/u, "+");
}

function studyTreatmentFamily(
  value: string,
  treatmentRecordId?: string | undefined,
): StudyTreatmentFamily | null {
  // MTA Wiki's broader fare_collection ontology also contains unrelated
  // tolling/payment records. Admit its bus-study crosswalk only when the
  // reviewed atomic treatment identity itself says off-board/proof-of-payment.
  if (
    value === "fare_collection" &&
    treatmentRecordId !== undefined &&
    /(?:off[-_]?board|proof[-_]?of[-_]?payment)/iu.test(treatmentRecordId)
  ) {
    return "off_board_fare_collection";
  }
  const normalized = normalizeRouteTreatmentType(value);
  switch (normalized) {
    case "all_door_boarding":
    case "automated_bus_lane_enforcement":
    case "bus_lane":
    case "busway":
    case "off_board_fare_collection":
    case "queue_jump":
    case "route_redesign":
    case "select_bus_service":
    case "stop_change":
    case "transit_signal_priority":
      return normalized;
    case "capital_project_milestone":
    case "custom_treatment":
      return null;
  }
}

function isoDay(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value);
  if (!match) return null;
  const day = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day ? null : day;
}

function provenanceKey(value: StudyEventProvenance): string {
  return [
    value.sourceKind,
    value.sourceId,
    value.sourceEventId,
    value.releaseId ?? "",
    ...value.anchorIds,
  ].join("|");
}

function candidateExactKey(value: CandidateDraft): string {
  return [value.routeId, value.treatmentFamily, value.datePrecision, value.implementationDate].join(
    "|",
  );
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted();
}

function rejection(
  sourceKind: StudyEventRejection["sourceKind"],
  sourceId: string,
  sourceEventId: string,
  reasons: readonly string[],
): StudyEventRejection {
  return { sourceKind, sourceId, sourceEventId, reasons: sortedUnique(reasons) };
}

function registryDrafts(rows: readonly RouteTreatmentInterventionEventRow[]): {
  drafts: CandidateDraft[];
  rejections: StudyEventRejection[];
} {
  const drafts: CandidateDraft[] = [];
  const rejections: StudyEventRejection[] = [];
  for (const row of rows) {
    const reasons: string[] = [];
    if (!trustedRegistrySources.has(row.source_id))
      reasons.push("untrusted_or_retired_registry_source");
    if (row.event_status !== "implemented") reasons.push("registry_event_not_implemented");
    const family = studyTreatmentFamily(row.intervention_type);
    if (family === null) reasons.push("unsupported_treatment_family");
    const day = isoDay(row.implementation_date);
    if (day === null) reasons.push("invalid_registry_implementation_date");
    if (day !== null && row.implementation_month !== day.slice(0, 7)) {
      reasons.push("registry_month_date_mismatch");
    }
    const normalizedRouteId = routeId(row.route_id);
    if (normalizedRouteId.length === 0) reasons.push("missing_route_id");
    if (reasons.length > 0 || family === null || day === null) {
      rejections.push(rejection("registry", row.source_id, row.event_id, reasons));
      continue;
    }
    drafts.push({
      routeId: normalizedRouteId,
      treatmentFamily: family,
      implementationDate: day,
      implementationMonth: day.slice(0, 7),
      datePrecision: "day",
      provenance: [
        {
          sourceKind: "registry",
          sourceId: row.source_id,
          sourceEventId: row.event_id,
          releaseId: null,
          anchorIds: [],
        },
      ],
    });
  }
  return { drafts, rejections };
}

function wikiDate(assertion: WikiOperationalDateAssertion): {
  date: string;
  month: string;
  precision: "day" | "month";
} | null {
  if (assertion.normalizedPrecision === "day" && assertion.effectiveDateStart !== null) {
    const day = isoDay(assertion.effectiveDateStart);
    return day === null ? null : { date: day, month: day.slice(0, 7), precision: "day" };
  }
  if (assertion.normalizedPrecision === "month" && assertion.implementationMonth !== null) {
    return /^\d{4}-(?:0[1-9]|1[0-2])$/u.test(assertion.implementationMonth)
      ? {
          date: assertion.implementationMonth,
          month: assertion.implementationMonth,
          precision: "month",
        }
      : null;
  }
  return null;
}

function wikiEligibility(assertion: WikiOperationalDateAssertion): boolean {
  return computeCausalAnchorEligibility({
    producerStudyEligible: assertion.producerStudyEligible,
    trustedOperationalDate: assertion.trustedOperationalDate,
    isRealizedOnset: assertion.isRealizedOnset,
    eventFamily: assertion.familyRaw,
    dateRole: assertion.dateRole,
    lifecyclePhase: assertion.lifecyclePhase,
    normalizedPrecision: assertion.normalizedPrecision,
    routeCount: assertion.routeIds.length,
    treatmentCount: assertion.treatmentRecordIds.length,
    treatmentFamilyCount: assertion.treatmentFamilies.length,
    routeScopeResolution: assertion.routeScopeResolution,
    treatmentScopeResolution: assertion.treatmentScopeResolution,
    scopeResolution: assertion.scopeResolution,
    evidenceComplete: Object.values(assertion.evidenceCoverage).every(Boolean),
    conflictCount: assertion.conflictStates.length,
    exclusionCount: assertion.exclusionReasons.length,
    reviewState: assertion.reviewState,
    truthStatuses: assertion.truthStatuses,
    sourceAuthority: assertion.sourceAuthority,
  });
}

function wikiDrafts(input: PinnedWikiStudyInput): {
  drafts: CandidateDraft[];
  rejections: StudyEventRejection[];
  conflicts: StudyEventConflict[];
} {
  const drafts: CandidateDraft[] = [];
  const rejections: StudyEventRejection[] = [];
  const conflicts: StudyEventConflict[] = [];
  const byChange = new Map<string, WikiOperationalDateAssertion[]>();
  for (const assertion of input.assertions) {
    if (
      assertion.wikiReleaseId !== input.releaseId ||
      assertion.wikiManifestSha256 !== input.manifestSha256 ||
      assertion.wikiAnchorArtifactSha256 !== input.artifactSha256
    ) {
      throw new Error(`Pinned Wiki assertion provenance mismatch for ${assertion.wikiAnchorId}`);
    }
    const rows = byChange.get(assertion.operationalChangeId) ?? [];
    rows.push(assertion);
    byChange.set(assertion.operationalChangeId, rows);
  }

  const conflictingChanges = new Set<string>();
  for (const [changeId, assertions] of byChange) {
    const dates = sortedUnique(
      assertions.flatMap((assertion) => {
        const value = wikiDate(assertion);
        return value === null ? [] : [value.date];
      }),
    );
    if (dates.length <= 1) continue;
    conflictingChanges.add(changeId);
    const anchorIds = sortedUnique(assertions.flatMap((assertion) => assertion.wikiAnchorIds));
    conflicts.push({
      kind: "wiki_date_conflict",
      conflictKey: changeId,
      candidateIds: [],
      sourceEventIds: anchorIds,
      dates,
    });
  }

  for (const assertion of input.assertions) {
    const reasons: string[] = [];
    if (conflictingChanges.has(assertion.operationalChangeId))
      reasons.push("wiki_change_date_conflict");
    if (!assertion.producerStudyEligible) reasons.push("producer_study_ineligible");
    if (!assertion.causalAnchorEligible) reasons.push("importer_causal_ineligible");
    if (!wikiEligibility(assertion)) reasons.push("local_causal_eligibility_failed");
    reasons.push(...assertion.exclusionReasons);
    const family =
      assertion.treatmentFamilies.length === 1
        ? studyTreatmentFamily(
            assertion.treatmentFamilies[0] ?? "",
            assertion.treatmentRecordIds[0],
          )
        : null;
    if (family === null) reasons.push("unsupported_or_ambiguous_treatment_family");
    const date = wikiDate(assertion);
    if (date === null) reasons.push("invalid_wiki_implementation_date");
    const normalizedRouteId = routeId(assertion.routeIds[0] ?? "");
    if (normalizedRouteId.length === 0) reasons.push("missing_route_id");
    if (reasons.length > 0 || family === null || date === null) {
      rejections.push(rejection("mta_wiki", assertion.sourceId, assertion.wikiAnchorId, reasons));
      continue;
    }
    drafts.push({
      routeId: normalizedRouteId,
      treatmentFamily: family,
      implementationDate: date.date,
      implementationMonth: date.month,
      datePrecision: date.precision,
      provenance: [
        {
          sourceKind: "mta_wiki",
          sourceId: assertion.sourceId,
          sourceEventId: assertion.operationalChangeId,
          releaseId: input.releaseId,
          anchorIds: [...assertion.wikiAnchorIds].toSorted(),
        },
      ],
    });
  }
  return { drafts, rejections, conflicts };
}

function mergeExactDrafts(drafts: readonly CandidateDraft[]): {
  candidates: StudyEventCandidate[];
  deduplicationCount: number;
} {
  const groups = new Map<string, CandidateDraft[]>();
  for (const draft of drafts) {
    const key = candidateExactKey(draft);
    const values = groups.get(key) ?? [];
    values.push(draft);
    groups.set(key, values);
  }
  const candidates: StudyEventCandidate[] = [...groups.entries()].map(([key, values]) => {
    const first = values[0];
    if (!first) throw new Error(`Empty study-event candidate group: ${key}`);
    const provenance = [
      ...new Map(
        values.flatMap((value) => value.provenance).map((value) => [provenanceKey(value), value]),
      ).values(),
    ].toSorted((left, right) => provenanceKey(left).localeCompare(provenanceKey(right)));
    const candidate: StudyEventCandidate = {
      ...first,
      candidateId: digest("study-event", key),
      conflictState: "none",
      provenance,
    };
    return candidate;
  });
  return {
    candidates: candidates.toSorted((left, right) =>
      left.candidateId.localeCompare(right.candidateId),
    ),
    deduplicationCount: drafts.length - candidates.length,
  };
}

function markSameMonthConflicts(candidates: readonly StudyEventCandidate[]): {
  candidates: StudyEventCandidate[];
  conflicts: StudyEventConflict[];
} {
  const byMonth = new Map<string, StudyEventCandidate[]>();
  for (const candidate of candidates) {
    const key = [candidate.routeId, candidate.treatmentFamily, candidate.implementationMonth].join(
      "|",
    );
    const values = byMonth.get(key) ?? [];
    values.push(candidate);
    byMonth.set(key, values);
  }
  const conflictingIds = new Set<string>();
  const conflicts: StudyEventConflict[] = [];
  for (const [key, values] of byMonth) {
    if (values.length < 2) continue;
    const sourceKinds = new Set(
      values.flatMap((value) => value.provenance.map((item) => item.sourceKind)),
    );
    if (!sourceKinds.has("registry") || !sourceKinds.has("mta_wiki")) continue;
    for (const value of values) conflictingIds.add(value.candidateId);
    conflicts.push({
      kind: "cross_source_same_month",
      conflictKey: key,
      candidateIds: values.map((value) => value.candidateId).toSorted(),
      sourceEventIds: sortedUnique(
        values.flatMap((value) => value.provenance.map((item) => item.sourceEventId)),
      ),
      dates: sortedUnique(values.map((value) => value.implementationDate)),
    });
  }
  return {
    candidates: candidates.map((candidate) =>
      conflictingIds.has(candidate.candidateId)
        ? { ...candidate, conflictState: "same_month_review_required" }
        : candidate,
    ),
    conflicts: conflicts.toSorted((left, right) =>
      left.conflictKey.localeCompare(right.conflictKey),
    ),
  };
}

function validateApproval(
  candidateSetId: string,
  candidates: readonly StudyEventCandidate[],
  conflicts: readonly StudyEventConflict[],
  approval: StudyEventApprovalArtifact,
): void {
  if (approval.candidateSetId !== candidateSetId) {
    throw new Error(
      `Study-event approval is stale: expected ${candidateSetId}, received ${approval.candidateSetId}`,
    );
  }
  const candidateIds = candidates.map((candidate) => candidate.candidateId).toSorted();
  const decisionIds = approval.decisions.map((decision) => decision.candidateId).toSorted();
  if (new Set(decisionIds).size !== decisionIds.length) {
    throw new Error("Study-event approval contains duplicate candidate decisions");
  }
  if (
    candidateIds.length !== decisionIds.length ||
    candidateIds.some((value, index) => value !== decisionIds[index])
  ) {
    throw new Error("Study-event approval must contain exactly one decision for every candidate");
  }
  if (
    approval.decisions.some((decision) => !decision.reviewer.trim() || !decision.rationale.trim())
  ) {
    throw new Error("Study-event approval decisions require reviewer and rationale");
  }
  const approvedIds = new Set(
    approval.decisions
      .filter((decision) => decision.decision === "approved")
      .map((decision) => decision.candidateId),
  );
  for (const conflict of conflicts) {
    if (
      conflict.kind === "cross_source_same_month" &&
      conflict.candidateIds.filter((candidateId) => approvedIds.has(candidateId)).length > 1
    ) {
      throw new Error(
        `Study-event approval may approve at most one candidate in same-month conflict ${conflict.conflictKey}`,
      );
    }
  }
}

export function buildStudyEventMergeArtifact(
  input: BuildStudyEventMergeInput,
): StudyEventMergeArtifact {
  if (input.wiki === null && !input.withoutWikiAnchors) {
    throw new Error(
      "Pinned Wiki operational anchors are required unless --without-wiki-anchors is explicit",
    );
  }
  if (input.wiki !== null && input.withoutWikiAnchors) {
    throw new Error("Cannot provide pinned Wiki anchors together with --without-wiki-anchors");
  }

  const registry = registryDrafts(input.registryEvents);
  const wiki =
    input.wiki === null ? { drafts: [], rejections: [], conflicts: [] } : wikiDrafts(input.wiki);
  const exact = mergeExactDrafts([...registry.drafts, ...wiki.drafts]);
  const sameMonth = markSameMonthConflicts(exact.candidates);
  const conflicts = [...wiki.conflicts, ...sameMonth.conflicts].toSorted((left, right) =>
    `${left.kind}|${left.conflictKey}`.localeCompare(`${right.kind}|${right.conflictKey}`),
  );
  const rejections = [...registry.rejections, ...wiki.rejections].toSorted((left, right) =>
    `${left.sourceKind}|${left.sourceId}|${left.sourceEventId}`.localeCompare(
      `${right.sourceKind}|${right.sourceId}|${right.sourceEventId}`,
    ),
  );
  const candidateSetId = digest("candidate-set", {
    candidates: sameMonth.candidates,
    conflicts,
    wikiInput:
      input.wiki === null
        ? { mode: "explicit_opt_out" }
        : {
            mode: "pinned_release",
            releaseId: input.wiki.releaseId,
            manifestSha256: input.wiki.manifestSha256,
            artifactSha256: input.wiki.artifactSha256,
          },
  });
  if (input.approval !== undefined) {
    validateApproval(candidateSetId, sameMonth.candidates, conflicts, input.approval);
  }
  const approvedIds = new Set(
    input.approval?.decisions
      .filter((decision) => decision.decision === "approved")
      .map((decision) => decision.candidateId) ?? [],
  );
  const approvedEvents = sameMonth.candidates.filter((candidate) =>
    approvedIds.has(candidate.candidateId),
  );
  const rejectedByOperatorCount =
    input.approval?.decisions.filter((decision) => decision.decision === "rejected").length ?? 0;

  return {
    artifactKind: "bp.studio.study_events.v1",
    schemaVersion: 1,
    candidateSetId,
    wikiInput:
      input.wiki === null
        ? { mode: "explicit_opt_out", releaseId: null, manifestSha256: null, artifactSha256: null }
        : {
            mode: "pinned_release",
            releaseId: input.wiki.releaseId,
            manifestSha256: input.wiki.manifestSha256,
            artifactSha256: input.wiki.artifactSha256,
          },
    summary: {
      registryInputCount: input.registryEvents.length,
      wikiInputCount: input.wiki?.assertions.length ?? 0,
      candidateCount: sameMonth.candidates.length,
      approvedCount: approvedEvents.length,
      rejectedByOperatorCount,
      sourceRejectionCount: rejections.length,
      conflictCount: conflicts.length,
      exactDeduplicationCount: exact.deduplicationCount,
    },
    approvalState: input.approval === undefined ? "awaiting_approval" : "approved",
    candidates: sameMonth.candidates,
    approvedEvents,
    rejections,
    conflicts,
    approval: input.approval ?? null,
  };
}

const QUEENS_ZERO_PADDED_GTFS_TO_ANALYSIS_ROUTE = new Map([
  ["Q01", "Q1"],
  ["Q02", "Q2"],
  ["Q03", "Q3"],
  ["Q04", "Q4"],
  ["Q05", "Q5"],
  ["Q06", "Q6"],
  ["Q07", "Q7"],
  ["Q08", "Q8"],
  ["Q09", "Q9"],
]);

/**
 * Bridge the finite set of zero-padded official Queens GTFS identifiers that
 * the speed spine stores without padding. This is deliberately not a generic
 * leading-zero transform: every accepted alias is explicit and reviewable.
 */
export function occurrenceAnalysisRouteId(gtfsRouteId: string): string {
  const normalized = routeId(gtfsRouteId);
  return QUEENS_ZERO_PADDED_GTFS_TO_ANALYSIS_ROUTE.get(normalized) ?? normalized;
}

export type PinnedWikiOccurrenceStudyInput = {
  releaseId: string;
  manifestSha256: string;
  artifactSha256: string;
  occurrences: readonly OperationalOccurrenceRow[];
};

export type BuildStudyEventMergeV2Input = {
  registryEvents: readonly RouteTreatmentInterventionEventRow[];
  wiki: PinnedWikiOccurrenceStudyInput | null;
  withoutWikiAnchors: boolean;
  availableAnalysisRouteIds: ReadonlySet<string>;
  approval?: StudyEventApprovalArtifactV2 | undefined;
};

type CandidateDraftV2 = Omit<StudyEventCandidateV2, "candidateId" | "conflictState">;

const QUEENS_BUS_NETWORK_REDESIGN_CONFOUNDER_GROUP = "queens_bus_network_redesign_2025" as const;

function canonicalBindingKey(binding: OperationalOccurrenceEvidenceBinding): string {
  return stableJson(binding);
}

function sortedUniqueBindings(
  bindings: readonly OperationalOccurrenceEvidenceBinding[],
): OperationalOccurrenceEvidenceBinding[] {
  return [
    ...new Map(bindings.map((binding) => [canonicalBindingKey(binding), binding])).values(),
  ].toSorted((left, right) => canonicalBindingKey(left).localeCompare(canonicalBindingKey(right)));
}

function registryDraftsV2(rows: readonly RouteTreatmentInterventionEventRow[]): {
  drafts: CandidateDraftV2[];
  rejections: StudyEventRejection[];
} {
  const legacy = registryDrafts(rows);
  return {
    drafts: legacy.drafts.map((draft) => ({
      routeId: draft.routeId,
      treatmentFamily: draft.treatmentFamily,
      implementationDate: draft.implementationDate,
      implementationMonth: draft.implementationMonth,
      datePrecision: draft.datePrecision,
      occurrenceId: null,
      confounderGroupId: null,
      treatmentScopeKind: "atomic",
      componentTreatmentFamilies: [],
      provenance: draft.provenance.map((item) => ({
        ...item,
        occurrenceId: null,
        occurrenceAliases: [],
        manifestSha256: null,
        artifactSha256: null,
        occurrenceReviewDecisionId: null,
        gtfsRouteId: null,
        analysisRouteId: draft.routeId,
        routeEvidenceBindings: [],
        treatmentEvidenceBindings: [],
      })),
    })),
    rejections: legacy.rejections,
  };
}

function occurrenceDate(row: OperationalOccurrenceRow): {
  date: string;
  month: string;
  precision: "day" | "month";
} | null {
  if (row.resolved_onset.precision === "month") {
    return /^\d{4}-(?:0[1-9]|1[0-2])$/u.test(row.resolved_onset.date)
      ? {
          date: row.resolved_onset.date,
          month: row.resolved_onset.date,
          precision: "month",
        }
      : null;
  }
  const day = isoDay(row.resolved_onset.date);
  return day === null ? null : { date: day, month: day.slice(0, 7), precision: "day" };
}

function occurrenceTreatment(row: OperationalOccurrenceRow): {
  family: StudyTreatmentFamily;
  kind: "atomic" | "bundle";
  componentFamilies: string[];
  evidenceBindings: OperationalOccurrenceEvidenceBinding[];
} | null {
  if (row.treatment.kind === "atomic") {
    const family = studyTreatmentFamily(
      row.treatment.member.treatment_family,
      row.treatment.member.treatment_record_id,
    );
    return family === null
      ? null
      : {
          family,
          kind: "atomic",
          componentFamilies: [],
          evidenceBindings: sortedUniqueBindings(row.treatment.member.evidence_bindings),
        };
  }
  if (
    row.treatment.bundle_family === null ||
    !row.treatment.bundle_family_evidence_bindings.some(
      (binding) => binding.role === "bundle_analysis_family",
    )
  ) {
    return null;
  }
  const family = studyTreatmentFamily(row.treatment.bundle_family);
  if (family === null) return null;
  return {
    family,
    kind: "bundle",
    componentFamilies: sortedUnique(row.treatment.members.map((member) => member.treatment_family)),
    evidenceBindings: sortedUniqueBindings([
      ...row.treatment.bundle_family_evidence_bindings,
      ...row.treatment.members.flatMap((member) => member.evidence_bindings),
    ]),
  };
}

function occurrenceConfounderGroupId(
  row: OperationalOccurrenceRow,
  treatment: { family: StudyTreatmentFamily },
): string | null {
  if (treatment.family !== "route_redesign") return null;
  const explicitProgramEvidence =
    row.source_ids.includes("mta_queens_bus_network_redesign_service_changes") ||
    row.evidence_bindings.some(
      (binding) => binding.record_id === "project_queens-bus-network-redesign",
    );
  return explicitProgramEvidence ? QUEENS_BUS_NETWORK_REDESIGN_CONFOUNDER_GROUP : null;
}

function occurrenceDrafts(
  input: PinnedWikiOccurrenceStudyInput,
  availableAnalysisRouteIds: ReadonlySet<string>,
): {
  drafts: CandidateDraftV2[];
  rejections: StudyEventRejection[];
} {
  const drafts: CandidateDraftV2[] = [];
  const rejections: StudyEventRejection[] = [];
  const available = new Set([...availableAnalysisRouteIds].map((value) => routeId(value)));
  for (const row of input.occurrences) {
    const reasons: string[] = [...row.exclusion_reasons];
    if (!row.study_projection_eligible) reasons.push("producer_study_projection_ineligible");
    const date = occurrenceDate(row);
    if (date === null) reasons.push("invalid_occurrence_implementation_date");
    const treatment = occurrenceTreatment(row);
    if (treatment === null) {
      reasons.push(
        row.treatment.kind === "bundle"
          ? "unsupported_bundle_analysis_family"
          : "unsupported_treatment_family",
      );
    }
    if (row.routes.length === 0) reasons.push("missing_route_id");

    const projectableRoutes = row.routes.flatMap((route) => {
      const analysisRouteId = occurrenceAnalysisRouteId(route.gtfs_route_id);
      if (!available.has(analysisRouteId)) {
        reasons.push(`analysis_route_unavailable:${route.gtfs_route_id}`);
        return [];
      }
      return [{ route, analysisRouteId }];
    });
    if (
      !row.study_projection_eligible ||
      date === null ||
      treatment === null ||
      row.routes.length === 0
    ) {
      rejections.push(
        rejection("mta_wiki", row.source_ids[0] ?? "mta-wiki", row.occurrence_id, reasons),
      );
      continue;
    }
    if (reasons.length > 0) {
      rejections.push(
        rejection("mta_wiki", row.source_ids[0] ?? "mta-wiki", row.occurrence_id, reasons),
      );
    }
    for (const { route, analysisRouteId } of projectableRoutes) {
      const provenance = (row.source_ids.length === 0 ? ["mta-wiki"] : row.source_ids).map(
        (sourceId) => ({
          sourceKind: "mta_wiki" as const,
          sourceId,
          sourceEventId: row.occurrence_id,
          releaseId: input.releaseId,
          anchorIds: [...row.provenance.anchor_review_decision_ids],
          occurrenceId: row.occurrence_id,
          occurrenceAliases: [...row.occurrence_aliases],
          manifestSha256: input.manifestSha256,
          artifactSha256: input.artifactSha256,
          occurrenceReviewDecisionId: row.occurrence_review_decision_id,
          gtfsRouteId: route.gtfs_route_id,
          analysisRouteId,
          routeEvidenceBindings: sortedUniqueBindings(route.evidence_bindings),
          treatmentEvidenceBindings: treatment.evidenceBindings,
        }),
      );
      drafts.push({
        routeId: analysisRouteId,
        treatmentFamily: treatment.family,
        implementationDate: date.date,
        implementationMonth: date.month,
        datePrecision: date.precision,
        occurrenceId: row.occurrence_id,
        confounderGroupId: occurrenceConfounderGroupId(row, treatment),
        treatmentScopeKind: treatment.kind,
        componentTreatmentFamilies: treatment.componentFamilies,
        provenance,
      });
    }
  }
  return { drafts, rejections };
}

function provenanceV2Key(value: StudyEventCandidateV2["provenance"][number]): string {
  return stableJson(value);
}

function candidateIdentityV2(value: CandidateDraftV2): string {
  return value.occurrenceId === null
    ? candidateExactKey(value)
    : stableJson({
        occurrenceId: value.occurrenceId,
        routeId: value.routeId,
        treatmentScopeKind: value.treatmentScopeKind,
        treatmentFamily: value.treatmentFamily,
        confounderGroupId: value.confounderGroupId,
        componentTreatmentFamilies: sortedUnique(value.componentTreatmentFamilies),
      });
}

function mergeExactDraftsV2(drafts: readonly CandidateDraftV2[]): {
  candidates: StudyEventCandidateV2[];
  deduplicationCount: number;
} {
  const groups = new Map<string, CandidateDraftV2[]>();
  for (const draft of drafts) {
    const key = candidateIdentityV2(draft);
    const values = groups.get(key) ?? [];
    values.push(draft);
    groups.set(key, values);
  }
  const candidates = [...groups.entries()].map(([key, values]) => {
    const first = values[0];
    if (first === undefined) throw new Error(`Empty v2 study-event candidate group: ${key}`);
    const provenance = [
      ...new Map(
        values.flatMap((value) => value.provenance).map((item) => [provenanceV2Key(item), item]),
      ).values(),
    ].toSorted((left, right) => provenanceV2Key(left).localeCompare(provenanceV2Key(right)));
    return {
      ...first,
      componentTreatmentFamilies: sortedUnique(first.componentTreatmentFamilies),
      candidateId: digest("study-event-v2", key),
      conflictState: "none" as const,
      provenance,
    };
  });
  return {
    candidates: candidates.toSorted((left, right) =>
      left.candidateId.localeCompare(right.candidateId),
    ),
    deduplicationCount: drafts.length - candidates.length,
  };
}

function markSameMonthConflictsV2(candidates: readonly StudyEventCandidateV2[]): {
  candidates: StudyEventCandidateV2[];
  conflicts: StudyEventConflict[];
} {
  const byMonth = new Map<string, StudyEventCandidateV2[]>();
  for (const candidate of candidates) {
    const key = [candidate.routeId, candidate.treatmentFamily, candidate.implementationMonth].join(
      "|",
    );
    const values = byMonth.get(key) ?? [];
    values.push(candidate);
    byMonth.set(key, values);
  }
  const conflictingIds = new Set<string>();
  const conflicts: StudyEventConflict[] = [];
  for (const [key, values] of byMonth) {
    if (values.length < 2) continue;
    const sourceKinds = new Set(
      values.flatMap((value) => value.provenance.map((item) => item.sourceKind)),
    );
    if (!sourceKinds.has("registry") || !sourceKinds.has("mta_wiki")) continue;
    for (const value of values) conflictingIds.add(value.candidateId);
    conflicts.push({
      kind: "cross_source_same_month",
      conflictKey: key,
      candidateIds: values.map((value) => value.candidateId).toSorted(),
      sourceEventIds: sortedUnique(
        values.flatMap((value) => value.provenance.map((item) => item.sourceEventId)),
      ),
      dates: sortedUnique(values.map((value) => value.implementationDate)),
    });
  }
  return {
    candidates: candidates.map((candidate) =>
      conflictingIds.has(candidate.candidateId)
        ? { ...candidate, conflictState: "same_month_review_required" }
        : candidate,
    ),
    conflicts: conflicts.toSorted((left, right) =>
      left.conflictKey.localeCompare(right.conflictKey),
    ),
  };
}

function validateApprovalV2(
  candidateSetId: string,
  candidates: readonly StudyEventCandidateV2[],
  conflicts: readonly StudyEventConflict[],
  approval: StudyEventApprovalArtifactV2,
): void {
  if (
    approval.artifactKind !== "bp.studio.study_event_approvals.v2" ||
    approval.schemaVersion !== 2
  ) {
    throw new Error("Study-event v2 candidate sets require a fresh v2 approval artifact");
  }
  if (approval.candidateSetId !== candidateSetId) {
    throw new Error(
      `Study-event v2 approval is stale: expected ${candidateSetId}, received ${approval.candidateSetId}`,
    );
  }
  const candidateIds = candidates.map((candidate) => candidate.candidateId).toSorted();
  const decisionIds = approval.decisions.map((decision) => decision.candidateId).toSorted();
  if (new Set(decisionIds).size !== decisionIds.length) {
    throw new Error("Study-event v2 approval contains duplicate candidate decisions");
  }
  if (
    candidateIds.length !== decisionIds.length ||
    candidateIds.some((value, index) => value !== decisionIds[index])
  ) {
    throw new Error(
      "Study-event v2 approval must contain exactly one decision for every candidate",
    );
  }
  if (
    approval.decisions.some((decision) => !decision.reviewer.trim() || !decision.rationale.trim())
  ) {
    throw new Error("Study-event v2 approval decisions require reviewer and rationale");
  }
  const approvedIds = new Set(
    approval.decisions
      .filter((decision) => decision.decision === "approved")
      .map((decision) => decision.candidateId),
  );
  for (const conflict of conflicts) {
    if (
      conflict.kind === "cross_source_same_month" &&
      conflict.candidateIds.filter((candidateId) => approvedIds.has(candidateId)).length > 1
    ) {
      throw new Error(
        `Study-event v2 approval may approve at most one candidate in same-month conflict ${conflict.conflictKey}`,
      );
    }
  }
}

export function buildStudyEventMergeArtifactV2(
  input: BuildStudyEventMergeV2Input,
): StudyEventMergeArtifactV2 {
  if (input.wiki === null && !input.withoutWikiAnchors) {
    throw new Error(
      "Pinned Wiki operational occurrences are required unless --without-wiki-anchors is explicit",
    );
  }
  if (input.wiki !== null && input.withoutWikiAnchors) {
    throw new Error("Cannot provide pinned Wiki occurrences together with --without-wiki-anchors");
  }
  const registry = registryDraftsV2(input.registryEvents);
  const wiki =
    input.wiki === null
      ? { drafts: [], rejections: [] }
      : occurrenceDrafts(input.wiki, input.availableAnalysisRouteIds);
  const exact = mergeExactDraftsV2([...registry.drafts, ...wiki.drafts]);
  const sameMonth = markSameMonthConflictsV2(exact.candidates);
  const conflicts = sameMonth.conflicts;
  const rejections = [...registry.rejections, ...wiki.rejections].toSorted((left, right) =>
    `${left.sourceKind}|${left.sourceId}|${left.sourceEventId}`.localeCompare(
      `${right.sourceKind}|${right.sourceId}|${right.sourceEventId}`,
    ),
  );
  const wikiInput =
    input.wiki === null
      ? {
          mode: "explicit_opt_out" as const,
          releaseId: null,
          manifestSha256: null,
          artifactSha256: null,
        }
      : {
          mode: "pinned_occurrence_release" as const,
          releaseId: input.wiki.releaseId,
          manifestSha256: input.wiki.manifestSha256,
          artifactSha256: input.wiki.artifactSha256,
        };
  const candidateSetId = digest("candidate-set-v2", {
    candidates: sameMonth.candidates,
    conflicts,
    wikiInput,
  });
  if (input.approval !== undefined) {
    validateApprovalV2(candidateSetId, sameMonth.candidates, conflicts, input.approval);
  }
  const approvedIds = new Set(
    input.approval?.decisions
      .filter((decision) => decision.decision === "approved")
      .map((decision) => decision.candidateId) ?? [],
  );
  const approvedEvents = sameMonth.candidates.filter((candidate) =>
    approvedIds.has(candidate.candidateId),
  );
  const rejectedByOperatorCount =
    input.approval?.decisions.filter((decision) => decision.decision === "rejected").length ?? 0;
  return {
    artifactKind: "bp.studio.study_events.v2",
    schemaVersion: 2,
    candidateSetId,
    wikiInput,
    summary: {
      registryInputCount: input.registryEvents.length,
      wikiInputCount: input.wiki?.occurrences.length ?? 0,
      candidateCount: sameMonth.candidates.length,
      approvedCount: approvedEvents.length,
      rejectedByOperatorCount,
      sourceRejectionCount: rejections.length,
      conflictCount: conflicts.length,
      exactDeduplicationCount: exact.deduplicationCount,
    },
    approvalState: input.approval === undefined ? "awaiting_approval" : "approved",
    candidates: sameMonth.candidates,
    approvedEvents,
    rejections,
    conflicts,
    approval: input.approval ?? null,
  };
}

export function pinnedOccurrenceStudyInput(
  artifact: MtaWikiOperationalOccurrenceImportArtifact,
): PinnedWikiOccurrenceStudyInput {
  return {
    releaseId: artifact.sourceRelease.releaseId,
    manifestSha256: artifact.sourceRelease.manifestSha256,
    artifactSha256: artifact.sourceRelease.occurrences.sha256,
    occurrences: artifact.occurrences,
  };
}
