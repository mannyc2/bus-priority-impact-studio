import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildRouteSpeedSpineArtifact,
  type RouteSpeedSpineSourceRow,
} from "@bp/analytics/feature-history";
import { loadRouteSpeedSpineCrosswalk } from "../src/lib/route-speed-spine-crosswalk.ts";

function artifact(path: string) {
  return buildRouteSpeedSpineArtifact({
    routeId: "B41",
    routeSlug: "b41",
    rows: [
      {
        route_id: "B41",
        month: "2026-03",
        direction: "S",
        stop_order: 34,
        timepoint_stop_id: "303324",
        timepoint_stop_name: "A",
        timepoint_stop_latitude: 40.66,
        timepoint_stop_longitude: -73.95,
        next_timepoint_stop_id: "901681",
        next_timepoint_stop_name: "B",
        next_timepoint_stop_latitude: 40.65,
        next_timepoint_stop_longitude: -73.96,
        source_row_count: 1,
        bus_trip_count: 10,
        average_road_speed_mph: 7,
        average_travel_time_minutes: 4,
        average_road_distance_miles: 0.5,
      } satisfies RouteSpeedSpineSourceRow,
    ],
    generatedAt: "2026-07-11T00:00:00.000Z",
    dbPath: "fixture.sqlite",
    artifactPath: path,
    startMonth: "2026-03",
    endMonth: "2026-03",
    toleranceMeters: 110,
  });
}

describe("route speed-spine crosswalk loader", () => {
  test("distinguishes optional not-built from required missing artifacts", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "spine-loader-"));
    try {
      const optional = await loadRouteSpeedSpineCrosswalk({ artifactRoot: tmp, routeId: "B41" });
      expect(optional.status).toBe("not_built");
      await expect(
        loadRouteSpeedSpineCrosswalk({ artifactRoot: tmp, routeId: "B41", requireSpine: true }),
      ).rejects.toThrow(/required for B41/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("loads an explicit artifact override and rejects legacy or ambiguous aliases", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "spine-loader-"));
    try {
      const path = join(tmp, "custom-spine.json");
      const value = artifact(path);
      await Bun.write(path, JSON.stringify(value));
      const loaded = await loadRouteSpeedSpineCrosswalk({
        artifactRoot: join(tmp, "unused"),
        routeId: "B41",
        spinePath: path,
      });
      expect(loaded.status).toBe("ready");
      if (loaded.status === "ready") expect(loaded.crosswalk.size).toBe(1);

      const legacy = structuredClone(value);
      delete legacy.sourceKeys;
      await Bun.write(path, JSON.stringify(legacy));
      await expect(
        loadRouteSpeedSpineCrosswalk({ artifactRoot: tmp, routeId: "B41", spinePath: path }),
      ).rejects.toThrow(/exact observed source keys are missing/);

      const ambiguous = structuredClone(value);
      const first = ambiguous.segments[0];
      if (first === undefined) throw new Error("Fixture spine has no segment.");
      ambiguous.segments.push({ ...structuredClone(first), segmentId: `${first.segmentId}-other` });
      await Bun.write(path, JSON.stringify(ambiguous));
      await expect(
        loadRouteSpeedSpineCrosswalk({ artifactRoot: tmp, routeId: "B41", spinePath: path }),
      ).rejects.toThrow(new RegExp(`${first.segmentId}.*${first.segmentId}-other`));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
