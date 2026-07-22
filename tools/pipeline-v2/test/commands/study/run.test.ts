import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalPipelineDb } from "@bp/db/local";
import type {
  StudyArtifact,
  StudyEventCandidateV3,
  StudyPhysicalScopeBindingsArtifact,
} from "@bp/domain/studio/study";
import { runSegmentStudies, writeStudyArtifactSet } from "../../../src/commands/study/run.ts";

const roots: string[] = [];

function study(input: { eventKey: string; routeId: string; effectMph: number }): StudyArtifact {
  const routeSlug = input.routeId.toLowerCase();
  const confidenceInterval = {
    lowerMph: input.effectMph - 0.2,
    upperMph: input.effectMph + 0.2,
    iterationCount: 1_000,
    seed: 42,
  };
  const variant = {
    effectMph: input.effectMph,
    effectPercent: input.effectMph * 10,
    confidenceInterval,
    windowMeans: {
      treatedPreMeanMph: 8,
      treatedPostMeanMph: 8 + input.effectMph,
      controlPreMeanMph: 8,
      controlPostMeanMph: 8,
    },
    matchedSegmentCount: 6,
    eligibleControlSegmentCount: 24,
    dropped: { insufficientWindow: 0, insufficientControls: 0, unmatchedSourceRows: 0 },
    monthlySeries: [
      {
        month: "2025-01",
        treatedMeanMph: 8,
        controlMeanMph: 8,
        differenceMph: 0,
      },
    ],
  };
  const pass = { status: "pass" as const, reason: "Fixture gate passed." };
  return {
    artifactKind: "bp.studio.segment_study.v1",
    schemaVersion: 1,
    eventKey: input.eventKey,
    candidateId: `study-event:${input.eventKey}`,
    candidateSetId: "candidate-set:fixture",
    routeId: input.routeId,
    routeSlug,
    treatmentFamily: "automated_bus_lane_enforcement",
    implementationDate: "2025-01-15",
    implementationMonth: "2025-01",
    treatedSegmentScope: "all_route_spines",
    treatedSpineSegmentIds: [`${routeSlug}-n-a-b`],
    evaluationLevel: "segment_matched_did",
    claimTier: "gated_estimate",
    direction: input.effectMph > 0 ? "improved" : "worsened",
    gates: {
      preTrend: pass,
      placeboInTime: pass,
      minSample: pass,
      controlEligibility: pass,
      congestionPricingOverlap: pass,
      redesignOverlap: pass,
    },
    variants: { allDay: variant, peakHours: variant },
    placeboEffectMph: 0,
    sensitivityEstimates: { congestionPricing: null, queensRedesign: null },
    provenance: {
      engineVersion: "segment-matched-did-v1",
      event: [
        {
          sourceKind: "registry",
          sourceId: "mta_ace_routes",
          sourceEventId: `event:${input.eventKey}`,
          releaseId: null,
          anchorIds: [],
        },
      ],
      sourceTable: "local_route_segment_speed",
      analysisMonth: "2026-03",
      dataWindow: { startMonth: "2024-07", endMonth: "2025-07" },
      speedSpineArtifactPaths: [`studio/v2/routes/${routeSlug}/speed-spine.json`],
      excludedControlRouteIds: [],
    },
  };
}

function v3Candidate(
  artifact: StudyArtifact,
  overrides: Partial<StudyEventCandidateV3> = {},
): StudyEventCandidateV3 {
  return {
    candidateId: artifact.candidateId,
    routeId: artifact.routeId,
    treatmentFamily: artifact.treatmentFamily,
    implementationDate: artifact.implementationDate,
    implementationMonth: artifact.implementationMonth,
    datePrecision: "day",
    conflictState: "none",
    occurrenceId: null,
    confounderGroupId: null,
    treatmentScopeKind: "atomic",
    componentTreatmentFamilies: [artifact.treatmentFamily],
    provenance: [v3Provenance(artifact)],
    ...overrides,
  };
}

