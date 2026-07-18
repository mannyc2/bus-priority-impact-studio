import { createHash } from "node:crypto";
import type {
  MtaWikiOperationalOccurrenceImportArtifactV3,
  MtaWikiOperationalOccurrenceImportArtifactV4,
  MtaWikiRc22LineageAudit,
  OperationalOccurrenceEvidenceBindingV2,
  OperationalOccurrenceEvidenceLineageCategory,
  OperationalOccurrenceRouteLineageRow,
} from "@bp/domain/documents/operational-occurrence";
import type {
  StudyEventCandidateV2,
  StudyEventCandidateV3,
  StudyEventMergeArtifactV2,
  StudyEventMergeArtifactV3,
} from "@bp/domain/studio/study";
import { occurrenceAnalysisRouteId } from "./study-engine/study-events.ts";

type ImportedFile = MtaWikiRc22LineageAudit["inputs"]["rc19Import"];

export type Rc22LineageSpineRoute = {
  readonly routeId: string;
  readonly inCurrentCatalog: boolean;
  readonly readiness: "series_ready" | "series_ready_with_gaps" | "needs_pattern_review";
};

export type Rc22LineageSpineManifest = {
  readonly source: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly summary: {
    readonly routeCount: number;
    readonly seriesReadyRouteCount: number;
    readonly seriesReadyWithGapsRouteCount: number;
    readonly needsPatternReviewRouteCount: number;
    readonly failedRouteCount: number;
  };
  readonly routes: readonly Rc22LineageSpineRoute[];
};

export type Rc22LineageLogicalInputs = {
  readonly summary: {
    readonly registryRowCount: number;
    readonly availableAnalysisRouteIdCount: number;
  };
  readonly registryRows: readonly unknown[];
  readonly availableAnalysisRouteIds: readonly string[];
};

export type Rc22BusLaneAcquisitionSummary = {
  readonly campaign_jsonl_sha256: string;
  readonly candidate_ids_sha256: string;
  readonly candidate_set_id: string;
  readonly candidate_set_sha256: string;
  readonly coverage_assertions: {
    readonly campaign_candidate_count: number;
    readonly all_assertions_passed: boolean;
  };
  readonly totals: {
    readonly authoritative_route_treatment_binding_proved: number;
    readonly date_and_phase_proved: number;
    readonly exact_segment_binding_proved: number;
    readonly operational_occurrence_added_or_updated: number;
    readonly still_unresolved: number;
  };
  readonly exclusive_primary_disposition_counts: {
    readonly completed_search_route_linkage_unresolved: number;
    readonly linkage_supported_phase_unresolved: number;
  };
};

export type Rc22BusLaneAcquisitionCampaignRow = {
  readonly candidateId: string;
  readonly identity: string;
  readonly routeId: string;
  readonly implementationDate: string;
  readonly disposition:
    | "completed_search_route_linkage_unresolved"
    | "linkage_supported_phase_unresolved";
  readonly authoritativeRouteTreatmentBindingProved: boolean;
  readonly exactCandidateSegmentBindingProved: boolean;
  readonly exactSegmentIds: readonly string[];
  readonly candidateDateAndPhaseProved: false;
  readonly explicitPhaseIdentityProved: false;
  readonly canonicalOperationalOccurrenceIdentityProved: false;
  readonly operationalOccurrenceAddedOrUpdated: false;
  readonly stillUnresolved: true;
  readonly registryProjectionExcluded: true;
  readonly studyProjectionEligible: false;
  readonly receiptId: string;
  readonly receiptPath: string;
  readonly receiptRowSha256: string;
  readonly exclusionPath: string;
  readonly exclusionRowSha256: string;
  readonly reconciliationLedgerPath: string;
  readonly reconciliationLedgerRowSha256: string;
};

export type BuildRc22LineageAuditInput = {
  readonly trackerBaselineCommit: string;
  readonly rc19Import: StudyInputFile;
  readonly rc19CandidateSet: StudyInputFile;
  readonly rc22Import: StudyInputFile;
  readonly rc22CandidateSet: StudyInputFile;
  readonly rc22Manifest: StudyInputFile;
  readonly logicalMergeInputs: StudyInputFile;
  readonly spineManifest: StudyInputFile;
  readonly busLaneAcquisitionSummary: StudyInputFile;
  readonly busLaneAcquisitionCampaign: StudyInputFile;
  readonly latestPointer: StudyInputFile;
  readonly rc19Candidates: StudyEventMergeArtifactV2;
  readonly rc19Occurrences: MtaWikiOperationalOccurrenceImportArtifactV3;
  readonly rc22Occurrences: MtaWikiOperationalOccurrenceImportArtifactV4;
  readonly rc22Candidates: StudyEventMergeArtifactV3;
  readonly logicalInputs: Rc22LineageLogicalInputs;
  readonly spine: Rc22LineageSpineManifest;
  readonly acquisition: Rc22BusLaneAcquisitionSummary;
  readonly acquisitionCampaign: readonly Rc22BusLaneAcquisitionCampaignRow[];
  readonly rc22ManifestValue: {
    readonly manifest_version: number;
    readonly release_id: string;
    readonly generator_commit: string;
    readonly files: Readonly<Record<string, { readonly bytes: number; readonly sha256: string }>>;
  };
  readonly latestObserved: string;
  readonly analysisMonth: string;
};

