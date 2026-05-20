import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildSignalFeatures,
  signalFeaturesArtifactPath,
} from "../src/jobs/build/signal-features.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const dbPath = fromRepoRoot(join("data/working/test-signal-features/pipeline.sqlite"));
const artifactRoot = fromRepoRoot(join("data/working/test-signal-features/artifacts"));

async function resetDb(): Promise<void> {
  await rm(dirname(dbPath), { recursive: true, force: true });
}

function insert(sqlite: Database, table: string, row: Record<string, string | number | null>) {
  const columns = Object.keys(row);
  sqlite
    .query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    )
    .run(...columns.map((column) => row[column] ?? null));
}

afterEach(async () => {
  await resetDb();
});

describe("findings:signal-features", () => {
  test("builds route-month signal features with permit provenance and detector preview", async () => {
    await resetDb();
    const local = await openLocalPipelineDb(dbPath);
    try {
      insert(local.sqlite, "local_route_catalog", {
        route_id: "M15",
        route_short_name: "M15",
        route_long_name: null,
        shape_count: 1,
        stop_count: 2,
        timepoint_stop_count: 2,
        latitude_min: null,
        latitude_max: null,
        longitude_min: null,
        longitude_max: null,
      });
      insert(local.sqlite, "local_route_hotspot_summary", {
        route_id: "M15",
        month: "2026-03",
        generated_at: "2026-05-20T00:00:00.000Z",
        route_weighted_average_speed_mph: 5.2,
        observation_count: 700,
        bus_trip_count: 1200,
        ridership_weighted: 1,
        ridership_window_count: 4,
        ridership_matched_observation_count: 4,
        ridership_exposure: 10000,
        segment_count: 2,
        hotspot_count: 1,
      });
      insert(local.sqlite, "local_route_hotspot", {
        route_id: "M15",
        month: "2026-03",
        hotspot_rank: 1,
        segment_id: "M15:2026-03:S:1",
        direction: "S",
        stop_order: 1,
        timepoint_stop_id: "s1",
        timepoint_stop_name: "A",
        next_timepoint_stop_id: "s2",
        next_timepoint_stop_name: "B",
        observation_count: 70,
        bus_trip_count: 200,
        weighted_average_speed_mph: 4.5,
        weighted_average_travel_time_minutes: 5,
        average_road_distance_miles: 0.2,
        slow_window_share: 0.9,
        speed_severity: 0.8,
        hotspot_score: 88,
        ridership_exposure: 10000,
        transfer_exposure: null,
        rider_delay_index: null,
        rider_impact_share: null,
        rider_weighted_speed_severity: null,
        rider_weighted_slow_window_share: null,
        rider_impact_score: 91,
      });
      for (let index = 0; index < 30; index += 1) {
        insert(local.sqlite, "local_context_event_route_touch", {
          event_id: `permit-${index}`,
          route_id: "M15",
          source_id: "nyc_dot_street_construction_permits",
          event_kind: "permit",
          occurred_at: "2026-03-10T00:00:00",
          ended_at: "2026-03-11T00:00:00",
          physical_id: `p${index}`,
          touch_kind: "route_lion_link",
          evidence_role: "context",
          overlap_meters: 10,
          buffer_meters: 25,
          route_fanout: 1,
          match_weight: 1,
          computed_at: "2026-05-20T00:00:00.000Z",
        });
      }
    } finally {
      local.sqlite.close();
    }

    const result = await buildSignalFeatures({ year: 2026, month: 3, dbPath, artifactRoot });
    const artifact = await Bun.file(signalFeaturesArtifactPath(artifactRoot, "2026-03")).json();

    expect(result.featureCount).toBe(1);
    expect(result.detectorCandidateCount).toBe(1);
    expect(artifact.features[0]).toMatchObject({
      routeId: "M15",
      scope: "route",
      window: "all_day",
      permitTouchedEventCount: 30,
      uncertainty: { speedObservationCount: 700, permitTouchedEventCount: 30 },
      provenance: { derivationVersion: "route_month_signal_features.v1" },
    });
    expect(artifact.detectorPreview.candidates[0].detectorId).toBe("permit_correlated_slowdown");
  });
});