function v3Provenance(artifact: StudyArtifact): StudyEventCandidateV3["provenance"][number] {
  return {
    sourceKind: "registry",
    sourceId: "mta_ace_routes",
    sourceEventId: `event:${artifact.eventKey}`,
    releaseId: null,
    anchorIds: [],
    occurrenceId: null,
    occurrenceAliases: [],
    manifestSha256: null,
    artifactSha256: null,
    occurrenceReviewDecisionId: null,
    wikiRouteRecordId: null,
    gtfsRouteId: null,
    analysisRouteId: artifact.routeId,
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

function approvedV3EventSet(input: {
  candidates: readonly StudyEventCandidateV3[];
  approvedIds: ReadonlySet<string>;
}) {
  const candidateSetId = "candidate-set-v3:fixture";
  return {
    artifactKind: "bp.studio.study_events.v3" as const,
    schemaVersion: 3 as const,
    candidateSetId,
    wikiInput: {
      mode: "pinned_occurrence_release_v4" as const,
      releaseId: "v1-rc25",
      manifestSha256: "a".repeat(64),
      artifactSha256: "b".repeat(64),
      relationshipBundleSha256: "c".repeat(64),
      relationshipEnforcementProofCanonicalSha256: "d".repeat(64),
      producerReviewCompatibility: "compatible" as const,
    },
    summary: {
      registryInputCount: input.candidates.length,
      wikiInputCount: 0,
      candidateCount: input.candidates.length,
      approvedCount: input.approvedIds.size,
      rejectedByOperatorCount: input.candidates.length - input.approvedIds.size,
      sourceRejectionCount: 0,
      conflictCount: 0,
      exactDeduplicationCount: 0,
    },
    approvalState: "approved" as const,
    candidates: input.candidates,
    approvedEvents: input.candidates.filter((candidate) =>
      input.approvedIds.has(candidate.candidateId),
    ),
    rejections: [],
    conflicts: [],
    approval: {
      artifactKind: "bp.studio.study_event_approvals.v3" as const,
      schemaVersion: 3 as const,
      candidateSetId,
      decisions: input.candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        decision: input.approvedIds.has(candidate.candidateId)
          ? ("approved" as const)
          : ("rejected" as const),
        reviewer: "fixture",
        rationale: "Synthetic exact-route command fixture.",
      })),
    },
  };
}

