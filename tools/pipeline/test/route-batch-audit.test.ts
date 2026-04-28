import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  replaceRouteArtifacts,
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
const batchDir = fromRepoRoot(join("data/artifacts/route-batches", isoMonth));
const routeDir = fromRepoRoot(join("data/artifacts/route-slices/t1-2026-08"));
const dbPath = fromRepoRoot(join("data/fixtures/route-batch-audit/pipeline.sqlite"));
const artifactNames = [
  "summary.json",
  "hotspots.json",
  "ridership-profile.json",
  "speed-profile.json",
  "intervention-overlay.json",
  "bus-lane-overlay.json",
  "schedule-comparison.json",
  "route-scorecard.json",
  "route-brief-input.json",
] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(batchDir, { force: true, recursive: true }),
    rm(routeDir, { force: true, recursive: true }),
    rm(dbPath, { force: true }),
  ]);
}

async function writeFixtureBatch(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(batchDir, { recursive: true });
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
  const artifacts = await Promise.all(
    artifactNames.map(async (name) => {
      const content =
        name === "route-scorecard.json"
          ? JSON.stringify({
              schemaVersion: 1,
              routeId: "T1",
              month: isoMonth,
              routeScore: 0,
              coverageStatus: "no_observed_speed",
              averageSpeedMph: 0,
              hotspotCount: 0,
              citations: [],
            })
          : JSON.stringify({ name, routeId: "T1" });
      const path = join(routeDir, name);

      await Bun.write(path, content);

      return {
        name,
        path,
        artifactKey: `route-slices/t1-2026-08/${name}`,
        contentType: "application/json",
        byteLength: content.length,
        sha256: sha256(content),
      };
    }),
  );
  const artifactLocal = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteArtifacts(
      artifactLocal.db,
      "T1",
      isoMonth,
      artifacts.map((artifact) => ({
        routeId: "T1",
        month: isoMonth,
        artifactName: artifact.name,
        artifactKey: artifact.artifactKey,
        contentType: artifact.contentType,
        byteLength: artifact.byteLength,
        sha256: artifact.sha256,
      })),
    );
  } finally {
    artifactLocal.sqlite.close();
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route batch audit", () => {
  test("verifies artifact manifests, byte lengths, and hashes for a batch", async () => {
    await writeFixtureBatch();

    const result = await buildRouteBatchAudit({ year: 2026, month: 8, batchDir, dbPath });
    const audit = await Bun.file(result.auditPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        routeCount: 1,
        status: "pass",
        issueCount: 0,
        artifactCount: artifactNames.length,
      }),
    );
    expect(audit.rows[0]).toEqual(
      expect.objectContaining({
        routeId: "T1",
        status: "pass",
        verifiedArtifactCount: artifactNames.length,
        missingArtifactCount: 0,
        hashMismatchCount: 0,
      }),
    );
    expect(audit.coverageReport).toEqual(
      expect.objectContaining({
        routeCount: 1,
        noObservedSpeedRouteCount: 1,
        comparisonExcludedRouteCount: 1,
        publicHiddenRouteCount: 1,
        publicHiddenRoutes: [
          {
            routeId: "T1",
            reason: "temporary_shuttle_without_observed_speed",
          },
        ],
      }),
    );
  });

  test("records missing artifacts as failing audit issues", async () => {
    await writeFixtureBatch();
    await rm(join(routeDir, "hotspots.json"));

    const result = await buildRouteBatchAudit({ year: 2026, month: 8, batchDir, dbPath });
    const audit = await Bun.file(result.auditPath).json();

    expect(result.status).toBe("fail");
    expect(result.issueCount).toBe(1);
    expect(audit.issues).toEqual(["T1:missing_artifact_file:hotspots.json"]);
    expect(audit.rows[0]).toEqual(
      expect.objectContaining({
        missingArtifactCount: 1,
        verifiedArtifactCount: artifactNames.length - 1,
      }),
    );
  });
});
