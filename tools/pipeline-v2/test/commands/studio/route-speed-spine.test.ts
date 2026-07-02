import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeSpeedSpineArtifactPath } from "@bp/analytics/artifacts";
import {
  buildRouteSpeedSpineArtifact,
  type RouteSpeedSpineSourceRow,
} from "@bp/analytics/feature-history";

function row(
  input: Partial<RouteSpeedSpineSourceRow> & {
    month: string;
    direction: string;
    stop_order: number;
    timepoint_stop_id: string;
    timepoint_stop_name: string;
    timepoint_stop_latitude: number;
    timepoint_stop_longitude: number;
    next_timepoint_stop_id: string;
    next_timepoint_stop_name: string;
    next_timepoint_stop_latitude: number;
    next_timepoint_stop_longitude: number;
  },
): RouteSpeedSpineSourceRow {
  return {
    route_id: "B41",
    source_row_count: 10,
    bus_trip_count: 100,
    average_road_speed_mph: 8,
    average_travel_time_minutes: 4,
    average_road_distance_miles: 0.5,
    ...input,
  };
}

describe("studio route speed spine", () => {
  test("collapses nearby renamed timepoints into one geographic segment", () => {
    const artifact = buildRouteSpeedSpineArtifact({
      routeId: "B41",
      rows: [
        row({
          month: "2025-12",
          direction: "N",
          stop_order: 19,
          timepoint_stop_id: "303222",
          timepoint_stop_name: "FLATBUSH AV/TROY AV",
          timepoint_stop_latitude: 40.62492,
          timepoint_stop_longitude: -73.93612,
          next_timepoint_stop_id: "303232",
          next_timepoint_stop_name: "FLATBUSH AV/NOSTRAND AV",
          next_timepoint_stop_latitude: 40.6328,
          next_timepoint_stop_longitude: -73.9475,
        }),
        row({
          month: "2026-01",
          direction: "N",
          stop_order: 19,
          timepoint_stop_id: "303222",
          timepoint_stop_name: "FLATBUSH AV/TROY AV",
          timepoint_stop_latitude: 40.62492,
          timepoint_stop_longitude: -73.93612,
          next_timepoint_stop_id: "307839",
          next_timepoint_stop_name: "FLATBUSH AV / E 31 ST",
          next_timepoint_stop_latitude: 40.63206,
          next_timepoint_stop_longitude: -73.94672,
        }),
      ],
      generatedAt: "2026-06-06T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/studio/v2/routes/b41/speed-spine.json",
      startMonth: "2025-12",
      endMonth: "2026-01",
      toleranceMeters: 125,
    });

    expect(artifact.validation.status).toBe("pass");
    expect(artifact.summary.rawSegmentKeyCount).toBe(2);
    expect(artifact.summary.rawStopPairCount).toBe(2);
    expect(artifact.summary.spineSegmentCount).toBe(1);
    expect(artifact.summary.mergedNodeCount).toBe(1);
    expect(artifact.summary.segmentWithRawVariantCount).toBe(1);
    expect(artifact.segments[0]?.raw.rawStopPairCount).toBe(2);
    expect(artifact.segments[0]?.raw.sourceStopPairs.map((pair) => pair.toStopId).sort()).toEqual([
      "303232",
      "307839",
    ]);
    expect(artifact.monthCoverage.map((month) => month.spineSegmentCount)).toEqual([1, 1]);
  });

  test("keeps the same physical southbound segment stable across stop-order renumbering", () => {
    const artifact = buildRouteSpeedSpineArtifact({
      routeId: "B41",
      rows: [
        row({
          month: "2025-12",
          direction: "S",
          stop_order: 20,
          timepoint_stop_id: "308369",
          timepoint_stop_name: "FLATBUSH AV/CHURCH AV",
          timepoint_stop_latitude: 40.6503,
          timepoint_stop_longitude: -73.9598,
          next_timepoint_stop_id: "303317",
          next_timepoint_stop_name: "FLATBUSH AV/NOSTRAND AV",
          next_timepoint_stop_latitude: 40.6327,
          next_timepoint_stop_longitude: -73.9474,
        }),
        row({
          month: "2026-03",
          direction: "S",
          stop_order: 19,
          timepoint_stop_id: "308369",
          timepoint_stop_name: "FLATBUSH AV/CHURCH AV",
          timepoint_stop_latitude: 40.6503,
          timepoint_stop_longitude: -73.9598,
          next_timepoint_stop_id: "303317",
          next_timepoint_stop_name: "FLATBUSH AV/NOSTRAND AV",
          next_timepoint_stop_latitude: 40.6327,
          next_timepoint_stop_longitude: -73.9474,
        }),
      ],
      generatedAt: "2026-06-06T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/studio/v2/routes/b41/speed-spine.json",
      startMonth: "2025-12",
      endMonth: "2026-03",
      toleranceMeters: 125,
    });

    expect(artifact.summary.rawSegmentKeyCount).toBe(2);
    expect(artifact.summary.rawStopPairCount).toBe(1);
    expect(artifact.summary.spineSegmentCount).toBe(1);
    expect(artifact.segments[0]?.stopOrder).toEqual({
      min: 19,
      median: 19,
      max: 20,
      values: [19, 20],
      changed: true,
    });
    expect(artifact.monthCoverage.map((month) => month.spineSegmentCount)).toEqual([1, 1]);
  });

  test("uses the Studio v2 route speed-spine namespace", () => {
    expect(routeSpeedSpineArtifactPath({ artifactRoot: "data/artifacts", routeSlug: "b41" })).toBe(
      "data/artifacts/studio/v2/routes/b41/speed-spine.json",
    );
  });

  test("keeps the artifact builder and local DB row query out of the command", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../../src/commands/studio/route-speed-spine.ts"),
      "utf8",
    );

    expect(source).toContain('from "@bp/analytics/artifacts"');
    expect(source).toContain('from "@bp/analytics/feature-history"');
    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).not.toContain("function buildNodes");
    expect(source).not.toContain("function buildSegments");
    expect(source).not.toContain("function buildMonthCoverage");
    expect(source).not.toContain("FROM local_route_segment_speed");
    expect(source).not.toContain("haversineMeters");
  });
});
