import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  replaceCorridorRows,
  replaceRouteInterventionEvaluationRows,
  replaceRouteObservedReliabilityRows,
} from "@bp/db/local";
import {
  buildEvaluationArtifacts,
  evaluationArtifactManifestPath,
  readEvaluationArtifactManifest,
  verifyEvaluationArtifactManifest,
} from "../src/jobs/build/evaluation-artifacts.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-12";
const workingDir = fromRepoRoot(join("data/working/test-evaluation-artifacts"));
const dbPath = join(workingDir, "pipeline.sqlite");
const artifactRoot = join(workingDir, "artifacts");

async function removeFixtureArtifacts(): Promise<void> {
  await rm(workingDir, { force: true, recursive: true });
}

async function writeFixtureRows(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteObservedReliabilityRows(local.db, isoMonth, "fixture-gtfs-rt", {
      summaries: [
        {
          routeId: "T1",
          month: isoMonth,
          runId: "fixture-gtfs-rt",
          reliabilityStatus: "observed",
          minSampleThreshold: 3,
          sampleCount: 42,
          stopCount: 5,
          directionCount: 2,
          averageObservedHeadwayMinutes: 8.5,
          medianObservedHeadwayMinutes: 8,
          p90ObservedHeadwayMinutes: 15,
          maxObservedHeadwayMinutes: 22,
          scheduledMedianHeadwayMinutes: 10,
          bunchingThresholdMinutes: 5,
          longGapThresholdMinutes: 20,
          observedBunchingShare: 0.12,
          observedLongGapShare: 0.05,
          expectedWaitMinutes: 5.1,
          scheduledExpectedWaitMinutes: 5,
          excessWaitMinutes: 0.1,
          waitReliabilityRatio: 1.02,
        },
      ],
      sourceStatuses: [],
    });
    await replaceRouteInterventionEvaluationRows(local.db, isoMonth, "mta_ace_routes", {
      events: [
        {
          eventId: "ace:T1:ACE:2026-01-15",
          routeId: "T1",
          interventionType: "automated_bus_lane_enforcement",
          sourceId: "mta_ace_routes",
          program: "ACE",
          implementationDate: "2026-01-15T00:00:00.000Z",
          implementationMonth: "2026-01",
          eventStatus: "implemented",
          description: "ACE automated bus lane enforcement for T1",
        },
        {
          eventId: "ace:T2:ACE:2026-01-15",
          routeId: "T2",
          interventionType: "automated_bus_lane_enforcement",
          sourceId: "mta_ace_routes",
          program: "ACE",
          implementationDate: "2026-01-15T00:00:00.000Z",
          implementationMonth: "2026-01",
          eventStatus: "implemented",
          description: "Unreferenced fixture event",
        },
      ],
      comparisons: [
        {
          routeId: "T1",
          month: isoMonth,
          eventId: "ace:T1:ACE:2026-01-15",
          interventionType: "automated_bus_lane_enforcement",
          sourceId: "mta_ace_routes",
          evaluationLevel: "peer_adjusted_before_after",
          comparisonStatus: "evaluated",
          preStartMonth: "2025-11",
          preEndMonth: "2025-12",
          postStartMonth: "2026-02",
          postEndMonth: "2026-03",
          requestedPreMonthCount: 2,
          requestedPostMonthCount: 2,
          preSampleMonthCount: 2,
          postSampleMonthCount: 2,
          preSpeedObservationCount: 30,
          postSpeedObservationCount: 70,
          preAverageSpeedMph: 6,
          postAverageSpeedMph: 8,
          speedDeltaMph: 2,
          preAverageMonthlyRidership: 1000,
          postAverageMonthlyRidership: 1400,
          ridershipDelta: 400,
          comparisonRouteCount: 1,
          comparisonRouteIds: '["T2"]',
          comparisonPreAverageSpeedMph: 5.5,
          comparisonPostAverageSpeedMph: 6,
          comparisonSpeedDeltaMph: 0.5,
          adjustedSpeedDeltaMph: 1.5,
          comparisonPreAverageMonthlyRidership: 900,
          comparisonPostAverageMonthlyRidership: 1000,
          comparisonRidershipDelta: 100,
          adjustedRidershipDelta: 300,
          caveat: "Peer-adjusted before/after using 1 public route.",
        },
      ],
    });
    await replaceCorridorRows(local.db, isoMonth, {
      corridors: [
        {
          corridorId: "street:broadway",
          corridorName: "Broadway",
          corridorKey: "BROADWAY",
          derivationMethod: "primary_route_stop_street",
        },
      ],
      routeMembers: [
        {
          corridorId: "street:broadway",
          month: isoMonth,
          routeId: "T1",
          assignmentStatus: "assigned",
          assignmentReason: "primary_stop_street",
          stopCount: 2,
          matchedStopCount: 2,
          hotspotCount: 1,
          matchedSegmentCount: 1,
          segmentEvidenceScore: 80,
          totalRidership: 1000,
          averageSpeedMph: 6,
        },
      ],
      summaries: [
        {
          corridorId: "street:broadway",
          month: isoMonth,
          routeCount: 1,
          assignedRouteCount: 1,
          ambiguousRouteCount: 0,
          unassignedRouteCount: 0,
          totalRidership: 1000,
          totalTransfers: 100,
          weightedAverageSpeedMph: 6,
          hotspotCount: 1,
          observedReliabilityRouteCount: 1,
          insufficientReliabilityRouteCount: 0,
          interventionComparisonCount: 1,
          evaluatedInterventionComparisonCount: 1,
        },
      ],
      interventionContexts: [
        {
          corridorId: "street:broadway",
          month: isoMonth,
          contextRank: 1,
          routeId: "T1",
          eventId: "ace:T1:ACE:2026-01-15",
          interventionType: "automated_bus_lane_enforcement",
          sourceId: "mta_ace_routes",
          program: "ACE",
          implementationMonth: "2026-01",
          eventStatus: "implemented",
          evaluationLevel: "peer_adjusted_before_after",
          comparisonStatus: "evaluated",
          speedDeltaMph: 2,
          adjustedSpeedDeltaMph: 1.5,
          ridershipDelta: 400,
          adjustedRidershipDelta: 300,
          comparisonRouteCount: 1,
          caveat: "Peer-adjusted before/after using 1 public route.",
        },
      ],
      hotspots: [],
    });
  } finally {
    local.sqlite.close();
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("evaluation artifacts", () => {
  test("writes hashed static evaluation payloads and verifies their row counts", async () => {
    await writeFixtureRows();

    const result = await buildEvaluationArtifacts({
      year: 2026,
      month: 12,
      dbPath,
      artifactRoot,
    });
    const manifest = await readEvaluationArtifactManifest({ artifactRoot, month: isoMonth });
    const interventions = await Bun.file(
      join(artifactRoot, "evaluations", isoMonth, "interventions.json"),
    ).json();
    const verification = await verifyEvaluationArtifactManifest({
      artifactRoot,
      month: isoMonth,
      expectedRowCounts: {
        observedReliability: 1,
        routeInterventionComparisons: 1,
        corridorInterventionContexts: 1,
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        manifestPath: evaluationArtifactManifestPath(artifactRoot, isoMonth),
        artifactCount: 3,
        observedReliabilityRowCount: 1,
        interventionEventCount: 1,
        interventionComparisonCount: 1,
        corridorInterventionContextRowCount: 1,
      }),
    );
    expect(manifest).toEqual(
      expect.objectContaining({
        artifactKind: "evaluation_artifact_manifest",
        analysisPeriod: isoMonth,
        artifactCount: 3,
        issueCount: 0,
      }),
    );
    expect(manifest?.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactKind: "observed_reliability_evaluation_payload",
          artifactKey: join("evaluations", isoMonth, "observed-reliability.json"),
          rowCount: 1,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        expect.objectContaining({
          artifactKind: "route_intervention_evaluation_payload",
          artifactKey: join("evaluations", isoMonth, "interventions.json"),
          rowCount: 1,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        expect.objectContaining({
          artifactKind: "corridor_intervention_evaluation_payload",
          artifactKey: join("evaluations", isoMonth, "corridor-interventions.json"),
          rowCount: 1,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
    );
    expect(interventions).toEqual(
      expect.objectContaining({
        eventCount: 1,
        comparisonCount: 1,
      }),
    );
    expect(verification).toEqual(
      expect.objectContaining({
        status: "pass",
        issueCount: 0,
        rowCounts: {
          observedReliability: 1,
          routeInterventionComparisons: 1,
          corridorInterventionContexts: 1,
        },
      }),
    );
  });

  test("reports tampered payloads and expected row-count mismatches", async () => {
    await writeFixtureRows();
    await buildEvaluationArtifacts({ year: 2026, month: 12, dbPath, artifactRoot });
    await Bun.write(
      join(artifactRoot, "evaluations", isoMonth, "observed-reliability.json"),
      '{"changed":true}\n',
    );

    const verification = await verifyEvaluationArtifactManifest({
      artifactRoot,
      month: isoMonth,
      expectedRowCounts: {
        observedReliability: 2,
        routeInterventionComparisons: 1,
        corridorInterventionContexts: 1,
      },
    });

    expect(verification.status).toBe("fail");
    expect(verification.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "evaluation_artifact_hash_mismatch",
        "evaluation_artifact_payload_kind_mismatch",
        "evaluation_artifact_payload_month_mismatch",
        "evaluation_artifact_payload_rows_missing",
        "evaluation_artifact_expected_row_count_mismatch",
      ]),
    );
  });
});
