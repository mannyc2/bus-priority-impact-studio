import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { listRouteCatalog } from "@bp/db/local";
import { ingestRouteCatalog } from "../src/jobs/ingest/ingest-route-catalog.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const rawDir = fromRepoRoot(join("data/fixtures/ingest-route-catalog/raw-network"));
const workingDir = fromRepoRoot(join("data/fixtures/ingest-route-catalog/working-network"));
const dbPath = fromRepoRoot(join("data/fixtures/ingest-route-catalog/pipeline.sqlite"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(rawDir, { force: true, recursive: true }),
    rm(workingDir, { force: true, recursive: true }),
    rm(dbPath, { force: true }),
  ]);
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route catalog ingestion", () => {
  test("fetches all active current routes and stops into a route catalog", async () => {
    const result = await ingestRouteCatalog({
      fetchedAt: new Date("2026-04-27T12:00:00.000Z"),
      rawDir,
      workingDir,
      dbPath,
      fetcher: async (input) => {
        const url = new URL(String(input));

        if (url.pathname.includes("h2wf-afav")) {
          return Response.json([
            {
              route_id: "M1",
              route_short_name: "M1",
              route_long_name: "Harlem - East Village",
              in_effect: "true",
              direction_id: "0",
              direction: "N",
              shape_id: "M010110",
              route_type: "Local",
              trip_type: "Local",
              bundle: "202604",
            },
          ]);
        }

        return Response.json([
          {
            route_id: "M1",
            route_short_name: "M1",
            stop_id: "404191",
            stop_name: "MADISON AV/E 95 ST",
            in_effect: "true",
            direction_id: "0",
            direction: "N",
            timepoint: "1",
            latitude: "40.786932",
            longitude: "-73.954292",
          },
          {
            route_id: "M1",
            route_short_name: "M1",
            stop_id: "404192",
            stop_name: "MADISON AV/E 96 ST",
            in_effect: "true",
            direction_id: "0",
            direction: "N",
            timepoint: "0",
            latitude: "40.787",
            longitude: "-73.955",
          },
        ]);
      },
    });
    const summary = await Bun.file(result.summaryPath).json();
    const local = await openLocalPipelineDb(dbPath);
    const localCatalog = await listRouteCatalog(local.db);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        routeCount: 1,
        shapeCount: 1,
        stopCount: 2,
        timepointStopCount: 1,
      }),
    );
    expect(localCatalog[0]).toEqual(
      expect.objectContaining({
        routeId: "M1",
        routeLongName: "Harlem - East Village",
        shapeCount: 1,
        stopCount: 2,
        timepointStopCount: 1,
        latitudeMin: 40.786932,
        latitudeMax: 40.787,
      }),
    );
    expect(summary.routeCount).toBe(1);
    expect(localCatalog).toEqual([
      expect.objectContaining({
        routeId: "M1",
        routeTypes: ["Local"],
        directions: ["N"],
      }),
    ]);
  });
});
