import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  getRouteBatchStatus,
  listRouteBatchIssues,
  replaceCorridorRows,
  replaceRouteBatch,
  replaceRouteBriefRows,
  replaceRouteCatalog,
  replaceRouteComparisonRanks,
  replaceRouteObservedReliabilityRows,
  replaceRouteReadiness,
  replaceRouteScorecard,
} from "@bp/db/local";
import { buildBriefArtifacts } from "../src/jobs/build/brief-artifacts.js";
import { buildRouteBatchAudit } from "../src/jobs/build/route-batch-audit.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-08";
const dbPath = fromRepoRoot(join("data/fixtures/route-batch-audit/pipeline.sqlite"));
const routeBriefDir = fromRepoRoot(join("data/artifacts/briefs/routes/t1", isoMonth));
const corridorBriefDir = fromRepoRoot(
  join("data/artifacts/briefs/corridors/street-broadway", isoMonth),
);
const manifestPath = fromRepoRoot(join("data/artifacts/briefs", isoMonth, "manifest.json"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(routeBriefDir, { force: true, recursive: true }),
    rm(corridorBriefDir, { force: true, recursive: true }),
    rm(manifestPath, { force: true }),
    rm(dbPath, { force: true }),
  ]);
}

async function writeFixtureBatch(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteCatalog(local.db, [
      {
        routeId: "T1",
        routeShortName: "T1",
        routeLongName: "Fixture route",
        routeTypes: ["Local"],
        directions: [],
        shapeCount: 2,
        stopCount: 10,
        timepointStopCount: 4,
        latitudeMin: null,
        latitudeMax: null,
        longitudeMin: null,
        longitudeMax: null,
      },
    ]);
    await replaceRouteReadiness(local.db, isoMonth, [
      {
        routeId: "T1",
        routeShortName: "T1",
        routeLongName: "Fixture route",
        isoMonth,
        readinessStatus: "ready",
        buildEligible: true,
        readinessScore: 100,
        missingInputs: [],
        speedObservationCount: 20,
        speedBusTripCount: 200,
        averageSpeedMph: 6,
        scheduleTimepointCount: 100,
        shapeCount: 2,
        stopCount: 10,
        timepointStopCount: 4,
      },
    ]);
    await replaceRouteScorecard(local.db, {
      routeId: "T1",
      month: isoMonth,
      routeScore: 40,
      coverageStatus: "full",
      averageSpeedMph: 6,
      hotspotCount: 1,
    });
    await replaceRouteBriefRows(local.db, {
      summary: {
        routeId: "T1",
        month: isoMonth,
        routeScore: 40,
        publicVisible: true,
        publicVisibilityReason: "included",
        averageSpeedMph: 6,
        hotspotCount: 1,
        totalRidership: 1000,
        totalTransfers: 100,
        aceActive: false,
        aceViolationCount: 0,
        busLaneMatchedLaneCount: 0,
        scheduleMatchRate: 0.5,
      },
      peakWindows: [],
      slowestWindows: [],
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
          observedReliabilityRouteCount: 0,
          insufficientReliabilityRouteCount: 0,
          interventionComparisonCount: 0,
          evaluatedInterventionComparisonCount: 0,
        },
      ],
      hotspots: [],
    });
    await replaceRouteComparisonRanks(local.db, isoMonth, []);
    await replaceRouteBatch(local.db, {
      status: {
        month: isoMonth,
        generatedAt: "2026-08-01T00:00:00.000Z",
        status: "running",
        routeCount: 1,
        artifactCount: 0,
        missingArtifactCount: 0,
        hashMismatchCount: 0,
        byteLengthMismatchCount: 0,
        totalByteLength: 0,
        issueCount: 0,
      },
      builtRoutes: [
        {
          month: isoMonth,
          routeRank: 1,
          routeId: "T1",
          artifactCount: null,
          status: "built",
        },
      ],
      issues: [],
    });
  } finally {
    local.sqlite.close();
  }
  await buildBriefArtifacts({ year: 2026, month: 8, dbPath });
}

