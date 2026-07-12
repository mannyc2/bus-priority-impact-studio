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
  StudyEventApprovalArtifact,
  StudyEventCandidate,
  StudyEventConflict,
  StudyEventMergeArtifact,
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
