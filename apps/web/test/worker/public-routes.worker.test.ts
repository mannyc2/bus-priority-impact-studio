/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, SELF } from "cloudflare:test";
import { MapManifestResponseSchema } from "@bp/domain/maps";
import {
  ReleaseStatusResponseSchema,
  RouteCompareResponseSchema,
  RouteListResponseSchema,
  RouteProfileResponseSchema,
  RouteScorecardSchema,
} from "@bp/domain/routes";
import { beforeAll, describe, expect, it } from "vitest";
import type { Env } from "../../src/worker/index.js";
import worker from "../../src/worker/index.js";

type RowValue = string | number | null;
type Row = Record<string, RowValue>;
type PublicRouteTestEnv = Env & {
  DB?: D1Database;
  ARTIFACTS?: R2Bucket;
  GTFS_RT_RAW?: R2Bucket;
  TEST_D1_MIGRATIONS?: unknown;
};

const testEnv = env as unknown as PublicRouteTestEnv;
const sha256 = "a".repeat(64);

const fixtureTables = [
  "route_scorecard_citation",
  "route_scorecard",
  "route_artifact",
  "route_brief_peak_window",
  "route_brief_slowest_window",
  "route_brief_summary",
  "route_observed_reliability_summary",
  "route_month_source_status",
  "route_comparison_rank",
  "route_batch_built_route",
  "route_batch_issue",
  "route_batch_status",
] as const;

function requireDb(): D1Database {
  expect(testEnv.DB).toBeDefined();
  return testEnv.DB as D1Database;
}

function requireArtifacts(): R2Bucket {
  expect(testEnv.ARTIFACTS).toBeDefined();
  return testEnv.ARTIFACTS as R2Bucket;
}

async function insertRow(db: D1Database, tableName: string, row: Row): Promise<void> {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");
  await db
    .prepare(`INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`)
    .bind(...columns.map((column) => row[column]))
    .run();
}

async function resetFixtureTables(db: D1Database): Promise<void> {
  for (const tableName of fixtureTables) {
    await db.prepare(`DELETE FROM ${tableName}`).run();
  }
}

