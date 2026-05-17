import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  listRouteMonthSourceStatuses,
  listRouteObservedReliabilitySummaries,
  replaceRouteCatalog,
} from "@bp/db/local";
import { importBusObservatoryReliabilitySummary } from "../src/jobs/ingest/import-bus-observatory-reliability-summary.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const testRoot = fromRepoRoot(join("data/working/test-import-bus-observatory-reliability-summary"));
const dbPath = join(testRoot, "pipeline.sqlite");
const csvPath = join(testRoot, "route-observed-reliability-summary.csv");

async function writeFixtureCsv(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(
    path,
    [
      [
        "route_id",
        "month",
        "run_id",
        "reliability_status",
        "min_sample_threshold",
        "sample_count",
        "stop_count",
        "direction_count",
        "average_observed_headway_minutes",
        "median_observed_headway_minutes",
        "p90_observed_headway_minutes",
        "max_observed_headway_minutes",
        "scheduled_median_headway_minutes",
        "bunching_threshold_minutes",
        "long_gap_threshold_minutes",
        "observed_bunching_share",
        "observed_long_gap_share",
        "expected_wait_minutes",
        "scheduled_expected_wait_minutes",
        "excess_wait_minutes",
        "wait_reliability_ratio",
      ].join(","),
      "B46-SBS,2026-03,bus-observatory-2026-03,observed,30,42,12,2,8.5,7.25,14.5,22.0,,3,20,0.04,0.08,5.1,,,",
    ].join("\n"),
  );
}

async function removeFixtureArtifacts(): Promise<void> {
  await rm(testRoot, { force: true, recursive: true });
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("Bus Observatory observed reliability summary import", () => {
  test("loads recovered route summaries and fills missing catalog routes as insufficient", async () => {
    await removeFixtureArtifacts();
    await writeFixtureCsv(csvPath);

    const local = await openLocalPipelineDb(dbPath);
    await replaceRouteCatalog(local.db, [
      {
        routeId: "B46-SBS",
        routeShortName: "B46-SBS",
        routeLongName: "Kings Plaza - Williamsburg Bridge Plaza",
        routeTypes: ["SBS"],
        directions: ["Northbound", "Southbound"],
        shapeCount: 1,
        stopCount: 2,
        timepointStopCount: 2,
        latitudeMin: null,
        latitudeMax: null,
        longitudeMin: null,
        longitudeMax: null,
      },
      {
        routeId: "M15-SBS",
        routeShortName: "M15-SBS",
        routeLongName: "Select Bus Service First/Second Avenues",
        routeTypes: ["SBS"],
        directions: ["Northbound", "Southbound"],
        shapeCount: 1,
        stopCount: 2,
        timepointStopCount: 2,
        latitudeMin: null,
        latitudeMax: null,
        longitudeMin: null,
        longitudeMax: null,
      },
    ]);
    local.sqlite.close();

    const result = await importBusObservatoryReliabilitySummary({
      dbPath,
      year: 2026,
      month: 3,
      runId: "bus-observatory-2026-03",
      summaryCsv: csvPath,
    });

    const verify = await openLocalPipelineDb(dbPath);
    const summaries = await listRouteObservedReliabilitySummaries(
      verify.db,
      "2026-03",
      "bus-observatory-2026-03",
    );
    const sourceStatuses = await listRouteMonthSourceStatuses(verify.db, "2026-03");
    verify.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        routeCount: 2,
        observedRouteCount: 1,
        insufficientRouteCount: 1,
        sampleCount: 42,
      }),
    );
    expect(summaries.map((summary) => [summary.routeId, summary.reliabilityStatus])).toEqual([
      ["B46-SBS", "observed"],
      ["M15-SBS", "insufficient_gtfs_rt_samples"],
    ]);
    expect(sourceStatuses).toHaveLength(6);
    expect(sourceStatuses.find((status) => status.routeId === "B46-SBS")?.status).toBe("available");
    expect(sourceStatuses.find((status) => status.routeId === "M15-SBS")?.status).toBe(
      "insufficient_samples",
    );
  });
});
