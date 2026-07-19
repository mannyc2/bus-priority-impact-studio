import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  StudyEventCandidateV3,
  StudyEventMergeArtifactV2,
  StudyEventMergeArtifactV3,
} from "@bp/domain/studio/study";
import {
  runPrepareStudyEventReviewWorksheet,
  type StudyEventReviewWorksheet,
} from "../../../src/commands/study/prepare-review-worksheet.ts";

const CANDIDATE_SET_ID = "candidate-set-v2:0123456789abcdef01234567";
const CANDIDATE_SET_ID_V3 = "candidate-set-v3:89abcdef0123456789abcdef";
const FOCUS_OCCURRENCE_ID = "occurrence:c5e9aba290ca2be1be6fb38e";
const FOCUS_OCCURRENCE_ID_V3 = "occurrence:b44-sbs-exact-service";

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

function v3Candidate(input: {
  readonly candidateId: string;
  readonly occurrenceId: string;
  readonly routeId: "B44" | "B44+";
  readonly routeRecordId: string;
}): StudyEventCandidateV3 {
  return {
    candidateId: input.candidateId,
    routeId: input.routeId,
    treatmentFamily: "route_redesign",
    implementationDate: "2026-07-18",
    implementationMonth: "2026-07",
    datePrecision: "day",
    conflictState: "none",
    occurrenceId: input.occurrenceId,
    confounderGroupId: null,
    treatmentScopeKind: "atomic",
    componentTreatmentFamilies: [],
    provenance: [
      {
        sourceKind: "mta_wiki",
        sourceId: "current_bus_routes_2026_07_18",
        sourceEventId: input.occurrenceId,
        releaseId: "v1-rc24",
        anchorIds: [],
        occurrenceId: input.occurrenceId,
        occurrenceAliases: [],
        manifestSha256: "a".repeat(64),
        artifactSha256: "b".repeat(64),
        occurrenceReviewDecisionId: `decision:${input.routeId}`,
        wikiRouteRecordId: input.routeRecordId,
        gtfsRouteId: input.routeId,
        analysisRouteId: input.routeId,
        routeEvidenceBindings: [
          {
            role: "route_identity",
            record_id: input.routeRecordId,
            source_id: "current_bus_routes_2026_07_18",
            evidence_id: `current_bus_routes_2026_07_18#${input.routeId}`,
          },
        ],
        treatmentEvidenceBindings: [
          {
            role: "treatment_definition",
            record_id: `treatment:${input.routeId}`,
            source_id: "current_bus_routes_2026_07_18",
            evidence_id: `current_bus_routes_2026_07_18#${input.routeId}`,
          },
        ],
        phaseRecordIds: ["phase:2026-07-18"],
        phaseRelationRecordIds: ["relation:phase:2026-07-18"],
        phaseRelationEvidenceBindings: [
          {
            role: "phase_relation",
            record_id: "relation:phase:2026-07-18",
            source_id: "current_bus_routes_2026_07_18",
            evidence_id: `current_bus_routes_2026_07_18#${input.routeId}`,
          },
        ],
        phaseRelationDisposition: null,
        physicalScopeRecordIds: [],
        physicalScopeRelationRecordIds: [],
        physicalScopeEvidenceBindings: [],
        relationshipBundleSha256: "c".repeat(64),
        relationshipEnforcementProofCanonicalSha256: "d".repeat(64),
        producerReviewCompatibility: "compatible",
      },
    ],
  };
}