function physicalScopeBindings(input: {
  candidate: StudyEventCandidateV3;
  candidateSetId?: string;
}): StudyPhysicalScopeBindingsArtifact {
  const occurrenceId = input.candidate.occurrenceId;
  if (occurrenceId === null) throw new Error("Physical-scope fixture requires an occurrence id");
  return {
    artifactKind: "bp.studio.study_physical_scope_bindings.v1",
    schemaVersion: 1,
    candidateSetId: input.candidateSetId ?? "candidate-set-v3:fixture",
    analysisMonth: "2026-03",
    sourceRelease: {
      releaseId: "v1-rc25",
      manifestSha256: "a".repeat(64),
      occurrencesSha256: "b".repeat(64),
    },
    inputs: {
      busLaneSnapshotSha256: "c".repeat(64),
      routeShapeSnapshotSha256: "d".repeat(64),
      stopSnapshotSha256: "e".repeat(64),
    },
    bindings: [
      {
        candidateId: input.candidate.candidateId,
        routeId: input.candidate.routeId,
        occurrenceId,
        physicalScopeRecordIds: ["corridor_flatbush-phase1-livingston-state"],
        geometrySourceId: "nyc_dot_bus_lanes",
        geometryFeatureIds: ["0022938"],
        selectedGeometryRowsSha256: "f".repeat(64),
        speedSpineSha256: "1".repeat(64),
        segmentBindings: [
          {
            sourceSegmentId: "B41:2026-03:N:48:303254:901007",
            spineSegmentId: "b41-n-node-012-node-013",
          },
        ],
      },
    ],
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("study run artifact writer", () => {
  test("writes two events, route rollups, and a byte-deterministic index", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-study-run-"));
    roots.push(root);
    const studies = [
      study({ eventKey: "event-a", routeId: "M15", effectMph: 1 }),
      study({ eventKey: "event-b", routeId: "B41", effectMph: -0.5 }),
    ];

    const first = await writeStudyArtifactSet({
      artifactRoot: root,
      analysisMonth: "2026-03",
      studies,
    });
    const firstBytes = await readFile(first.indexPath, "utf8");
    const second = await writeStudyArtifactSet({
      artifactRoot: root,
      analysisMonth: "2026-03",
      studies: studies.toReversed(),
    });
    const secondBytes = await readFile(second.indexPath, "utf8");

    expect(first.routeRollupCount).toBe(2);
    expect(second).toEqual(first);
    expect(secondBytes).toBe(firstBytes);
    expect(
      JSON.parse(await readFile(join(root, "studio/v2/routes/m15/studies.json"), "utf8")).studies,
    ).toHaveLength(1);
    expect(
      JSON.parse(await readFile(join(root, "studio/v2/studies/event-b.json"), "utf8")).direction,
    ).toBe("worsened");
  });

  test("runs two approved fixture events through command orchestration", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-study-command-"));
    roots.push(root);
    const studies = [
      study({ eventKey: "event-a", routeId: "M15", effectMph: 1 }),
      study({ eventKey: "event-b", routeId: "B41", effectMph: -0.5 }),
    ];
    const approvedEvents = studies.map((artifact) => v3Candidate(artifact));
    const focusCandidate = approvedEvents[0];
    if (focusCandidate === undefined) throw new Error("Missing focus fixture candidate");
    const firstStudy = studies[0];
    if (firstStudy === undefined) throw new Error("Missing first fixture study");
    const rejectedInterference = v3Candidate(firstStudy, {
      candidateId: "study-event:rejected-interference",
      routeId: "M23+",
      implementationMonth: "2025-02",
    });
    const candidates = [...approvedEvents, rejectedInterference];
    const eventSetPath = join(root, "approved-events.json");
    await writeFile(
      eventSetPath,
      `${JSON.stringify(
        approvedV3EventSet({
          candidates,
          approvedIds: new Set(approvedEvents.map((candidate) => candidate.candidateId)),
        }),
      )}\n`,
    );
    const sqlite = new Database(":memory:");
    try {
      let interferenceRoutes: readonly string[] = [];
      const result = await runSegmentStudies({
        local: {
          sqlite,
          db: createLocalPipelineDb(sqlite),
          path: ":memory:",
          spatialite: null,
        },
        analysisMonth: "2026-03",
        artifactRoot: root,
        eventSetPath,
        buildStudy: async ({ candidate, interferenceEvents }) => {
          interferenceRoutes = interferenceEvents.map((event) => event.routeId);
          return studies.find((artifact) => artifact.candidateId === candidate.candidateId) ?? null;
        },
      });

      expect(result).toMatchObject({
        studyCount: 2,
        ineligibleStudyCount: 0,
        routeRollupCount: 2,
        gatedEstimateCount: 2,
        descriptiveCount: 0,
        noDetectableChangeCount: 0,
        laneFallbackStudyCount: 0,
        scopeIneligibleStudyCount: 0,
      });
      expect(interferenceRoutes).toContain("M23+");
      expect(
        JSON.parse(await readFile(join(root, "studio/v2/studies/index.json"), "utf8")).studies,
      ).toHaveLength(2);

      await expect(
        runSegmentStudies({
          local: {
            sqlite,
            db: createLocalPipelineDb(sqlite),
            path: ":memory:",
            spatialite: null,
          },
          analysisMonth: "2026-03",
          artifactRoot: root,
          eventSetPath,
          event: focusCandidate.candidateId,
          buildStudy: async ({ candidate }) =>
            studies.find((artifact) => artifact.candidateId === candidate.candidateId) ?? null,
        }),
      ).rejects.toThrow("Focused study runs require --focused-artifact-root");

      const focusedRoot = join(root, "focused");
      const focused = await runSegmentStudies({
        local: {
          sqlite,
          db: createLocalPipelineDb(sqlite),
          path: ":memory:",
          spatialite: null,
        },
        analysisMonth: "2026-03",
        artifactRoot: root,
        focusedArtifactRoot: focusedRoot,
        eventSetPath,
        event: focusCandidate.candidateId,
        buildStudy: async ({ candidate }) =>
          studies.find((artifact) => artifact.candidateId === candidate.candidateId) ?? null,
      });
      expect(focused.studyCount).toBe(1);
      expect(
        JSON.parse(await readFile(join(root, "studio/v2/studies/index.json"), "utf8")).studies,
      ).toHaveLength(2);
      expect(
        JSON.parse(await readFile(join(focusedRoot, "studio/v2/studies/index.json"), "utf8"))
          .studies,
      ).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  test("rejects unproven scope before invoking the estimator", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-study-scope-gate-"));
    roots.push(root);
    const artifact = study({ eventKey: "event-redesign", routeId: "Q54", effectMph: 1 });
    const unproven = v3Candidate(artifact, {
      treatmentFamily: "route_redesign",
      provenance: [
        {
          ...v3Provenance(artifact),
          sourceKind: "mta_wiki",
          sourceId: "queens_bus_network_redesign",
          occurrenceId: "occurrence:redesign",
          releaseId: "v1-rc25",
          manifestSha256: "a".repeat(64),
          artifactSha256: "b".repeat(64),
        },
      ],
    });
    const eventSetPath = join(root, "approved-events.json");
    await writeFile(
      eventSetPath,
      `${JSON.stringify(
        approvedV3EventSet({
          candidates: [unproven],
          approvedIds: new Set([unproven.candidateId]),
        }),
      )}\n`,
    );
    const sqlite = new Database(":memory:");
    let buildCalls = 0;
    try {
      const result = await runSegmentStudies({
        local: {
          sqlite,
          db: createLocalPipelineDb(sqlite),
          path: ":memory:",
          spatialite: null,
        },
        analysisMonth: "2026-03",
        artifactRoot: root,
        eventSetPath,
        buildStudy: async () => {
          buildCalls += 1;
          return artifact;
        },
      });

      expect(buildCalls).toBe(0);
      expect(result).toMatchObject({
        studyCount: 0,
        ineligibleStudyCount: 1,
        scopeIneligibleStudyCount: 1,
        routeWideEvidenceMissingCount: 1,
        laneFallbackStudyCount: 0,
      });
    } finally {
      sqlite.close();
    }
  });

  test("admits an exact bounded-scope binding and rejects a stale candidate-set binding", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-study-bounded-scope-gate-"));
    roots.push(root);
    const artifact = study({ eventKey: "event-flatbush", routeId: "B41", effectMph: 1 });
    const bounded = v3Candidate(artifact, {
      treatmentFamily: "bus_lane",
      occurrenceId: "occurrence:8c987704152b459014217d44",
      provenance: [
        {
          ...v3Provenance(artifact),
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
    });
    const eventSetPath = join(root, "approved-events.json");
    const scopeBindingsPath = join(root, "scope-bindings.json");
    await writeFile(
      eventSetPath,
      `${JSON.stringify(
        approvedV3EventSet({
          candidates: [bounded],
          approvedIds: new Set([bounded.candidateId]),
        }),
      )}\n`,
    );
    await writeFile(
      scopeBindingsPath,
      `${JSON.stringify(physicalScopeBindings({ candidate: bounded }))}\n`,
    );
    const sqlite = new Database(":memory:");
    try {
      const admittedScopes: string[] = [];
      const result = await runSegmentStudies({
        local: {
          sqlite,
          db: createLocalPipelineDb(sqlite),
          path: ":memory:",
          spatialite: null,
        },
        analysisMonth: "2026-03",
        artifactRoot: root,
        eventSetPath,
        scopeBindingsPath,
        buildStudy: async ({ scopeAdmission }) => {
          admittedScopes.push(scopeAdmission.scope);
          return artifact;
        },
      });
      expect(admittedScopes).toEqual(["lane_overlap_spines"]);
      expect(result).toMatchObject({
        studyCount: 1,
        scopeIneligibleStudyCount: 0,
        boundedScopeBindingMismatchCount: 0,
      });

      await writeFile(
        scopeBindingsPath,
        `${JSON.stringify(
          physicalScopeBindings({ candidate: bounded, candidateSetId: "candidate-set-v3:stale" }),
        )}\n`,
      );
      await expect(
        runSegmentStudies({
          local: {
            sqlite,
            db: createLocalPipelineDb(sqlite),
            path: ":memory:",
            spatialite: null,
          },
          analysisMonth: "2026-03",
          artifactRoot: root,
          eventSetPath,
          scopeBindingsPath,
          buildStudy: async () => artifact,
        }),
      ).rejects.toThrow("Physical-scope binding artifact is stale");
    } finally {
      sqlite.close();
    }
  });
});