async function addObservedReliabilityAndRebuild(): Promise<void> {
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteObservedReliabilityRows(local.db, isoMonth, "fixture-gtfs-rt", {
      summaries: [
        {
          routeId: "T1",
          month: isoMonth,
          runId: "fixture-gtfs-rt",
          reliabilityStatus: "insufficient_gtfs_rt_samples",
          minSampleThreshold: 30,
          sampleCount: 0,
          stopCount: 0,
          directionCount: 0,
          averageObservedHeadwayMinutes: null,
          medianObservedHeadwayMinutes: null,
          p90ObservedHeadwayMinutes: null,
          maxObservedHeadwayMinutes: null,
          scheduledMedianHeadwayMinutes: 10,
          bunchingThresholdMinutes: 5,
          longGapThresholdMinutes: 20,
          observedBunchingShare: null,
          observedLongGapShare: null,
          expectedWaitMinutes: null,
          scheduledExpectedWaitMinutes: 5,
          excessWaitMinutes: null,
          waitReliabilityRatio: null,
        },
      ],
      sourceStatuses: [],
    });
  } finally {
    local.sqlite.close();
  }
  await buildBriefArtifacts({ year: 2026, month: 8, dbPath });
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route batch audit", () => {
  test("verifies brief artifact byte lengths and hashes for a batch", async () => {
    await writeFixtureBatch();

    const result = await buildRouteBatchAudit({ year: 2026, month: 8, dbPath });
    const manifest = await Bun.file(result.manifestPath).json();
    const local = await openLocalPipelineDb(dbPath);
    const status = await getRouteBatchStatus(local.db, isoMonth);
    const issues = await listRouteBatchIssues(local.db, isoMonth);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        manifestPath,
        routeCount: 1,
        status: "pass",
        issueCount: 0,
        artifactCount: 6,
        missingArtifactCount: 0,
        hashMismatchCount: 0,
      }),
    );
    expect(manifest).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        artifactKind: "brief_artifact_manifest",
        analysisPeriod: isoMonth,
        status: "pass",
        routeCount: 1,
        publicRouteCount: 1,
        corridorCount: 1,
        routeArtifactCount: 3,
        corridorArtifactCount: 3,
        artifactCount: 6,
        issueCount: 0,
      }),
    );
    expect(manifest.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerKind: "route",
          ownerId: "T1",
          artifactName: "brief.json",
          artifactKey: "briefs/routes/t1/2026-08/brief.json",
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        expect.objectContaining({
          ownerKind: "corridor",
          ownerId: "street:broadway",
          artifactName: "brief.md",
          artifactKey: "briefs/corridors/street-broadway/2026-08/brief.md",
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
    );
    expect(status).toEqual(
      expect.objectContaining({
        status: "pass",
        artifactCount: 6,
        missingArtifactCount: 0,
        hashMismatchCount: 0,
      }),
    );
    expect(issues).toEqual([]);
  });

  test("records a hash issue when a generated artifact is modified", async () => {
    await writeFixtureBatch();
    await Bun.write(join(routeBriefDir, "brief.md"), "changed\n");

    const result = await buildRouteBatchAudit({ year: 2026, month: 8, dbPath });
    const manifest = await Bun.file(result.manifestPath).json();
    const local = await openLocalPipelineDb(dbPath);
    const issues = await listRouteBatchIssues(local.db, isoMonth);
    local.sqlite.close();

    expect(result.status).toBe("fail");
    expect(result.issueCount).toBeGreaterThan(0);
    expect(issues.map((issue) => issue.issueCode)).toEqual(
      expect.arrayContaining(["artifact_hash_mismatch", "artifact_byte_length_mismatch"]),
    );
    expect(manifest).toEqual(
      expect.objectContaining({
        status: "fail",
        issueCount: result.issueCount,
        hashMismatchCount: result.hashMismatchCount,
        byteLengthMismatchCount: result.byteLengthMismatchCount,
      }),
    );
    expect(manifest.issues.map((issue: { issueCode: string }) => issue.issueCode)).toEqual(
      expect.arrayContaining(["artifact_hash_mismatch", "artifact_byte_length_mismatch"]),
    );
  });

  test("records a contract issue when route brief JSON omits observed reliability", async () => {
    await writeFixtureBatch();
    const briefPath = join(routeBriefDir, "brief.json");
    const briefJson = await Bun.file(briefPath).json();
    delete briefJson.observedReliability;
    await Bun.write(briefPath, `${JSON.stringify(briefJson, null, 2)}\n`);

    const result = await buildRouteBatchAudit({ year: 2026, month: 8, dbPath });
    const manifest = await Bun.file(result.manifestPath).json();
    const local = await openLocalPipelineDb(dbPath);
    const issues = await listRouteBatchIssues(local.db, isoMonth);
    local.sqlite.close();

    expect(result.status).toBe("fail");
    expect(issues.map((issue) => issue.issueCode)).toEqual(
      expect.arrayContaining(["route_brief_observed_reliability_contract_missing"]),
    );
    expect(manifest.issues.map((issue: { issueCode: string }) => issue.issueCode)).toEqual(
      expect.arrayContaining(["route_brief_observed_reliability_contract_missing"]),
    );
  });

  test("records a contract issue when route brief JSON omits observed reliability windows", async () => {
    await writeFixtureBatch();
    await addObservedReliabilityAndRebuild();
    const briefPath = join(routeBriefDir, "brief.json");
    const briefJson = await Bun.file(briefPath).json();
    delete briefJson.observedReliability.windows;
    await Bun.write(briefPath, `${JSON.stringify(briefJson, null, 2)}\n`);

    const result = await buildRouteBatchAudit({ year: 2026, month: 8, dbPath });
    const manifest = await Bun.file(result.manifestPath).json();
    const local = await openLocalPipelineDb(dbPath);
    const issues = await listRouteBatchIssues(local.db, isoMonth);
    local.sqlite.close();

    expect(result.status).toBe("fail");
    expect(issues.map((issue) => issue.issueCode)).toEqual(
      expect.arrayContaining(["route_brief_observed_reliability_windows_missing"]),
    );
    expect(manifest.issues.map((issue: { issueCode: string }) => issue.issueCode)).toEqual(
      expect.arrayContaining(["route_brief_observed_reliability_windows_missing"]),
    );
  });
});
