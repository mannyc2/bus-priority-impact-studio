import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import {
  MtaWikiOperationalOccurrenceImportArtifactV3Schema,
  MtaWikiOperationalOccurrenceImportArtifactV4Schema,
  MtaWikiRc22LineageAuditSchema,
} from "@bp/domain/documents/operational-occurrence";
import {
  StudyEventMergeArtifactV2Schema,
  StudyEventMergeArtifactV3Schema,
} from "@bp/domain/studio/study";
import {
  type BuildRc22LineageAuditInput,
  buildMtaWikiRc22LineageAudit,
  type Rc22LineageLogicalInputs,
} from "../src/lib/mta-wiki-rc22-lineage.ts";

const repoRoot = join(import.meta.dir, "../../..");

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await Bun.file(path).text());
}

const file = (path: string) => ({
  pointer: path.split("/").at(-1) ?? path,
  path,
  bytes: 1,
  sha256: "a".repeat(64),
});

async function auditInput(): Promise<BuildRc22LineageAuditInput> {
  const rc19Candidates = decodeStrict(StudyEventMergeArtifactV2Schema)(
    await readJson(
      join(
        repoRoot,
        "docs/research/artifacts/candidate-set-v2-24080902f508b55a0033df32.study-events.json",
      ),
    ),
  );
  const rc19Occurrences = decodeStrict(MtaWikiOperationalOccurrenceImportArtifactV3Schema)(
    await readJson(
      join(
        repoRoot,
        "docs/research/artifacts/mta-wiki-v1-rc19.operational-occurrences-import.json",
      ),
    ),
  );
  const rc22Occurrences = decodeStrict(MtaWikiOperationalOccurrenceImportArtifactV4Schema)(
    await readJson(
      join(
        repoRoot,
        "docs/research/artifacts/mta-wiki-v1-rc22.operational-occurrences-import.json",
      ),
    ),
  );
  const rc22Candidates = decodeStrict(StudyEventMergeArtifactV3Schema)(
    await readJson(
      join(
        repoRoot,
        "docs/research/artifacts/candidate-set-v3-9761a5648df08fbdf6c38bb4.study-events.json",
      ),
    ),
  );
  const logicalInputs = (await readJson(
    join(repoRoot, "docs/research/artifacts/mta-wiki-rc19-study-merge-logical-inputs.json"),
  )) as Rc22LineageLogicalInputs;
  const campaignCandidates = rc22Candidates.candidates
    .filter(
      (candidate) =>
        candidate.treatmentFamily === "bus_lane" &&
        candidate.candidateId !== "study-event-v2:06559cef3f03e1672b7dd685" &&
        candidate.candidateId !== "study-event-v2:8759b24539a59fc715b1dff3" &&
        candidate.provenance.every((provenance) => provenance.sourceKind === "registry"),
    )
    .toSorted((left, right) => left.candidateId.localeCompare(right.candidateId));
  const acquisitionCampaign = campaignCandidates.map((candidate, index) => {
    const authoritative = index < 54;
    const exactSegment = index === 0;
    const disposition = authoritative
      ? ("linkage_supported_phase_unresolved" as const)
      : ("completed_search_route_linkage_unresolved" as const);
    const suffix = String(index).padStart(4, "0");
    return {
      candidateId: candidate.candidateId,
      identity: [
        candidate.routeId,
        candidate.treatmentFamily,
        candidate.implementationDate,
        candidate.datePrecision,
      ].join("|"),
      routeId: candidate.routeId,
      implementationDate: candidate.implementationDate,
      disposition,
      authoritativeRouteTreatmentBindingProved: authoritative,
      exactCandidateSegmentBindingProved: exactSegment,
      exactSegmentIds: exactSegment ? ["segment:fixture"] : [],
      candidateDateAndPhaseProved: false as const,
      explicitPhaseIdentityProved: false as const,
      canonicalOperationalOccurrenceIdentityProved: false as const,
      operationalOccurrenceAddedOrUpdated: false as const,
      stillUnresolved: true as const,
      registryProjectionExcluded: true as const,
      studyProjectionEligible: false as const,
      receiptId: `receipt:${suffix}`,
      receiptPath: `receipts/${suffix}.jsonl`,
      receiptRowSha256: "a".repeat(64),
      exclusionPath: `exclusions/${suffix}.jsonl`,
      exclusionRowSha256: "b".repeat(64),
      reconciliationLedgerPath: "reconciliation.jsonl",
      reconciliationLedgerRowSha256: "c".repeat(64),
    };
  });
  const candidateIdsSha256 = createHash("sha256")
    .update(`${acquisitionCampaign.map((row) => row.candidateId).join("\n")}\n`)
    .digest("hex");
  const acquisitionCampaignFile = {
    ...file("acquisition-campaign.jsonl"),
    bytes: 123,
    sha256: "d".repeat(64),
  };
  const acquisitionSummaryFile = {
    ...file("acquisition-summary.json"),
    bytes: 456,
    sha256: "e".repeat(64),
  };
  return {
    trackerBaselineCommit: "5e656c2450792a23e36b4afc9ca29bdda97a1b5e",
    rc19Import: {
      ...file("rc19-import.json"),
      sha256: "47371908c45642aeec58bec3d7f450290e761bafe572afedf993fc11d065022e",
    },
    rc19CandidateSet: {
      ...file("rc19-candidates.json"),
      sha256: "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba",
    },
    rc22Import: file("rc22-import.json"),
    rc22CandidateSet: file("rc22-candidates.json"),
    rc22Manifest: {
      ...file("manifest.json"),
      sha256: rc22Occurrences.sourceRelease.manifestSha256,
    },
    logicalMergeInputs: {
      ...file("logical-inputs.json"),
      sha256: "17530e0bc5a857463249d32a882ae7027a77ea44041babe00c5d761662363104",
    },
    spineManifest: {
      ...file("spine.json"),
      sha256: "aa342bc154340a1da7209225eb0e32e0bb3df0321b84e3ebb432cb2dffe2b7a7",
    },
    busLaneAcquisitionSummary: acquisitionSummaryFile,
    busLaneAcquisitionCampaign: acquisitionCampaignFile,
    latestPointer: file("LATEST"),
    rc19Candidates,
    rc19Occurrences,
    rc22Occurrences,
    rc22Candidates,
    logicalInputs,
    spine: {
      source: { startMonth: "2023-04", endMonth: "2026-03" },
      summary: {
        routeCount: logicalInputs.availableAnalysisRouteIds.length,
        seriesReadyRouteCount: logicalInputs.availableAnalysisRouteIds.length,
        seriesReadyWithGapsRouteCount: 0,
        needsPatternReviewRouteCount: 0,
        failedRouteCount: 0,
      },
      routes: logicalInputs.availableAnalysisRouteIds.map((routeId) => ({
        routeId,
        inCurrentCatalog: true,
        readiness: "series_ready" as const,
      })),
    },
    acquisition: {
      campaign_jsonl_sha256: acquisitionCampaignFile.sha256,
      candidate_ids_sha256: candidateIdsSha256,
      candidate_set_id: "candidate-set-v2:24080902f508b55a0033df32",
      candidate_set_sha256: "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba",
      coverage_assertions: { campaign_candidate_count: 321, all_assertions_passed: true },
      totals: {
        authoritative_route_treatment_binding_proved: 54,
        date_and_phase_proved: 0,
        exact_segment_binding_proved: 1,
        operational_occurrence_added_or_updated: 0,
        still_unresolved: 321,
      },
      exclusive_primary_disposition_counts: {
        completed_search_route_linkage_unresolved: 267,
        linkage_supported_phase_unresolved: 54,
      },
    },
    acquisitionCampaign,
    rc22ManifestValue: {
      manifest_version: 4,
      release_id: "v1-rc22",
      generator_commit: rc22Occurrences.sourceRelease.generatorCommit,
      files: {
        "relationship-integrity/data/quality/relationship-integrity/bus-lane-acquisition/campaign.jsonl":
          {
            bytes: acquisitionCampaignFile.bytes,
            sha256: acquisitionCampaignFile.sha256,
          },
        "relationship-integrity/data/quality/relationship-integrity/bus-lane-acquisition/summary.json":
          {
            bytes: acquisitionSummaryFile.bytes,
            sha256: acquisitionSummaryFile.sha256,
          },
      },
    },
    latestObserved: "v1-rc5",
    analysisMonth: "2026-03",
  };
}

