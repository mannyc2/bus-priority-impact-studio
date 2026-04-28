import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { replaceRouteBuildPlan } from "@bp/db/local";
import { buildPlannedRouteBatch } from "../src/jobs/build/planned-route-batch.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-07";
const batchDir = fromRepoRoot(join("data/artifacts/route-batches", isoMonth));
const dbPath = fromRepoRoot(join("data/fixtures/planned-route-batch/pipeline.sqlite"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([rm(batchDir, { force: true, recursive: true }), rm(dbPath, { force: true })]);
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);

  await replaceRouteBuildPlan(local.db, isoMonth, [
    {
      routeId: "T1",
      routeShortName: "T1",
      routeLongName: null,
      isoMonth,
      candidateRank: 1,
      planStatus: "selected",
      selectedForNextBatch: true,
      alreadyBuilt: false,
      buildEligible: true,
      priorityScore: 100,
      readinessStatus: "ready",
      readinessScore: 100,
      missingInputs: [],
      speedObservationCount: 20,
      speedBusTripCount: 200,
      averageSpeedMph: 6,
      scheduleTimepointCount: 100,
      shapeCount: 1,
      stopCount: 10,
      timepointStopCount: 4,
    },
    {
      routeId: "T2",
      routeShortName: "T2",
      routeLongName: null,
      isoMonth,
      candidateRank: 2,
      planStatus: "selected",
      selectedForNextBatch: true,
      alreadyBuilt: false,
      buildEligible: true,
      priorityScore: 90,
      readinessStatus: "ready",
      readinessScore: 100,
      missingInputs: [],
      speedObservationCount: 20,
      speedBusTripCount: 200,
      averageSpeedMph: 7,
      scheduleTimepointCount: 100,
      shapeCount: 1,
      stopCount: 10,
      timepointStopCount: 4,
    },
    {
      routeId: "T3",
      routeShortName: "T3",
      routeLongName: null,
      isoMonth,
      candidateRank: 3,
      planStatus: "backlog",
      selectedForNextBatch: false,
      alreadyBuilt: false,
      buildEligible: true,
      priorityScore: 80,
      readinessStatus: "ready",
      readinessScore: 100,
      missingInputs: [],
      speedObservationCount: 20,
      speedBusTripCount: 200,
      averageSpeedMph: 8,
      scheduleTimepointCount: 100,
      shapeCount: 1,
      stopCount: 10,
      timepointStopCount: 4,
    },
  ]);
  local.sqlite.close();
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("planned route batch build", () => {
  test("builds selected plan routes from local DB state", async () => {
    await writeFixtureArtifacts();
    const calls: string[] = [];
    const deps = {
      buildRouteSliceArtifacts: async ({ routeId }: { routeId?: string }) => {
        calls.push(`build:${routeId}`);
        return {
          routeId: routeId ?? "",
          isoMonth,
          segmentSpeedRows: 20,
          ridershipWindows: 4,
          scheduleTimepoints: 12,
          hotspotCount: 2,
          routeScore: 42,
          artifactCount: 9,
        };
      },
      buildRouteComparison: async ({ limit }: { limit?: number }) => {
        calls.push(`comparison:${limit}`);
        return {
          isoMonth,
          routeCount: limit ?? 0,
          worstRouteId: "T1",
        };
      },
      buildRouteBatchAudit: async () => {
        calls.push("audit");
        return {
          isoMonth,
          routeCount: 2,
          status: "pass",
          issueCount: 0,
          artifactCount: 18,
          totalByteLength: 200,
        };
      },
      buildRouteReliabilityBaseline: async () => {
        calls.push("reliability");
        return {
          isoMonth,
          routeCount: 2,
          headwaySampleCount: 10,
        };
      },
      buildRouteBuildPlan: async ({ limit }: { limit?: number }) => {
        calls.push(`plan:${limit}`);
        return {
          isoMonth,
          routeCount: 3,
          selectedRouteCount: 2,
          alreadyBuiltRouteCount: 2,
          blockedRouteCount: 0,
          backlogRouteCount: 1,
        };
      },
      exportD1Seed: async () => {
        calls.push("export:d1");
        return {
          isoMonth,
          schemaPath: "/tmp/schema.sql",
          seedPath: "/tmp/seed.sql",
          routeCount: 2,
          artifactRowCount: 18,
          comparisonRowCount: 2,
          routeCatalogRowCount: 3,
          routeCoverageRowCount: 3,
          routeReadinessRowCount: 3,
          routeBuildPlanRowCount: 3,
          routeBatchStatusRowCount: 1,
        };
      },
      ingestAceRoutes: async () => {
        calls.push("shared:ace-routes");
        return {};
      },
      ingestAceViolationSummary: async () => {
        calls.push("shared:ace-violations");
        return {};
      },
      ingestBusLanes: async () => {
        calls.push("shared:bus-lanes");
        return {};
      },
    };

    const result = await buildPlannedRouteBatch(
      {
        year: 2026,
        month: 7,
        limit: 1,
        dbPath,
      },
      deps as never,
    );

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        builtRouteIds: ["T1"],
        builtRouteCount: 1,
        totalBatchRouteCount: 1,
        d1SeedPath: "/tmp/seed.sql",
      }),
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        "shared:ace-routes",
        "shared:ace-violations",
        "shared:bus-lanes",
        "build:T1",
        "comparison:1",
        "reliability",
        "audit",
        "plan:20",
        "export:d1",
      ]),
    );
  });
});
