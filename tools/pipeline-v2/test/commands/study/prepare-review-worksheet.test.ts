import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StudyEventMergeArtifactV2 } from "@bp/domain/studio/study";
import {
  runPrepareStudyEventReviewWorksheet,
  type StudyEventReviewWorksheet,
} from "../../../src/commands/study/prepare-review-worksheet.ts";

const CANDIDATE_SET_ID = "candidate-set-v2:0123456789abcdef01234567";
const FOCUS_OCCURRENCE_ID = "occurrence:c5e9aba290ca2be1be6fb38e";

function fixture(): StudyEventMergeArtifactV2 {
  const manifestSha256 = "a".repeat(64);
  const artifactSha256 = "b".repeat(64);
  const focusCandidate = {
    candidateId: "study-event:111111111111111111111111",
    routeId: "Q7",
    treatmentFamily: "route_redesign" as const,
    implementationDate: "2025-08-31",
    implementationMonth: "2025-08",
    datePrecision: "day" as const,
    conflictState: "none" as const,
    occurrenceId: FOCUS_OCCURRENCE_ID,
    confounderGroupId: "queens_bus_network_redesign_2025",
    treatmentScopeKind: "bundle" as const,
    componentTreatmentFamilies: ["service_pattern"],
    provenance: [
      {
        sourceKind: "mta_wiki" as const,
        sourceId: "mta_queens_bus_network_redesign_service_changes",
        sourceEventId: FOCUS_OCCURRENCE_ID,
        releaseId: "v3-operational-occurrences-1",
        anchorIds: [],
        occurrenceId: FOCUS_OCCURRENCE_ID,
        occurrenceAliases: [],
        manifestSha256,
        artifactSha256,
        occurrenceReviewDecisionId: "decision:q7",
        gtfsRouteId: "Q07",
        analysisRouteId: "Q7",
        routeEvidenceBindings: [
          {
            role: "route_identity" as const,
            record_id: "route_q7-queens",
            source_id: "mta_queens_bus_network_redesign_service_changes",
            evidence_id: "source#q7",
          },
        ],
        treatmentEvidenceBindings: [
          {
            role: "treatment_definition" as const,
            record_id: "treatment_q7-western-reroute-2025",
            source_id: "mta_queens_bus_network_redesign_service_changes",
            evidence_id: "source#q7",
          },
        ],
      },
    ],
  };
  const registryCandidate = {
    candidateId: "study-event:000000000000000000000000",
    routeId: "Q6",
    treatmentFamily: "automated_bus_lane_enforcement" as const,
    implementationDate: "2025-09-15",
    implementationMonth: "2025-09",
    datePrecision: "day" as const,
    conflictState: "none" as const,
    occurrenceId: null,
    confounderGroupId: null,
    treatmentScopeKind: "atomic" as const,
    componentTreatmentFamilies: [],
    provenance: [
      {
        sourceKind: "registry" as const,
        sourceId: "mta_ace_routes",
        sourceEventId: "ace:Q6:2025-09-15",
        releaseId: null,
        anchorIds: [],
        occurrenceId: null,
        occurrenceAliases: [],
        manifestSha256: null,
        artifactSha256: null,
        occurrenceReviewDecisionId: null,
        gtfsRouteId: null,
        analysisRouteId: "Q6",
        routeEvidenceBindings: [],
        treatmentEvidenceBindings: [],
      },
    ],
  };
  return {
    artifactKind: "bp.studio.study_events.v2",
    schemaVersion: 2,
    candidateSetId: CANDIDATE_SET_ID,
    wikiInput: {
      mode: "pinned_occurrence_release",
      releaseId: "v3-operational-occurrences-1",
      manifestSha256,
      artifactSha256,
    },
    summary: {
      registryInputCount: 1,
      wikiInputCount: 1,
      candidateCount: 2,
      approvedCount: 0,
      rejectedByOperatorCount: 0,
      sourceRejectionCount: 0,
      conflictCount: 0,
      exactDeduplicationCount: 0,
    },
    approvalState: "awaiting_approval",
    // Deliberately unsorted: the worksheet must sort decisions deterministically.
    candidates: [focusCandidate, registryCandidate],
    approvedEvents: [],
    rejections: [],
    conflicts: [],
    approval: null,
  };
}