function fixtureV3(): StudyEventMergeArtifactV3 {
  const candidates = [
    v3Candidate({
      candidateId: "study-event-v3:000000000000000000000000",
      occurrenceId: "occurrence:b44-local-exact-service",
      routeId: "B44",
      routeRecordId: "route_b44",
    }),
    v3Candidate({
      candidateId: "study-event-v3:111111111111111111111111",
      occurrenceId: FOCUS_OCCURRENCE_ID_V3,
      routeId: "B44+",
      routeRecordId: "route_b44-plus",
    }),
  ];
  return {
    artifactKind: "bp.studio.study_events.v3",
    schemaVersion: 3,
    candidateSetId: CANDIDATE_SET_ID_V3,
    wikiInput: {
      mode: "pinned_occurrence_release_v4",
      releaseId: "v1-rc24",
      manifestSha256: "a".repeat(64),
      artifactSha256: "b".repeat(64),
      relationshipBundleSha256: "c".repeat(64),
      relationshipEnforcementProofCanonicalSha256: "d".repeat(64),
      producerReviewCompatibility: "compatible",
    },
    summary: {
      registryInputCount: 0,
      wikiInputCount: 2,
      candidateCount: 2,
      approvedCount: 0,
      rejectedByOperatorCount: 0,
      sourceRejectionCount: 0,
      conflictCount: 0,
      exactDeduplicationCount: 0,
    },
    approvalState: "awaiting_approval",
    candidates,
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
        reviewState: "awaiting_review",
        approval: null,
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
          wikiRouteRecordIds: [],
          pinnedLineage: {
            releaseId: "v3-operational-occurrences-1",
            manifestSha256: "a".repeat(64),
            occurrenceArtifactSha256: "b".repeat(64),
            relationshipBundleSha256: null,
            relationshipEnforcementProofCanonicalSha256: null,
          },
        },
        summary: {
          candidateCount: 2,
          reviewRequiredCount: 2,
          focusCandidateCount: 1,
          operatorDecisionCount: 0,
        },
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

  test("strictly preserves v3 exact-route and manifest/payload/graph lineage without a decision", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-study-review-v3-"));
    try {
      const inputPath = join(root, "study-events-v3.json");
      const outputPath = join(
        root,
        "candidate-set-v3-89abcdef0123456789abcdef.review-worksheet.json",
      );
      const inputBytes = `${JSON.stringify(fixtureV3(), null, 2)}\n`;
      await writeFile(inputPath, inputBytes);

      const first = await runPrepareStudyEventReviewWorksheet({
        inputPath,
        outputPath,
        focusOccurrenceId: FOCUS_OCCURRENCE_ID_V3,
        focusRouteId: "B44+",
      });
      const firstBytes = await readFile(outputPath, "utf8");
      const second = await runPrepareStudyEventReviewWorksheet({
        inputPath,
        outputPath,
        focusOccurrenceId: FOCUS_OCCURRENCE_ID_V3,
        focusRouteId: "B44+",
      });
      const secondBytes = await readFile(outputPath, "utf8");
      const worksheet = JSON.parse(secondBytes) as StudyEventReviewWorksheet;

      expect(second).toEqual(first);
      expect(secondBytes).toBe(firstBytes);
      expect(worksheet).toMatchObject({
        reviewState: "awaiting_review",
        approval: null,
        candidateSetId: CANDIDATE_SET_ID_V3,
        generatedFromSha256: createHash("sha256").update(inputBytes).digest("hex"),
        sourceArtifact: {
          artifactKind: "bp.studio.study_events.v3",
          schemaVersion: 3,
          approvalState: "awaiting_approval",
          wikiInput: {
            releaseId: "v1-rc24",
            manifestSha256: "a".repeat(64),
            artifactSha256: "b".repeat(64),
            relationshipBundleSha256: "c".repeat(64),
            relationshipEnforcementProofCanonicalSha256: "d".repeat(64),
            producerReviewCompatibility: "compatible",
          },
        },
        focus: {
          occurrenceId: FOCUS_OCCURRENCE_ID_V3,
          routeId: "B44+",
          candidateIds: ["study-event-v3:111111111111111111111111"],
          gtfsRouteIds: ["B44+"],
          wikiRouteRecordIds: ["route_b44-plus"],
          pinnedLineage: {
            releaseId: "v1-rc24",
            manifestSha256: "a".repeat(64),
            occurrenceArtifactSha256: "b".repeat(64),
            relationshipBundleSha256: "c".repeat(64),
            relationshipEnforcementProofCanonicalSha256: "d".repeat(64),
          },
        },
        summary: { operatorDecisionCount: 0 },
      });
      expect(worksheet.decisions).toHaveLength(2);
      expect(worksheet.decisions[1]).toMatchObject({
        candidateId: "study-event-v3:111111111111111111111111",
        routeId: "B44+",
        occurrenceId: FOCUS_OCCURRENCE_ID_V3,
        decision: "REVIEW_REQUIRED",
        reviewer: "",
        rationale: "",
        provenance: [
          {
            wikiRouteRecordId: "route_b44-plus",
            gtfsRouteId: "B44+",
            analysisRouteId: "B44+",
            manifestSha256: "a".repeat(64),
            artifactSha256: "b".repeat(64),
            relationshipBundleSha256: "c".repeat(64),
            relationshipEnforcementProofCanonicalSha256: "d".repeat(64),
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails closed on v3 excess keys, unknown versions, and exact-route collapse", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-study-review-v3-invalid-"));
    const outputPath = join(
      root,
      "candidate-set-v3-89abcdef0123456789abcdef.review-worksheet.json",
    );
    const run = (inputPath: string, focusRouteId = "B44+") =>
      runPrepareStudyEventReviewWorksheet({
        inputPath,
        outputPath,
        focusOccurrenceId: FOCUS_OCCURRENCE_ID_V3,
        focusRouteId,
      });
    try {
      const excessPath = join(root, "excess-v3.json");
      await writeFile(excessPath, `${JSON.stringify({ ...fixtureV3(), unexpected: true })}\n`);
      await expect(run(excessPath)).rejects.toThrow("strict-decode study-event v3");

      const unknownPath = join(root, "unknown-version.json");
      await writeFile(unknownPath, `${JSON.stringify({ ...fixtureV3(), schemaVersion: 4 })}\n`);
      await expect(run(unknownPath)).rejects.toThrow(
        "Unsupported study-event artifact kind/version",
      );

      const collapsed = fixtureV3();
      const focusCandidate = collapsed.candidates[1];
      if (focusCandidate === undefined) throw new Error("missing v3 focus fixture candidate");
      const focusProvenance = focusCandidate.provenance[0];
      if (focusProvenance === undefined) throw new Error("missing v3 focus fixture provenance");
      const collapsedPath = join(root, "collapsed-route.json");
      await writeFile(
        collapsedPath,
        `${JSON.stringify({
          ...collapsed,
          candidates: [
            collapsed.candidates[0],
            {
              ...focusCandidate,
              provenance: [{ ...focusProvenance, analysisRouteId: "B44" }],
            },
          ],
        })}\n`,
      );
      await expect(run(collapsedPath)).rejects.toThrow(
        "Focus provenance is incomplete or does not match the pinned release",
      );

      const mismatchedLineagePath = join(root, "mismatched-graph-lineage.json");
      await writeFile(
        mismatchedLineagePath,
        `${JSON.stringify({
          ...collapsed,
          candidates: [
            collapsed.candidates[0],
            {
              ...focusCandidate,
              provenance: [
                {
                  ...focusProvenance,
                  relationshipBundleSha256: "e".repeat(64),
                },
              ],
            },
          ],
        })}\n`,
      );
      await expect(run(mismatchedLineagePath)).rejects.toThrow(
        "Focus v3 provenance is missing exact route, payload, or graph-integrity lineage",
      );

      const approvedPath = join(root, "already-approved-v3.json");
      await writeFile(
        approvedPath,
        `${JSON.stringify({
          ...collapsed,
          summary: { ...collapsed.summary, approvedCount: collapsed.candidates.length },
          approvalState: "approved",
          approvedEvents: collapsed.candidates,
          approval: {
            artifactKind: "bp.studio.study_event_approvals.v3",
            schemaVersion: 3,
            candidateSetId: collapsed.candidateSetId,
            decisions: collapsed.candidates.map((candidate) => ({
              candidateId: candidate.candidateId,
              decision: "approved",
              reviewer: "fixture-reviewer",
              rationale: "fixture only",
            })),
          },
        })}\n`,
      );
      await expect(run(approvedPath)).rejects.toThrow(
        "must be awaiting approval with no approval or operator decisions",
      );

      const validPath = join(root, "valid-v3.json");
      await writeFile(validPath, `${JSON.stringify(fixtureV3())}\n`);
      await expect(run(validPath, "B44")).rejects.toThrow(
        `Expected focus occurrence ${FOCUS_OCCURRENCE_ID_V3} on B44 exactly once; received 0`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