export type StudyInputFile = ImportedFile;

const categories: readonly OperationalOccurrenceEvidenceLineageCategory[] = [
  "structured_primary",
  "wiki_primary_structured_validated",
  "wiki_only",
  "unresolved_physical_link",
  "historical_version_missing",
];

function categoryCounts(
  rows: readonly OperationalOccurrenceRouteLineageRow[],
  dimension: keyof OperationalOccurrenceRouteLineageRow["dimensions"],
) {
  return Object.fromEntries(
    categories.map((category) => [
      category,
      rows.filter((row) => row.dimensions[dimension].category === category).length,
    ]),
  ) as Record<OperationalOccurrenceEvidenceLineageCategory, number>;
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries(
    [...counts.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted();
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSafeEvidencePath(value: string): boolean {
  if (!value || value.startsWith("/") || value.includes("\\") || value.includes("//")) {
    return false;
  }
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function candidateIdentity(
  candidate: Pick<
    StudyEventCandidateV2 | StudyEventCandidateV3,
    "routeId" | "treatmentFamily" | "implementationDate" | "datePrecision"
  >,
): string {
  return [
    candidate.routeId,
    candidate.treatmentFamily,
    candidate.implementationDate,
    candidate.datePrecision,
  ].join("|");
}

function sourceCombination(candidate: StudyEventCandidateV3): string {
  return sortedUnique(candidate.provenance.map((entry) => entry.sourceKind)).join("+");
}

function monthIndex(month: string): number {
  const match = /^(\d{4})-(\d{2})$/u.exec(month);
  if (match === null) throw new Error(`Invalid analysis month ${month}`);
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function outcomeWindowStatus(candidate: StudyEventCandidateV3, analysisMonth: string): string {
  const implementation = monthIndex(candidate.implementationMonth);
  const floor = monthIndex("2023-04");
  const end = monthIndex(analysisMonth);
  const preCount = Math.max(
    0,
    Math.min(end, implementation - 1) - Math.max(floor, implementation - 6) + 1,
  );
  const postCount = Math.max(
    0,
    Math.min(end, implementation + 6) - Math.max(floor, implementation + 1) + 1,
  );
  if (preCount < 4 || postCount < 4) return "calendar_ineligible";
  if (candidate.datePrecision === "month") return "eligible_month_precision";
  return preCount === 6 && postCount === 6 ? "eligible_day_6x6" : "eligible_day_4plus";
}

function treatmentBindings(
  row: MtaWikiOperationalOccurrenceImportArtifactV4["occurrences"][number],
): OperationalOccurrenceEvidenceBindingV2[] {
  return row.treatment.kind === "atomic"
    ? [...row.treatment.member.evidence_bindings]
    : [
        ...row.treatment.bundle_family_evidence_bindings,
        ...row.treatment.members.flatMap((member) => member.evidence_bindings),
      ];
}

function treatmentFamilies(
  row: MtaWikiOperationalOccurrenceImportArtifactV4["occurrences"][number],
): string[] {
  return row.treatment.kind === "atomic"
    ? [row.treatment.member.treatment_family]
    : sortedUnique([
        ...(row.treatment.bundle_family === null ? [] : [row.treatment.bundle_family]),
        ...row.treatment.members.map((member) => member.treatment_family),
      ]);
}

function assertPinnedInputs(input: BuildRc22LineageAuditInput): void {
  const release = input.rc22Occurrences.sourceRelease;
  const candidates = input.rc22Candidates;
  const rc19Release = input.rc19Occurrences.sourceRelease;
  if (
    input.trackerBaselineCommit !== "5e656c2450792a23e36b4afc9ca29bdda97a1b5e" ||
    input.rc22ManifestValue.manifest_version !== 4 ||
    input.rc22ManifestValue.release_id !== "v1-rc22" ||
    release.releaseId !== input.rc22ManifestValue.release_id ||
    release.generatorCommit !== input.rc22ManifestValue.generator_commit ||
    release.manifestSha256 !== input.rc22Manifest.sha256 ||
    release.producerReviewStatus.compatibility !==
      "known_rc22_review_v1_physical_scope_incompatibility" ||
    release.producerReviewStatus.promotionEligible !== false
  ) {
    throw new Error("rc22 release identity or fingerprinted quarantine status drifted");
  }
  if (
    input.rc19Import.sha256 !==
      "47371908c45642aeec58bec3d7f450290e761bafe572afedf993fc11d065022e" ||
    input.rc19Candidates.wikiInput.mode !== "pinned_occurrence_release" ||
    input.rc19Candidates.wikiInput.releaseId !== rc19Release.releaseId ||
    input.rc19Candidates.wikiInput.manifestSha256 !== rc19Release.manifestSha256 ||
    input.rc19Candidates.wikiInput.artifactSha256 !== rc19Release.occurrences.sha256
  ) {
    throw new Error("rc19 import or candidate provenance is not pinned to the immutable baseline");
  }
  if (
    candidates.wikiInput.releaseId !== release.releaseId ||
    candidates.wikiInput.manifestSha256 !== release.manifestSha256 ||
    candidates.wikiInput.artifactSha256 !== release.occurrences.sha256 ||
    candidates.wikiInput.relationshipBundleSha256 !== release.relationshipIntegrity.bundle.sha256 ||
    candidates.wikiInput.relationshipEnforcementProofCanonicalSha256 !==
      release.relationshipIntegrity.enforcementProof.canonicalSha256 ||
    candidates.approvalState !== "blocked_contract_incompatible" ||
    candidates.approvedEvents.length !== 0 ||
    candidates.approval !== null
  ) {
    throw new Error("rc22 candidate artifact is not exactly bound to the blocked import");
  }
  if (
    input.latestObserved !== "v1-rc5" ||
    input.analysisMonth !== "2026-03" ||
    input.analysisMonth !== input.spine.source.endMonth ||
    input.logicalMergeInputs.sha256 !==
      "17530e0bc5a857463249d32a882ae7027a77ea44041babe00c5d761662363104" ||
    input.spineManifest.sha256 !==
      "aa342bc154340a1da7209225eb0e32e0bb3df0321b84e3ebb432cb2dffe2b7a7" ||
    input.logicalInputs.registryRows.length !== input.logicalInputs.summary.registryRowCount ||
    input.logicalInputs.summary.registryRowCount !==
      input.rc19Candidates.summary.registryInputCount ||
    input.logicalInputs.summary.registryRowCount !==
      input.rc22Candidates.summary.registryInputCount ||
    input.logicalInputs.availableAnalysisRouteIds.length !==
      input.logicalInputs.summary.availableAnalysisRouteIdCount ||
    input.spine.routes.length !== input.logicalInputs.summary.availableAnalysisRouteIdCount
  ) {
    throw new Error("Tracker route/spine denominator or observed LATEST pointer drifted");
  }
  const logicalRouteIds = sortedUnique(input.logicalInputs.availableAnalysisRouteIds);
  const spineRouteIds = input.spine.routes.map((row) => row.routeId);
  const spineReadinessCounts = countBy(input.spine.routes.map((row) => row.readiness));
  if (
    logicalRouteIds.length !== input.logicalInputs.availableAnalysisRouteIds.length ||
    new Set(spineRouteIds).size !== spineRouteIds.length ||
    JSON.stringify(logicalRouteIds) !== JSON.stringify(sortedUnique(spineRouteIds)) ||
    input.spine.source.startMonth !== "2023-04" ||
    input.spine.source.endMonth !== "2026-03" ||
    input.spine.summary.routeCount !== input.spine.routes.length ||
    input.spine.summary.seriesReadyRouteCount !== (spineReadinessCounts["series_ready"] ?? 0) ||
    input.spine.summary.seriesReadyWithGapsRouteCount !==
      (spineReadinessCounts["series_ready_with_gaps"] ?? 0) ||
    input.spine.summary.needsPatternReviewRouteCount !==
      (spineReadinessCounts["needs_pattern_review"] ?? 0) ||
    input.spine.summary.failedRouteCount !== 0
  ) {
    throw new Error("Tracker logical-route and speed-spine identities or counts drifted");
  }
  const acquisition = input.acquisition;
  const campaignIds = input.acquisitionCampaign.map((row) => row.candidateId);
  const uniqueCampaignIds = sortedUnique(campaignIds);
  const campaignIdentities = input.acquisitionCampaign.map((row) => row.identity);
  const campaignReceiptIds = input.acquisitionCampaign.map((row) => row.receiptId);
  const campaignDispositionCounts = countBy(
    input.acquisitionCampaign.map((row) => row.disposition),
  );
  const trackerCandidatesById = new Map(
    candidates.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const campaignFile =
    input.rc22ManifestValue.files[
      "relationship-integrity/data/quality/relationship-integrity/bus-lane-acquisition/campaign.jsonl"
    ];
  const campaignSummaryFile =
    input.rc22ManifestValue.files[
      "relationship-integrity/data/quality/relationship-integrity/bus-lane-acquisition/summary.json"
    ];
  if (
    acquisition.coverage_assertions.all_assertions_passed !== true ||
    acquisition.coverage_assertions.campaign_candidate_count !== 321 ||
    acquisition.totals.still_unresolved !== 321 ||
    acquisition.totals.authoritative_route_treatment_binding_proved !== 54 ||
    acquisition.totals.exact_segment_binding_proved !== 1 ||
    acquisition.totals.date_and_phase_proved !== 0 ||
    acquisition.totals.operational_occurrence_added_or_updated !== 0 ||
    acquisition.exclusive_primary_disposition_counts.completed_search_route_linkage_unresolved !==
      267 ||
    acquisition.exclusive_primary_disposition_counts.linkage_supported_phase_unresolved !== 54
  ) {
    throw new Error("The completed 321-candidate acquisition queue summary drifted");
  }
  if (
    input.acquisitionCampaign.length !== 321 ||
    uniqueCampaignIds.length !== 321 ||
    new Set(campaignIdentities).size !== 321 ||
    new Set(campaignReceiptIds).size !== 321 ||
    campaignIds.some((candidateId, index) => candidateId !== uniqueCampaignIds[index]) ||
    acquisition.candidate_set_id !== input.rc19Candidates.candidateSetId ||
    acquisition.candidate_set_sha256 !== input.rc19CandidateSet.sha256 ||
    sha256Text(`${campaignIds.join("\n")}\n`) !== acquisition.candidate_ids_sha256 ||
    input.busLaneAcquisitionCampaign.sha256 !== acquisition.campaign_jsonl_sha256 ||
    campaignFile?.sha256 !== input.busLaneAcquisitionCampaign.sha256 ||
    campaignFile.bytes !== input.busLaneAcquisitionCampaign.bytes ||
    campaignSummaryFile?.sha256 !== input.busLaneAcquisitionSummary.sha256 ||
    campaignSummaryFile.bytes !== input.busLaneAcquisitionSummary.bytes ||
    (campaignDispositionCounts["completed_search_route_linkage_unresolved"] ?? 0) !== 267 ||
    (campaignDispositionCounts["linkage_supported_phase_unresolved"] ?? 0) !== 54 ||
    input.acquisitionCampaign.filter((row) => row.authoritativeRouteTreatmentBindingProved)
      .length !== 54 ||
    input.acquisitionCampaign.filter((row) => row.exactCandidateSegmentBindingProved).length !==
      1 ||
    input.acquisitionCampaign.some(
      (row) =>
        row.candidateDateAndPhaseProved ||
        row.explicitPhaseIdentityProved ||
        row.canonicalOperationalOccurrenceIdentityProved ||
        row.operationalOccurrenceAddedOrUpdated ||
        !row.stillUnresolved ||
        !row.registryProjectionExcluded ||
        row.studyProjectionEligible,
    ) ||
    input.acquisitionCampaign.some((row) => {
      const candidate = trackerCandidatesById.get(row.candidateId);
      return (
        candidate === undefined ||
        candidateIdentity(candidate) !== row.identity ||
        candidate.routeId !== row.routeId ||
        candidate.implementationDate !== row.implementationDate ||
        candidate.treatmentFamily !== "bus_lane" ||
        candidate.provenance.some((provenance) => provenance.sourceKind === "mta_wiki") ||
        row.exactCandidateSegmentBindingProved !== row.exactSegmentIds.length > 0 ||
        (row.exactCandidateSegmentBindingProved && !row.authoritativeRouteTreatmentBindingProved) ||
        row.disposition !==
          (row.authoritativeRouteTreatmentBindingProved
            ? "linkage_supported_phase_unresolved"
            : "completed_search_route_linkage_unresolved") ||
        JSON.stringify(row.exactSegmentIds) !== JSON.stringify(sortedUnique(row.exactSegmentIds)) ||
        !isSafeEvidencePath(row.receiptPath) ||
        !isSafeEvidencePath(row.exclusionPath) ||
        !isSafeEvidencePath(row.reconciliationLedgerPath)
      );
    })
  ) {
    throw new Error("The 321-row acquisition campaign does not reconcile to its pinned summary");
  }
}

export function buildMtaWikiRc22LineageAudit(
  input: BuildRc22LineageAuditInput,
): MtaWikiRc22LineageAudit {
  assertPinnedInputs(input);
  const spineByRoute = new Map(input.spine.routes.map((row) => [row.routeId, row]));
  const trackerRouteIds = new Set(input.logicalInputs.availableAnalysisRouteIds);
  const candidateIdsByOccurrenceRoute = new Map<string, string[]>();
  for (const candidate of input.rc22Candidates.candidates) {
    for (const provenance of candidate.provenance) {
      if (provenance.sourceKind !== "mta_wiki" || provenance.occurrenceId === null) continue;
      const key = `${provenance.occurrenceId}|${provenance.analysisRouteId}`;
      const ids = candidateIdsByOccurrenceRoute.get(key) ?? [];
      ids.push(candidate.candidateId);
      candidateIdsByOccurrenceRoute.set(key, ids);
    }
  }

  const routeLineage = input.rc22Occurrences.occurrences
    .flatMap((row) =>
      row.routes.map((route): OperationalOccurrenceRouteLineageRow => {
        const trackerRouteId = occurrenceAnalysisRouteId(route.gtfs_route_id);
        const resolvedRoute = trackerRouteIds.has(trackerRouteId);
        const exactPhysicalScope =
          row.physical_scope_record_ids.length > 0 ||
          row.physical_scope_relation_record_ids.length > 0 ||
          row.physical_scope_evidence_bindings.length > 0;
        const routeIdentityBindings = route.evidence_bindings.filter(
          (binding) => binding.role === "route_identity",
        );
        const routeScopeBindings = route.evidence_bindings.filter(
          (binding) => binding.role === "route_scope",
        );
        const familyBindings = treatmentBindings(row);
        return {
          occurrenceId: row.occurrence_id,
          occurrenceReviewDecisionId: row.occurrence_review_decision_id,
          studyProjectionEligible: row.study_projection_eligible,
          routeRecordId: route.route_record_id,
          gtfsRouteId: route.gtfs_route_id,
          trackerRouteId: resolvedRoute ? trackerRouteId : null,
          implementationDate: row.resolved_onset.date,
          datePrecision: row.resolved_onset.precision,
          treatmentKind: row.treatment.kind,
          treatmentFamilies: treatmentFamilies(row),
          candidateIds: sortedUnique(
            candidateIdsByOccurrenceRoute.get(`${row.occurrence_id}|${trackerRouteId}`) ?? [],
          ),
          phaseRecordIds: [...row.phase_record_ids],
          phaseRelationRecordIds: [...row.phase_relation_record_ids],
          physicalScopeRecordIds: [...row.physical_scope_record_ids],
          physicalScopeRelationRecordIds: [...row.physical_scope_relation_record_ids],
          canonicalLinks: {
            trackerRoute: {
              disposition: resolvedRoute ? "resolved_current_route" : "unresolved_current_route",
              routeId: resolvedRoute ? trackerRouteId : null,
            },
            historicalRouteVersion: {
              disposition: "historical_version_missing",
              routeVersionId: null,
            },
            treatedSegment: {
              disposition: exactPhysicalScope
                ? "unresolved_physical_link"
                : "source_scope_not_exact",
              trackerSegmentIds: [],
              sourceRecordIds: [...row.physical_scope_record_ids],
              sourceRelationIds: [...row.physical_scope_relation_record_ids],
            },
          },
          spineReadiness: spineByRoute.get(trackerRouteId)?.readiness ?? null,
          dimensions: {
            routeIdentity: {
              category: resolvedRoute ? "wiki_primary_structured_validated" : "wiki_only",
              authority: "tracker_canonical_analysis_route",
              disposition: resolvedRoute
                ? "exact_normalized_route_id_match"
                : "tracker_route_unresolved",
              evidenceBindings: routeIdentityBindings,
            },
            routeVersionIdentity: {
              category: "historical_version_missing",
              authority: "tracker_route_version_registry",
              disposition: "tracker_has_no_historical_route_version_row",
              evidenceBindings: routeIdentityBindings,
            },
            treatmentOccurrenceDate: {
              category: "wiki_only",
              authority: "mta_wiki_reviewed_operational_occurrence",
              disposition: `reviewed_${row.resolved_onset.precision}_onset`,
              evidenceBindings: [...row.resolved_onset.evidence_bindings],
            },
            treatmentFamily: {
              category: "wiki_only",
              authority: "mta_wiki_reviewed_treatment_graph",
              disposition: row.treatment.kind,
              evidenceBindings: familyBindings,
            },
            routeScope: {
              category: "wiki_only",
              authority: "mta_wiki_reviewed_route_scope",
              disposition: "source_route_scope_only",
              evidenceBindings: routeScopeBindings,
            },
            physicalTreatedSegmentScope: {
              category: exactPhysicalScope ? "unresolved_physical_link" : "wiki_only",
              authority: "mta_wiki_reviewed_physical_scope",
              disposition: exactPhysicalScope
                ? "source_exact_scope_has_no_tracker_segment_crosswalk"
                : "source_does_not_claim_exact_physical_scope",
              evidenceBindings: [...row.physical_scope_evidence_bindings],
            },
            phaseIdentity: {
              category: "wiki_only",
              authority: "mta_wiki_reviewed_phase_graph",
              disposition: row.phase_relation_disposition,
              evidenceBindings: [...row.phase_relation_evidence_bindings],
            },
            outcomeData: {
              category: "structured_primary",
              authority: "tracker_structured_speed_ridership_reliability",
              disposition:
                spineByRoute.get(trackerRouteId) === undefined
                  ? "no_tracker_spine"
                  : `spine_${spineByRoute.get(trackerRouteId)?.readiness ?? "missing"}_no_estimate_run`,
              evidenceBindings: [],
            },
            causalInterpretation: {
              category: "structured_primary",
              authority: "tracker_gated_independent_study",
              disposition: "not_authorized_no_causal_estimate",
              evidenceBindings: [],
            },
          },
        };
      }),
    )
    .toSorted((left, right) =>
      [left.occurrenceId, left.routeRecordId]
        .join("|")
        .localeCompare([right.occurrenceId, right.routeRecordId].join("|")),
    );
  if (
    routeLineage.some(
      (row) =>
        row.trackerRouteId !== null &&
        spineByRoute.get(row.trackerRouteId)?.inCurrentCatalog !== true,
    )
  ) {
    throw new Error("A resolved rc22 route is absent from Tracker's current route catalog");
  }

  const rc19ById = new Map(
    input.rc19Candidates.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const rc22ById = new Map(
    input.rc22Candidates.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const added = [...rc22ById.keys()].filter((id) => !rc19ById.has(id));
  const removed = [...rc19ById.keys()].filter((id) => !rc22ById.has(id));
  const commonIds = [...rc22ById.keys()].filter((id) => rc19ById.has(id));
  const changedIdentity = commonIds.filter((id) => {
    const oldCandidate = rc19ById.get(id);
    const newCandidate = rc22ById.get(id);
    return (
      oldCandidate === undefined ||
      newCandidate === undefined ||
      candidateIdentity(oldCandidate) !== candidateIdentity(newCandidate)
    );
  });
  const wikiBoundRebinding = input.rc22Candidates.candidates.filter((candidate) =>
    candidate.provenance.some((entry) => entry.sourceKind === "mta_wiki"),
  ).length;

  const exactPhysicalOccurrenceIds = new Set(
    routeLineage
      .filter((row) => row.canonicalLinks.treatedSegment.disposition === "unresolved_physical_link")
      .map((row) => row.occurrenceId),
  );
  const acceptedOccurrenceIds = new Set<string>();
  const acceptedOccurrenceRouteIds = new Set<string>();
  for (const candidate of input.rc22Candidates.candidates) {
    for (const provenance of candidate.provenance) {
      if (provenance.sourceKind !== "mta_wiki" || provenance.occurrenceId === null) continue;
      acceptedOccurrenceIds.add(provenance.occurrenceId);
      acceptedOccurrenceRouteIds.add(`${provenance.occurrenceId}|${provenance.analysisRouteId}`);
    }
  }
  const wikiRejections = input.rc22Candidates.rejections.filter(
    (rejection) => rejection.sourceKind === "mta_wiki",
  );
  const rejectedOccurrenceIds = new Set(wikiRejections.map((rejection) => rejection.sourceEventId));
  const rejectedRouteProjectionCount = routeLineage.filter((row) =>
    rejectedOccurrenceIds.has(row.occurrenceId),
  ).length;
  const locallyRejectedRouteRows = routeLineage.filter(
    (row) => row.studyProjectionEligible && rejectedOccurrenceIds.has(row.occurrenceId),
  );
  const locallyRejectedOccurrences = new Map<string, readonly string[]>();
  for (const row of locallyRejectedRouteRows) {
    locallyRejectedOccurrences.set(row.occurrenceId, row.treatmentFamilies);
  }
  if (
    acceptedOccurrenceIds.size + rejectedOccurrenceIds.size !==
      input.rc22Occurrences.summary.sourceOccurrenceCount ||
    acceptedOccurrenceRouteIds.size + rejectedRouteProjectionCount !== routeLineage.length ||
    [...acceptedOccurrenceIds].some((id) => rejectedOccurrenceIds.has(id))
  ) {
    throw new Error("Tracker candidate acceptance and rejection do not partition rc22 projections");
  }
  const dimensions = [
    "routeIdentity",
    "routeVersionIdentity",
    "treatmentOccurrenceDate",
    "treatmentFamily",
    "routeScope",
    "physicalTreatedSegmentScope",
    "phaseIdentity",
    "outcomeData",
    "causalInterpretation",
  ] as const;
  const categoryCountsByDimension = Object.fromEntries(
    dimensions.map((dimension) => [dimension, categoryCounts(routeLineage, dimension)]),
  ) as MtaWikiRc22LineageAudit["categoryCountsByDimension"];

  return {
    artifactKind: "bp.studio.mta_wiki_rc22_lineage_audit.v1",
    schemaVersion: 1,
    authorization: "non_authorizing_migration_audit_only",
    generatedAt: "2026-07-17",
    inputs: {
      trackerBaselineCommit: input.trackerBaselineCommit,
      rc19Import: input.rc19Import,
      rc19CandidateSet: input.rc19CandidateSet,
      rc22Import: input.rc22Import,
      rc22CandidateSet: input.rc22CandidateSet,
      rc22Manifest: input.rc22Manifest,
      logicalMergeInputs: input.logicalMergeInputs,
      spineManifest: input.spineManifest,
      busLaneAcquisitionSummary: input.busLaneAcquisitionSummary,
      busLaneAcquisitionCampaign: input.busLaneAcquisitionCampaign,
      latestPointer: input.latestPointer,
    },
    sourceRelease: {
      releaseId: "v1-rc22",
      manifestSha256: input.rc22Occurrences.sourceRelease.manifestSha256,
      generatorCommit: input.rc22Occurrences.sourceRelease.generatorCommit,
      selectedByExplicitManifestPath: true,
      selectedViaLatest: false,
      latestObserved: "v1-rc5",
      producerReviewCompatibility: "known_rc22_review_v1_physical_scope_incompatibility",
      promotionEligible: false,
    },
    summary: {
      occurrenceCount: input.rc22Occurrences.summary.sourceOccurrenceCount,
      eligibleOccurrenceCount: input.rc22Occurrences.summary.eligibleOccurrenceCount,
      rejectedOccurrenceCount: input.rc22Occurrences.summary.rejectedOccurrenceCount,
      sourceRouteProjectionCount: routeLineage.length,
      eligibleRouteProjectionCount: routeLineage.filter((row) => row.studyProjectionEligible)
        .length,
      rejectedRouteProjectionCount: routeLineage.filter((row) => !row.studyProjectionEligible)
        .length,
      routeLineageRowCount: routeLineage.length,
      resolvedCurrentRouteCount: routeLineage.filter(
        (row) => row.canonicalLinks.trackerRoute.disposition === "resolved_current_route",
      ).length,
      unresolvedCurrentRouteCount: routeLineage.filter(
        (row) => row.canonicalLinks.trackerRoute.disposition === "unresolved_current_route",
      ).length,
      historicalRouteVersionMissingCount: routeLineage.length,
      exactPhysicalScopeOccurrenceCount: exactPhysicalOccurrenceIds.size,
      exactPhysicalScopeRouteProjectionCount: routeLineage.filter(
        (row) => row.canonicalLinks.treatedSegment.disposition === "unresolved_physical_link",
      ).length,
      unresolvedPhysicalLinkCount: routeLineage.filter(
        (row) => row.canonicalLinks.treatedSegment.disposition === "unresolved_physical_link",
      ).length,
      trackerSegmentLinkCount: 0,
      singlePhaseOccurrenceCount: input.rc22Occurrences.summary.singlePhaseOccurrenceCount,
      relatedPhaseOccurrenceCount: input.rc22Occurrences.summary.relatedPhaseOccurrenceCount,
    },
    trackerCandidateFunnel: {
      acceptedOccurrenceCount: acceptedOccurrenceIds.size,
      rejectedOccurrenceCount: rejectedOccurrenceIds.size,
      acceptedRouteProjectionCount: acceptedOccurrenceRouteIds.size,
      rejectedRouteProjectionCount,
      producerEligibleLocallyRejectedOccurrenceCount: locallyRejectedOccurrences.size,
      producerEligibleLocallyRejectedRouteProjectionCount: locallyRejectedRouteRows.length,
      rejectionReasonCounts: countBy(wikiRejections.flatMap((rejection) => rejection.reasons)),
      locallyRejectedTreatmentFamilyOccurrenceCounts: countBy(
        [...locallyRejectedOccurrences.values()].flatMap((families) => families),
      ),
      locallyRejectedTreatmentFamilyRouteProjectionCounts: countBy(
        locallyRejectedRouteRows.flatMap((row) => row.treatmentFamilies),
      ),
      exactCrossSourceDeduplicationCount: input.rc22Candidates.summary.exactDeduplicationCount,
    },
    categoryCountsByDimension,
    rc19ToRc22: {
      rc19OccurrenceCount: input.rc19Occurrences.summary.sourceOccurrenceCount,
      rc22OccurrenceCount: input.rc22Occurrences.summary.sourceOccurrenceCount,
      occurrenceCountDelta:
        input.rc22Occurrences.summary.sourceOccurrenceCount -
        input.rc19Occurrences.summary.sourceOccurrenceCount,
      rc19EligibleOccurrenceCount: input.rc19Occurrences.summary.eligibleOccurrenceCount,
      rc22EligibleOccurrenceCount: input.rc22Occurrences.summary.eligibleOccurrenceCount,
      eligibleOccurrenceCountDelta:
        input.rc22Occurrences.summary.eligibleOccurrenceCount -
        input.rc19Occurrences.summary.eligibleOccurrenceCount,
      rc19RejectedOccurrenceCount: input.rc19Occurrences.summary.rejectedOccurrenceCount,
      rc22RejectedOccurrenceCount: input.rc22Occurrences.summary.rejectedOccurrenceCount,
      rejectedOccurrenceCountDelta:
        input.rc22Occurrences.summary.rejectedOccurrenceCount -
        input.rc19Occurrences.summary.rejectedOccurrenceCount,
      rc19RouteProjectionCount: input.rc19Occurrences.occurrences.reduce(
        (sum, occurrence) => sum + occurrence.routes.length,
        0,
      ),
      rc22RouteProjectionCount: routeLineage.length,
      routeProjectionCountDelta:
        routeLineage.length -
        input.rc19Occurrences.occurrences.reduce(
          (sum, occurrence) => sum + occurrence.routes.length,
          0,
        ),
      rc19EligibleRouteProjectionCount: input.rc19Occurrences.summary.routeProjectionCount,
      rc22EligibleRouteProjectionCount: routeLineage.filter((row) => row.studyProjectionEligible)
        .length,
      eligibleRouteProjectionCountDelta:
        routeLineage.filter((row) => row.studyProjectionEligible).length -
        input.rc19Occurrences.summary.routeProjectionCount,
      rc19RejectedRouteProjectionCount: input.rc19Occurrences.projectionRejections.length,
      rc22RejectedRouteProjectionCount: routeLineage.filter((row) => !row.studyProjectionEligible)
        .length,
      rejectedRouteProjectionCountDelta:
        routeLineage.filter((row) => !row.studyProjectionEligible).length -
        input.rc19Occurrences.projectionRejections.length,
      rc19CandidateSetId: input.rc19Candidates.candidateSetId,
      rc22CandidateSetId: input.rc22Candidates.candidateSetId,
      rc19CandidateCount: input.rc19Candidates.candidates.length,
      rc22CandidateCount: input.rc22Candidates.candidates.length,
      addedCandidateIdentityCount: added.length,
      removedCandidateIdentityCount: removed.length,
      changedCandidateIdentityCount: changedIdentity.length,
      unchangedCandidateIdentityCount: commonIds.length - changedIdentity.length,
      wikiBoundProvenanceRebindingCount: wikiBoundRebinding,
      registryOnlyCandidateCount: input.rc22Candidates.candidates.length - wikiBoundRebinding,
      approvalRebindingRequired: true,
      rc19ApprovalReceiptApplies: false,
      rc19ReviewRecommendationApplies: false,
      datePrecisionCounts: countBy(
        input.rc22Candidates.candidates.map((candidate) => candidate.datePrecision),
      ),
      treatmentFamilyCounts: countBy(
        input.rc22Candidates.candidates.map((candidate) => candidate.treatmentFamily),
      ),
      sourceCombinationCounts: countBy(input.rc22Candidates.candidates.map(sourceCombination)),
      spineReadinessCounts: countBy(
        input.rc22Candidates.candidates.map(
          (candidate) => spineByRoute.get(candidate.routeId)?.readiness ?? "missing_spine",
        ),
      ),
      outcomeWindowCounts: countBy(
        input.rc22Candidates.candidates.map((candidate) =>
          outcomeWindowStatus(candidate, input.analysisMonth),
        ),
      ),
      confounderGroupCounts: countBy(
        input.rc22Candidates.candidates.map((candidate) => candidate.confounderGroupId ?? "none"),
      ),
      occurrenceDatePrecisionCounts: countBy(
        input.rc22Occurrences.occurrences.map((row) => row.resolved_onset.precision),
      ),
      eligibleOccurrenceRouteDatePrecisionCounts: countBy(
        routeLineage.filter((row) => row.studyProjectionEligible).map((row) => row.datePrecision),
      ),
    },
    excludedBusLaneQueue: {
      candidateCount: 321,
      stillUnresolvedCount: 321,
      genericAuthoritativeRouteTreatmentLinkCount: 54,
      exactCandidateSegmentProofCount: 1,
      exactCandidateDateAndPhaseCount: 0,
      newOrUpdatedOccurrenceCount: 0,
      completedSearchRouteLinkageUnresolvedCount: 267,
      linkageSupportedPhaseUnresolvedCount: 54,
      canonicalWikiOccurrenceProjectionCount: 0,
      presentInTrackerCandidateSetCount: 321,
      wikiBoundCandidateCount: 0,
      approvedCandidateCount: 0,
      candidates: input.acquisitionCampaign.map((row) => ({
        ...row,
        exactSegmentIds: [...row.exactSegmentIds],
      })),
    },
    boundaries: {
      candidateApprovalState: "blocked_contract_incompatible",
      approvedCandidateCount: 0,
      studyRunAuthorized: false,
      publicationAuthorized: false,
      publicD1OrR2MutationAuthorized: false,
      latestMutationAuthorized: false,
    },
    promotionRecommendation: {
      decision: "hold",
      operatorReadyToPromoteRc22: false,
      requiredProducerAction:
        "Publish a new pinned release whose declared occurrence-review contract strictly admits every emitted evidence role, then rerun this migration without a fingerprint exception.",
      requiredTrackerActionsBeforeStudyRun: [
        "Complete a fresh candidate-set-v3 human approval only after the producer contract is compatible.",
        "Prevent rejected or unreviewed interventions from entering matched-control eligibility windows.",
        "Require explicit treated-segment claim-tier admission and remove the automatic all-route fallback for bounded treatments.",
      ],
    },
    routeLineage,
  };
}