describe("study review worksheet", () => {
  test("strictly decodes and writes a deterministic, complete non-approval worksheet", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-study-review-"));
    try {
      const inputPath = join(root, "study-events-v2.json");
      const outputPath = join(
        root,
        "candidate-set-v2-0123456789abcdef01234567.review-worksheet.json",
      );
      const inputBytes = `${JSON.stringify(fixture(), null, 2)}\n`;
      await writeFile(inputPath, inputBytes);

      const first = await runPrepareStudyEventReviewWorksheet({
        inputPath,
        outputPath,
        focusOccurrenceId: FOCUS_OCCURRENCE_ID,
        focusRouteId: "Q7",
      });
      const firstBytes = await readFile(outputPath, "utf8");
      const second = await runPrepareStudyEventReviewWorksheet({
        inputPath,
        outputPath,
        focusOccurrenceId: FOCUS_OCCURRENCE_ID,
        focusRouteId: "Q7",
      });
      const secondBytes = await readFile(outputPath, "utf8");
      const worksheet = JSON.parse(secondBytes) as StudyEventReviewWorksheet;

      expect(second).toEqual(first);
      expect(secondBytes).toBe(firstBytes);
      expect(worksheet).toMatchObject({
        artifactKind: "worksheet-only:not-an-approval",
        schemaVersion: 0,
        candidateSetId: CANDIDATE_SET_ID,
        generatedFromSha256: createHash("sha256").update(inputBytes).digest("hex"),
        focus: {
          occurrenceId: FOCUS_OCCURRENCE_ID,
          routeId: "Q7",
          status: "REVIEW_REQUIRED",
          candidateIds: ["study-event:111111111111111111111111"],
          treatmentFamily: "route_redesign",
          treatmentScopeKind: "bundle",
          componentTreatmentFamilies: ["service_pattern"],
          confounderGroupId: "queens_bus_network_redesign_2025",
          gtfsRouteIds: ["Q07"],
          occurrenceReviewDecisionIds: ["decision:q7"],
        },
        summary: { candidateCount: 2, reviewRequiredCount: 2, focusCandidateCount: 1 },
      });
      expect(worksheet.decisions.map((decision) => decision.candidateId)).toEqual([
        "study-event:000000000000000000000000",
        "study-event:111111111111111111111111",
      ]);
      expect(
        worksheet.decisions.every(
          (decision) =>
            decision.decision === "REVIEW_REQUIRED" &&
            decision.reviewer === "" &&
            decision.rationale === "" &&
            decision.provenance.length > 0,
        ),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails closed on excess input keys and any focus source rejection", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-study-review-invalid-"));
    const outputPath = join(
      root,
      "candidate-set-v2-0123456789abcdef01234567.review-worksheet.json",
    );
    try {
      const excessPath = join(root, "excess.json");
      await writeFile(excessPath, `${JSON.stringify({ ...fixture(), unexpected: true })}\n`);
      await expect(
        runPrepareStudyEventReviewWorksheet({
          inputPath: excessPath,
          outputPath,
          focusOccurrenceId: FOCUS_OCCURRENCE_ID,
          focusRouteId: "Q7",
        }),
      ).rejects.toThrow("strict-decode");

      const base = fixture();
      const rejected: StudyEventMergeArtifactV2 = {
        ...base,
        summary: { ...base.summary, sourceRejectionCount: 1 },
        rejections: [
          ...base.rejections,
          {
            sourceKind: "mta_wiki",
            sourceId: "mta_queens_bus_network_redesign_service_changes",
            sourceEventId: FOCUS_OCCURRENCE_ID,
            reasons: ["fixture_rejection"],
          },
        ],
      };
      const rejectedPath = join(root, "rejected.json");
      await writeFile(rejectedPath, `${JSON.stringify(rejected)}\n`);
      await expect(
        runPrepareStudyEventReviewWorksheet({
          inputPath: rejectedPath,
          outputPath,
          focusOccurrenceId: FOCUS_OCCURRENCE_ID,
          focusRouteId: "Q7",
        }),
      ).rejects.toThrow("also appears in source rejections");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
