import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  routeSpeedHistoryArtifactPath,
  routeSpeedHistoryManifestPath,
  routeSpeedSpineArtifactPath,
  routeSpeedSpineManifestPath,
} from "@bp/applied-research/artifacts";
import {
  buildRouteSpeedSpineArtifact,
  type RouteSpeedHistoryArtifact,
  type RouteSpeedSpineSourceRow,
} from "@bp/applied-research/feature-history";
import { runRouteSpeedHistories } from "../../../src/commands/studio/route-speed-histories.ts";
import { writeJson } from "../../../src/lib/json.ts";
import { fromRepoRoot } from "../../../src/lib/paths.ts";
import type { OpenLocalPipelineDb } from "../../../src/lib/local-db.ts";

function sourceRow(input: { month: string; hourOfDay: number; speedMph: number }) {
  return {
    route_id: "B41",
    month: input.month,
    direction: "N",
    stop_order: 10,
    timepoint_stop_id: "a",
    timepoint_stop_name: "A",
    timepoint_stop_latitude: 40.65,
    timepoint_stop_longitude: -73.95,
    next_timepoint_stop_id: "b",
    next_timepoint_stop_name: "B",
    next_timepoint_stop_latitude: 40.66,
    next_timepoint_stop_longitude: -73.94,
    source_row_count: 1,
    bus_trip_count: 20,
    average_road_speed_mph: input.speedMph,
    average_travel_time_minutes: 3,
    average_road_distance_miles: 0.5,
    hour_of_day: input.hourOfDay,
  };
}

function insertSpeedRows(sqlite: Database): void {
  sqlite.exec(`
    CREATE TABLE local_route_segment_speed (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      direction TEXT NOT NULL,
      stop_order INTEGER NOT NULL,
      timepoint_stop_id TEXT,
      next_timepoint_stop_id TEXT,
      hour_of_day INTEGER NOT NULL,
      bus_trip_count INTEGER NOT NULL,
      average_road_speed_mph REAL,
      average_travel_time_minutes REAL,
      road_distance_miles REAL
    )
  `);
  const insert = sqlite.query(`
    INSERT INTO local_route_segment_speed (
      route_id,
      month,
      direction,
      stop_order,
      timepoint_stop_id,
      next_timepoint_stop_id,
      hour_of_day,
      bus_trip_count,
      average_road_speed_mph,
      average_travel_time_minutes,
      road_distance_miles
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run("B41", "2026-01", "N", 10, "a", "b", 8, 20, 8, 3, 0.5);
}

async function seedSpineManifest(input: {
  artifactRoot: string;
  startMonth: string;
  endMonth: string;
}): Promise<void> {
  const spinePath = routeSpeedSpineArtifactPath({
    artifactRoot: input.artifactRoot,
    routeSlug: "b41",
  });
  const spine = buildRouteSpeedSpineArtifact({
    routeId: "B41",
    routeSlug: "b41",
    rows: [
      sourceRow({ month: input.startMonth, hourOfDay: 8, speedMph: 8 }) as RouteSpeedSpineSourceRow,
    ],
    generatedAt: "2026-06-06T00:00:00.000Z",
    dbPath: "data/local/pipeline.sqlite",
    artifactPath: spinePath,
    startMonth: input.startMonth,
    endMonth: input.endMonth,
    toleranceMeters: 110,
  });
  await mkdir(dirname(spinePath), { recursive: true });
  await writeJson(spinePath, spine);

  const manifestPath = routeSpeedSpineManifestPath({
    artifactRoot: input.artifactRoot,
    startMonth: input.startMonth,
    endMonth: input.endMonth,
  });
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeJson(manifestPath, {
    artifactKind: "studio_route_speed_spine_manifest",
    schemaVersion: 1,
    generatedAt: "2026-06-06T00:00:00.000Z",
    source: {
      table: "local_route_segment_speed",
      dbPath: "data/local/pipeline.sqlite",
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      toleranceMeters: 110,
      artifactRoot: input.artifactRoot,
      manifestPath,
      routeUniverse: "local_route_segment_speed_distinct_routes",
    },
    summary: {},
    routes: [
      {
        routeId: "B41",
        routeSlug: "b41",
        inCurrentCatalog: true,
        readiness: "series_ready",
        reasons: [],
        artifactPath: spinePath,
        artifactWritten: true,
      },
    ],
  });
}

describe("studio route speed histories manifest", () => {
  test("keeps batch manifest policy in applied-research", () => {
    const source = readFileSync(
      fromRepoRoot("tools/pipeline-v2/src/commands/studio/route-speed-histories.ts"),
      "utf8",
    );

    expect(source).not.toContain("function batchSummary");
    expect(source).not.toContain("function routeSpeedHistoryManifestPath");
    expect(source).not.toContain("type RouteSpeedHistoryBatchManifest");
    expect(source).toContain("buildRouteSpeedHistoryBatchManifest");
  });

  test("builds eligible route artifacts from the spine manifest and resumes by skipping existing output", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "route-speed-histories-"));
    const sqlite = new Database(":memory:");
    try {
      const artifactRoot = join(tmp, "artifacts");
      const startMonth = "2026-01";
      const endMonth = "2026-01";
      insertSpeedRows(sqlite);
      await seedSpineManifest({ artifactRoot, startMonth, endMonth });
      const local = {
        db: null,
        sqlite,
        path: join(tmp, "pipeline.sqlite"),
        spatialite: null,
      } as unknown as OpenLocalPipelineDb;

      const first = await runRouteSpeedHistories({
        local,
        artifactRoot,
        startMonth,
        endMonth,
        generatedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(first).toMatchObject({
        routeCount: 1,
        writtenRouteCount: 1,
        skippedExistingRouteCount: 0,
        failedRouteCount: 0,
        artifactReadyRouteCount: 1,
      });
      const historyPath = routeSpeedHistoryArtifactPath({ artifactRoot, routeSlug: "b41" });
      const history = (await Bun.file(historyPath).json()) as RouteSpeedHistoryArtifact;
      expect(history.summary).toMatchObject({
        cellCount: 4,
        expectedCellCount: 4,
        availableCellCount: 1,
        missingCellCount: 3,
        notExpectedCellCount: 0,
      });

      const second = await runRouteSpeedHistories({
        local,
        artifactRoot,
        startMonth,
        endMonth,
        generatedAt: "2026-06-06T00:01:00.000Z",
      });

      expect(second).toMatchObject({
        routeCount: 1,
        writtenRouteCount: 0,
        skippedExistingRouteCount: 1,
        failedRouteCount: 0,
        artifactReadyRouteCount: 1,
      });
      const manifest = await Bun.file(
        routeSpeedHistoryManifestPath({ artifactRoot, startMonth, endMonth }),
      ).json();
      expect(manifest.routes[0]).toEqual(
        expect.objectContaining({
          routeId: "B41",
          routeSlug: "b41",
          status: "skipped_existing",
        }),
      );

      await Bun.write(historyPath, "{not valid json");
      const third = await runRouteSpeedHistories({
        local,
        artifactRoot,
        startMonth,
        endMonth,
        generatedAt: "2026-06-06T00:02:00.000Z",
      });

      expect(third).toMatchObject({
        routeCount: 1,
        writtenRouteCount: 1,
        skippedExistingRouteCount: 0,
        failedRouteCount: 0,
        artifactReadyRouteCount: 1,
      });
    } finally {
      sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
