import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  getRouteBatchStatus,
  listRouteBatchIssues,
  replaceRouteBuildPlan,
  replaceRouteCatalog,
  replaceRouteComparisonRanks,
  replaceRouteReadiness,
  replaceRouteScorecard,
} from "@bp/db/local";
import { buildRouteBatchAudit } from "../src/jobs/build/route-batch-audit.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-08";
const routeDir = fromRepoRoot(join("data/artifacts/route-slices/t1-2026-08"));
const dbPath = fromRepoRoot(join("data/fixtures/route-batch-audit/pipeline.sqlite"));
async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([rm(routeDir, { force: true, recursive: true }), rm(dbPath, { force: true })]);
}

async function writeFixtureBatch(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(routeDir, { recursive: true });
  const local = await openLocalPipelineDb(dbPath);

  await replaceRouteCatalog(local.db, [
    {
      routeId: "T1",
      routeShortName: "T1",
      routeLongName: "7 Shuttle Bus - Main Street - Mets/Willets Pt",
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
      routeLongName: "7 Shuttle Bus - Main Street - Mets/Willets Pt",
      isoMonth,
      readinessStatus: "missing_speed",
      buildEligible: true,
      readinessScore: 60,
      missingInputs: ["segment_speeds"],
      speedObservationCount: 0,
      speedBusTripCount: 0,
      averageSpeedMph: null,
      scheduleTimepointCount: 100,
      shapeCount: 2,
      stopCount: 10,
      timepointStopCount: 4,
    },
  ]);
  await replaceRouteBuildPlan(local.db, isoMonth, [
    {
      routeId: "T1",
      routeShortName: "T1",
      routeLongName: "7 Shuttle Bus - Main Street - Mets/Willets Pt",
      isoMonth,
      candidateRank: 1,
      planStatus: "selected",
      selectedForNextBatch: true,
      alreadyBuilt: false,
      buildEligible: true,
      priorityScore: 60,
      readinessStatus: "missing_speed",
      readinessScore: 60,
      missingInputs: ["segment_speeds"],
      speedObservationCount: 0,
      speedBusTripCount: 0,
      averageSpeedMph: null,
      scheduleTimepointCount: 100,
      shapeCount: 2,
      stopCount: 10,
      timepointStopCount: 4,
    },
  ]);
  await replaceRouteScorecard(local.db, {
    routeId: "T1",
    month: isoMonth,
    routeScore: 0,
    coverageStatus: "no_observed_speed",
    averageSpeedMph: 0,
    hotspotCount: 0,
  });
  await replaceRouteComparisonRanks(local.db, isoMonth, []);
  local.sqlite.close();
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route batch audit", () => {
  test("verifies artifact manifests, byte lengths, and hashes for a batch", async () => {
    await writeFixtureBatch();

    const result = await buildRouteBatchAudit({ year: 2026, month: 8, dbPath });
    const local = await openLocalPipelineDb(dbPath);
    const status = await getRouteBatchStatus(local.db, isoMonth);
    const issues = await listRouteBatchIssues(local.db, isoMonth);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        routeCount: 0,
        status: "pass",
        issueCount: 0,
        artifactCount: 0,
      }),
    );
    expect(status).toEqual(
      expect.objectContaining({
        status: "pass",
        missingArtifactCount: 0,
        hashMismatchCount: 0,
        artifactCount: 0,
      }),
    );
    expect(issues).toEqual([]);
  });

  test("records pass when no artifact rows exist", async () => {
    await writeFixtureBatch();

    const result = await buildRouteBatchAudit({ year: 2026, month: 8, dbPath });
    const local = await openLocalPipelineDb(dbPath);
    const [status, issues] = await Promise.all([
      getRouteBatchStatus(local.db, isoMonth),
      listRouteBatchIssues(local.db, isoMonth),
    ]);
    local.sqlite.close();

    expect(result.status).toBe("pass");
    expect(result.issueCount).toBe(0);
    expect(status).toEqual(expect.objectContaining({ missingArtifactCount: 0 }));
    expect(issues).toEqual([]);
  });
});