async function seedD1Fixture(): Promise<void> {
  const db = requireDb();
  await resetFixtureTables(db);

  await insertRow(db, "route_batch_status", {
    month: "2026-03",
    generated_at: "2026-04-27T14:45:59.462Z",
    status: "pass",
    route_count: 2,
    artifact_count: 4,
    missing_artifact_count: 0,
    hash_mismatch_count: 0,
    byte_length_mismatch_count: 0,
    total_byte_length: 512,
    issue_count: 0,
  });
  await insertRow(db, "route_batch_built_route", {
    month: "2026-03",
    route_rank: 1,
    route_id: "M57",
    artifact_count: 2,
    status: "built",
  });
  await insertRow(db, "route_batch_built_route", {
    month: "2026-03",
    route_rank: 2,
    route_id: "M15-SBS",
    artifact_count: 2,
    status: "built",
  });

  await insertRow(db, "route_brief_summary", {
    route_id: "M57",
    month: "2026-03",
    route_score: 18,
    public_visible: 1,
    public_visibility_reason: "standard_route",
    average_speed_mph: 5.27,
    hotspot_count: 4,
    total_ridership: 250000,
    total_transfers: 30000,
    ace_active: 1,
    ace_violation_count: 17,
    bus_lane_matched_lane_count: 12,
    schedule_match_rate: 0.96,
  });
  await insertRow(db, "route_brief_summary", {
    route_id: "M15-SBS",
    month: "2026-03",
    route_score: 34,
    public_visible: 1,
    public_visibility_reason: "standard_route",
    average_speed_mph: 7.42,
    hotspot_count: 2,
    total_ridership: 980000,
    total_transfers: 72000,
    ace_active: 0,
    ace_violation_count: 0,
    bus_lane_matched_lane_count: 44,
    schedule_match_rate: 0.98,
  });
  await insertRow(db, "route_brief_peak_window", {
    route_id: "M57",
    month: "2026-03",
    window_rank: 1,
    day_of_week: "Wednesday",
    hour_of_day: 17,
    ridership: 1250,
    transfers: 210,
    matched_observation_count: 88,
    bus_trip_count: 420,
    weighted_average_speed_mph: 5.9,
    slow_observation_share: 0.31,
  });
  await insertRow(db, "route_brief_slowest_window", {
    route_id: "M57",
    month: "2026-03",
    window_rank: 1,
    day_of_week: "Friday",
    hour_of_day: 8,
    observation_count: 55,
    bus_trip_count: 310,
    segment_count: 7,
    weighted_average_speed_mph: 4.4,
    weighted_average_travel_time_minutes: 11.2,
    slow_observation_share: 0.72,
  });

  await insertRow(db, "route_observed_reliability_summary", {
    route_id: "M57",
    month: "2026-03",
    run_id: "fixture-gtfs-rt",
    reliability_status: "observed",
    min_sample_threshold: 3,
    sample_count: 42,
    stop_count: 5,
    direction_count: 2,
    average_observed_headway_minutes: 8.5,
    median_observed_headway_minutes: 8,
    p90_observed_headway_minutes: 15,
    max_observed_headway_minutes: 22,
    scheduled_median_headway_minutes: 10,
    bunching_threshold_minutes: 5,
    long_gap_threshold_minutes: 20,
    observed_bunching_share: 0.12,
    observed_long_gap_share: 0.05,
    expected_wait_minutes: 5.1,
    scheduled_expected_wait_minutes: 5,
    excess_wait_minutes: 0.1,
    wait_reliability_ratio: 1.02,
  });
  await insertRow(db, "route_observed_reliability_summary", {
    route_id: "M15-SBS",
    month: "2026-03",
    run_id: "fixture-gtfs-rt",
    reliability_status: "insufficient_gtfs_rt_samples",
    min_sample_threshold: 3,
    sample_count: 1,
    stop_count: 1,
    direction_count: 1,
    average_observed_headway_minutes: null,
    median_observed_headway_minutes: null,
    p90_observed_headway_minutes: null,
    max_observed_headway_minutes: null,
    scheduled_median_headway_minutes: 7,
    bunching_threshold_minutes: 3.5,
    long_gap_threshold_minutes: 14,
    observed_bunching_share: null,
    observed_long_gap_share: null,
    expected_wait_minutes: null,
    scheduled_expected_wait_minutes: 3.5,
    excess_wait_minutes: null,
    wait_reliability_ratio: null,
  });
  await insertRow(db, "route_month_source_status", {
    route_id: "M57",
    month: "2026-03",
    source_scope: "reliability",
    source_id: "observedHeadways",
    status: "observed",
    row_count: 42,
    snapshot_id: "fixture-gtfs-rt",
    note: null,
  });

  await insertRow(db, "route_comparison_rank", {
    month: "2026-03",
    rank: 1,
    route_id: "M57",
    route_score: 18,
    average_speed_mph: 5.27,
    total_ridership: 250000,
    ace_violation_count: 17,
    bus_lane_matched_lane_count: 12,
  });
  await insertRow(db, "route_comparison_rank", {
    month: "2026-03",
    rank: 2,
    route_id: "M15-SBS",
    route_score: 34,
    average_speed_mph: 7.42,
    total_ridership: 980000,
    ace_violation_count: 0,
    bus_lane_matched_lane_count: 44,
  });

  await insertRow(db, "route_artifact", {
    route_id: "M57",
    month: "2026-03",
    artifact_name: "brief",
    artifact_key: "routes/2026-03/M57/brief.json",
    content_type: "application/json",
    byte_length: 128,
    sha256,
  });
  await insertRow(db, "route_scorecard", {
    route_id: "M57",
    month: "2026-03",
    route_score: 18,
    coverage_status: "full",
    average_speed_mph: 5.27,
    hotspot_count: 4,
  });
  await insertRow(db, "route_scorecard_citation", {
    route_id: "M57",
    month: "2026-03",
    citation_rank: 1,
    source_id: "fixture_mta_speed",
    title: "Fixture MTA speed evidence",
    url: "https://example.test/source/mta-speed",
    verified_at: "2026-04-27T00:00:00.000Z",
  });
}

async function seedR2Fixture(): Promise<void> {
  const artifacts = requireArtifacts();
  const artifactKey = "map/2026-03/routes/M57.segments.geojson";
  await artifacts.put(
    "map/2026-03/manifest.json",
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: "2026-04-27T14:45:59.462Z",
      status: "pass",
      artifactCount: 1,
      routeSegmentArtifactCount: 1,
      totalFeatureCount: 2,
      totalByteLength: 128,
      issueCount: 0,
      artifacts: [
        {
          artifactKind: "route_segments",
          artifactKey,
          contentType: "application/geo+json",
          byteLength: 128,
          sha256,
          featureCount: 2,
          routeId: "M57",
        },
      ],
    }),
    {
      httpMetadata: {
        contentType: "application/json",
      },
    },
  );
  await artifacts.put(artifactKey, '{"type":"FeatureCollection","features":[]}', {
    httpMetadata: {
      contentType: "application/geo+json",
    },
  });
}