describe("rc22 canonical lineage audit", () => {
  test("is deterministic and classifies every route, version, phase, scope, and authority", async () => {
    const input = await auditInput();
    const first = buildMtaWikiRc22LineageAudit(input);
    const second = buildMtaWikiRc22LineageAudit(input);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(() => decodeStrict(MtaWikiRc22LineageAuditSchema)(first)).not.toThrow();
    expect(first.summary).toMatchObject({
      routeLineageRowCount: 173,
      resolvedCurrentRouteCount: 173,
      historicalRouteVersionMissingCount: 173,
      exactPhysicalScopeOccurrenceCount: 1,
      unresolvedPhysicalLinkCount: 2,
      trackerSegmentLinkCount: 0,
    });
    expect(first.rc19ToRc22).toMatchObject({
      addedCandidateIdentityCount: 0,
      removedCandidateIdentityCount: 0,
      changedCandidateIdentityCount: 0,
      wikiBoundProvenanceRebindingCount: 100,
      approvalRebindingRequired: true,
    });
    expect(first.trackerCandidateFunnel).toMatchObject({
      acceptedOccurrenceCount: 91,
      rejectedOccurrenceCount: 44,
      acceptedRouteProjectionCount: 100,
      rejectedRouteProjectionCount: 73,
      producerEligibleLocallyRejectedOccurrenceCount: 43,
      producerEligibleLocallyRejectedRouteProjectionCount: 72,
      rejectionReasonCounts: {
        producer_study_projection_ineligible: 1,
        unsupported_bundle_analysis_family: 1,
        unsupported_treatment_family: 43,
      },
    });
    expect(first.excludedBusLaneQueue.candidates).toHaveLength(321);
    expect(
      first.routeLineage.filter(
        (row) => row.canonicalLinks.treatedSegment.disposition === "unresolved_physical_link",
      ),
    ).toHaveLength(2);
  });

  test("fails closed when the 321-row campaign no longer reconciles to its summary", async () => {
    const input = await auditInput();
    expect(() =>
      buildMtaWikiRc22LineageAudit({
        ...input,
        acquisitionCampaign: input.acquisitionCampaign.slice(1),
      }),
    ).toThrow("321-row acquisition campaign");
  });

  test("fails closed when the Tracker baseline or analysis month is not pinned", async () => {
    const input = await auditInput();
    expect(() =>
      buildMtaWikiRc22LineageAudit({
        ...input,
        trackerBaselineCommit: "0".repeat(40),
      }),
    ).toThrow("rc22 release identity");
    expect(() =>
      buildMtaWikiRc22LineageAudit({
        ...input,
        analysisMonth: "2026-02",
      }),
    ).toThrow("route/spine denominator");
  });

  test("retains evidence and an explicit unresolved disposition when a Tracker route is absent", async () => {
    const input = await auditInput();
    const routeId = input.rc22Candidates.candidates
      .flatMap((candidate) => candidate.provenance)
      .find((provenance) => provenance.sourceKind === "mta_wiki")?.analysisRouteId;
    if (routeId === undefined) throw new Error("fixture needs an analysis route");
    const logicalInputs = {
      ...input.logicalInputs,
      summary: {
        ...input.logicalInputs.summary,
        availableAnalysisRouteIdCount:
          input.logicalInputs.summary.availableAnalysisRouteIdCount - 1,
      },
      availableAnalysisRouteIds: input.logicalInputs.availableAnalysisRouteIds.filter(
        (value) => value !== routeId,
      ),
    };
    const result = buildMtaWikiRc22LineageAudit({
      ...input,
      logicalInputs,
      spine: {
        ...input.spine,
        summary: {
          ...input.spine.summary,
          routeCount: input.spine.summary.routeCount - 1,
          seriesReadyRouteCount: input.spine.summary.seriesReadyRouteCount - 1,
        },
        routes: input.spine.routes.filter((row) => row.routeId !== routeId),
      },
    });
    const unresolved = result.routeLineage.filter(
      (row) => row.canonicalLinks.trackerRoute.disposition === "unresolved_current_route",
    );
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved.every((row) => row.trackerRouteId === null)).toBe(true);
    expect(
      unresolved.every((row) => row.dimensions.routeIdentity.evidenceBindings.length > 0),
    ).toBe(true);
  });
});
