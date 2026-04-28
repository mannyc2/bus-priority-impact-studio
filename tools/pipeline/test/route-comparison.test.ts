import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { replaceRouteBriefRows, replaceRouteScorecard } from "@bp/db/local";
import { buildRouteComparisonFromCli } from "../src/jobs/build/route-comparison.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-04";
const batchDir = fromRepoRoot(join("data/artifacts/route-batches", isoMonth));
const dbPath = fromRepoRoot(join("data/working/test-route-comparison/pipeline.sqlite"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(batchDir, { force: true, recursive: true }),
    rm(fromRepoRoot(join("data/working/test-route-comparison")), { force: true, recursive: true }),
  ]);
}

async function writeBrief(
  routeId: string,
  routeScore: number,
  averageSpeedMph: number,
  coverageStatus: "full" | "no_observed_speed" = "full",
) {
  const local = await openLocalPipelineDb(dbPath);

  try {
    await replaceRouteScorecard(local.db, {
      routeId,
      month: isoMonth,
      routeScore,
      coverageStatus,
      averageSpeedMph,
      hotspotCount: 3,
    });
    await replaceRouteBriefRows(local.db, {
      summary: {
        routeId,
        month: isoMonth,
        routeScore,
        publicVisible: coverageStatus === "full",
        publicVisibilityReason: coverageStatus === "full" ? "included" : "no_observed_speed",
        averageSpeedMph,
        hotspotCount: 3,
        totalRidership: 5000,
        totalTransfers: 500,
        aceActive: routeId === "T2",
        aceViolationCount: routeId === "T2" ? 25 : 0,
        busLaneMatchedLaneCount: 4,
        scheduleMatchRate: 2 / 3,
      },
      peakWindows: [],
      slowestWindows: [],
    });
  } finally {
    local.sqlite.close();
  }
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  await writeBrief("T1", 40, 8);
  await writeBrief("T2", 20, 6);
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route comparison build", () => {
  test("ranks route brief metrics from a batch summary", async () => {
    await writeFixtureArtifacts();

    const result = await buildRouteComparisonFromCli([
      "--year",
      "2026",
      "--month",
      "4",
      "--db",
      dbPath,
    ]);
    const comparison = await Bun.file(result.comparisonPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        routeCount: 2,
        worstRouteId: "T2",
      }),
    );
    expect(comparison.rankedRoutes.map((route: { routeId: string }) => route.routeId)).toEqual([
      "T2",
      "T1",
    ]);
    expect(comparison.rankedRoutes[0]).toEqual(
      expect.objectContaining({
        routeId: "T2",
        routeScore: 20,
        scheduleMatchRate: 0.6667,
        aceActiveDuringAnalysisPeriod: true,
        aceViolationCount: 25,
      }),
    );
  });

  test("excludes routes without observed speed coverage from ranking", async () => {
    await writeFixtureArtifacts();
    await writeBrief("T2", 20, 0, "no_observed_speed");

    const result = await buildRouteComparisonFromCli([
      "--year",
      "2026",
      "--month",
      "4",
      "--db",
      dbPath,
    ]);
    const comparison = await Bun.file(result.comparisonPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        routeCount: 2,
        worstRouteId: "T1",
      }),
    );
    expect(comparison.rankedRoutes.map((route: { routeId: string }) => route.routeId)).toEqual([
      "T1",
    ]);
  });
});