async function getJson(path: string): Promise<unknown> {
  const response = await SELF.fetch(new Request(`https://example.test${path}`));
  const body = (await response.json()) as unknown;
  expect(response.status, `${path} returned ${response.status}: ${JSON.stringify(body)}`).toBe(200);
  return body;
}

beforeAll(async () => {
  await seedD1Fixture();
  await seedR2Fixture();
});

describe("Worker public route API smoke", () => {
  it("exposes the production-shaped bindings used by public route APIs", () => {
    expect(testEnv.DB).toBeDefined();
    expect(testEnv.ARTIFACTS).toBeDefined();
    expect(testEnv.GTFS_RT_RAW).toBeDefined();
    expect(testEnv.BRIEF_AUTHOR_AGENT).toBeDefined();
    expect(testEnv.BASELINE_MONTH).toBe("2026-03");
    expect(testEnv.LAST_BUILT_SPEED_MONTH).toBe("2026-03");
    expect(testEnv.TEST_D1_MIGRATIONS).toBeDefined();
  });

  it("serves route status, list, profile, compare, and scorecard from real D1 tables", async () => {
    const status = ReleaseStatusResponseSchema.parse(await getJson("/api/v1/status"));
    expect(status.baselineMonth).toBe("2026-03");
    expect(status.canonicalMonthlyRelease.routeCount).toBe(2);
    expect(status.observedRealtimeEvidence.observedRouteCount).toBe(1);

    const routes = RouteListResponseSchema.parse(await getJson("/api/v1/routes?limit=2"));
    expect(routes.routes.map((route) => route.routeId)).toEqual(["M57", "M15-SBS"]);
    expect(routes.routes[0]).toEqual(
      expect.objectContaining({
        routeId: "M57",
        reliabilityStatus: "observed",
        sampleCount: 42,
      }),
    );

    const profile = RouteProfileResponseSchema.parse(await getJson("/api/v1/routes/m57/profile"));
    expect(profile.route.routeId).toBe("M57");
    expect(profile.peakRidership?.hourOfDay).toBe(17);
    expect(profile.observedReliability?.observedBunchingShare).toBe(0.12);
    expect(profile.artifacts).toEqual([
      expect.objectContaining({
        name: "brief",
        key: "routes/2026-03/M57/brief.json",
      }),
    ]);

    const compare = RouteCompareResponseSchema.parse(
      await getJson("/api/v1/compare?a=m57&b=m15-sbs"),
    );
    expect(compare.routes.map((route) => route.routeId)).toEqual(["M57", "M15-SBS"]);
    expect(compare.deltas.routeScore).toBe(16);

    const scorecard = RouteScorecardSchema.parse(
      await getJson("/api/routes/m57/scorecard?month=2026-03"),
    );
    expect(scorecard.routeId).toBe("M57");
    expect(scorecard.citations[0]?.sourceId).toBe("fixture_mta_speed");
  });

  it("serves R2 map manifests and artifacts through the Worker", async () => {
    const manifest = MapManifestResponseSchema.parse(await getJson("/api/v1/map/manifest"));
    expect(manifest.artifacts[0]).toEqual(
      expect.objectContaining({
        routeId: "M57",
        apiPath: "/api/v1/artifacts/map/2026-03/routes/M57.segments.geojson",
      }),
    );

    const artifact = await SELF.fetch(
      new Request("https://example.test/api/v1/artifacts/map/2026-03/routes/M57.segments.geojson"),
    );
    expect(artifact.status).toBe(200);
    expect(artifact.headers.get("Content-Type")).toContain("application/geo+json");
    expect(artifact.headers.get("Cache-Control")).toContain("immutable");
    expect(await artifact.json()).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("reports missing API bindings as explicit 503 responses", async () => {
    const routeResponse = await worker.fetch(
      new Request("https://example.test/api/v1/routes"),
      {} satisfies Env,
    );
    expect(routeResponse.status).toBe(503);
    expect(await routeResponse.json()).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "SERVICE_UNAVAILABLE",
          message: expect.stringMatching(/D1 binding/i),
        }),
      }),
    );

    const mapResponse = await worker.fetch(
      new Request("https://example.test/api/v1/map/manifest"),
      {} satisfies Env,
    );
    expect(mapResponse.status).toBe(503);
    expect(await mapResponse.json()).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "SERVICE_UNAVAILABLE",
          message: expect.stringMatching(/ARTIFACTS R2 binding/i),
        }),
      }),
    );
  });
});
