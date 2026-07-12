import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalPipelineDb } from "@bp/db/local";
import type { StudyArtifact } from "@bp/domain/studio/study";
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
    treatmentFamily: "select_bus_service",
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
    const approvedEvents = studies.map((artifact) => ({
      candidateId: artifact.candidateId,
      routeId: artifact.routeId,
      treatmentFamily: artifact.treatmentFamily,
      implementationDate: artifact.implementationDate,
      implementationMonth: artifact.implementationMonth,
      datePrecision: "day" as const,
      conflictState: "none" as const,
      provenance: artifact.provenance.event,
    }));
    const eventSetPath = join(root, "approved-events.json");
    await writeFile(
      eventSetPath,
      `${JSON.stringify({
        artifactKind: "bp.studio.study_events.v1",
        schemaVersion: 1,
        candidateSetId: "candidate-set:fixture",
        wikiInput: {
          mode: "explicit_opt_out",
          releaseId: null,
          manifestSha256: null,
          artifactSha256: null,
        },
        summary: {
          registryInputCount: 2,
          wikiInputCount: 0,
          candidateCount: 2,
          approvedCount: 2,
          rejectedByOperatorCount: 0,
          sourceRejectionCount: 0,
          conflictCount: 0,
          exactDeduplicationCount: 0,
        },
        approvalState: "approved",
        candidates: approvedEvents,
        approvedEvents,
        rejections: [],
        conflicts: [],
        approval: {
          artifactKind: "bp.studio.study_event_approvals.v1",
          schemaVersion: 1,
          candidateSetId: "candidate-set:fixture",
          decisions: approvedEvents.map((candidate) => ({
            candidateId: candidate.candidateId,
            decision: "approved",
            reviewer: "fixture",
            rationale: "Synthetic command fixture.",
          })),
        },
      })}\n`,
    );
    const sqlite = new Database(":memory:");
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
        buildStudy: async ({ candidate }) =>
          studies.find((artifact) => artifact.candidateId === candidate.candidateId) ?? null,
      });

      expect(result).toMatchObject({
        studyCount: 2,
        ineligibleStudyCount: 0,
        routeRollupCount: 2,
        gatedEstimateCount: 2,
        descriptiveCount: 0,
        noDetectableChangeCount: 0,
        laneFallbackStudyCount: 0,
      });
      expect(
        JSON.parse(await readFile(join(root, "studio/v2/studies/index.json"), "utf8")).studies,
      ).toHaveLength(2);
    } finally {
      sqlite.close();
    }
  });
});
