/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, SELF } from "cloudflare:test";
import { createHash } from "node:crypto";
import { MapManifestResponseSchema } from "@bp/domain/maps";
import { ReleaseStatusResponseSchema } from "@bp/domain/routes";
import { StudioRouteIndex3ResponseSchema } from "@bp/domain/studio/snapshots";
import { beforeAll, describe, expect, it } from "vitest";
import type { Env } from "../../src/worker/index.js";
import worker from "../../src/worker/index.js";
import { decodeSchemaStrict } from "../schema-decode.js";

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
const candidateId = "b".repeat(64);
const candidateManifestSha256 = "c".repeat(64);

const fixtureTables = [
  "exact_route_identity_release",
  "route_catalog_trip_type",
  "route_catalog_type",
  "route_catalog",
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
  "map_release_catalog",
] as const;

const mapReleaseId = "pub_20260719T123456789Z";
const mapPublishedAt = "2026-07-19T12:34:56.789Z";
const mapCoverage = { start: "2023-04", end: "2026-03" } as const;
const mapArtifactBody = '{"type":"FeatureCollection","features":[]}';
const mapArtifactSha256 = createHash("sha256").update(mapArtifactBody).digest("hex");
const mapArtifactKey = "map/2026-03/routes/m57.segments.geojson";
const mapArtifactPhysicalKey = `map/objects/${mapArtifactSha256}/M57.segments.geojson`;
const mapManifestBody = JSON.stringify({
  schemaVersion: 2,
  artifactKind: "map_artifact_manifest",
  releaseId: mapReleaseId,
  publishedAt: mapPublishedAt,
  coverage: mapCoverage,
  releaseProfile: "full",
  buildStatus: "pass",
  verificationStatus: "pass",
  routeFacts: {
    status: "available",
    artifactKey: "studio/v1/map-route-facts.json",
    sha256,
    schemaVersion: 2,
    releaseId: mapReleaseId,
    publishedAt: mapPublishedAt,
    coverage: mapCoverage,
    routeCount: 1,
    byteLength: 128,
    gzipByteLength: 96,
  },
  sources: [],
  layers: [],
  routeUniverse: {
    includedRouteTypes: ["Local", "Limited", "SBS"],
    excludedRouteTypes: ["Express", "School"],
    expectedRouteIds: ["M57"],
    geometryRouteIds: ["M57"],
    routeSegmentRouteIds: ["M57"],
    routeFactRouteIds: ["M57"],
  },
  status: "pass",
  artifactCount: 1,
  routeSegmentArtifactCount: 1,
  totalFeatureCount: 2,
  totalByteLength: 128,
  issueCount: 0,
  artifacts: [
    {
      artifactKind: "map_route_segments_geojson",
      artifactKey: mapArtifactKey,
      contentType: "application/geo+json",
      byteLength: 128,
      gzipByteLength: 96,
      sha256: mapArtifactSha256,
      featureCount: 2,
      coordinateCount: 8,
      routeId: "M57",
    },
  ],
});
const mapManifestSha256 = createHash("sha256").update(mapManifestBody).digest("hex");
const mapManifestKey = "map/2026-03/manifest.json";
const mapManifestPhysicalKey = `map/objects/${mapManifestSha256}/manifest.json`;
const capabilityManifestKey = "studio/v2/routes/route-capability-manifest.json";
const capabilityManifestBody = JSON.stringify({
  artifactKind: "route_capability_manifest",
  schemaVersion: 2,
  generatedAt: mapPublishedAt,
  releaseId: mapReleaseId,
  publishedAt: mapPublishedAt,
  coverage: { start: null, end: mapCoverage.end },
  routes: [],
});
const capabilityManifestSha256 = createHash("sha256").update(capabilityManifestBody).digest("hex");
const capabilityManifestPhysicalKey = `studio/objects/${capabilityManifestSha256}/route-capability-manifest.json`;

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

async function seedExactRouteRegistry(db: D1Database): Promise<void> {
  await insertRow(db, "exact_route_identity_release", {
    release_id: mapReleaseId,
    published_at: mapPublishedAt,
    coverage_start: null,
    coverage_end: "2026-03",
    source_wiki_release: "v1-worker-fixture",
    source_manifest_sha256: "1".repeat(64),
    source_route_identity_sha256: "2".repeat(64),
    source_current_bus_routes_sha256: "3".repeat(64),
    source_index_sha256: "4".repeat(64),
    catalog_snapshot_sha256: "5".repeat(64),
    projection_sha256: "6".repeat(64),
    exact_route_count: 4,
    route_type_count: 4,
    trip_type_count: 4,
  });
}

async function seedD1Fixture(): Promise<void> {
  const db = requireDb();
  await resetFixtureTables(db);

  await insertRow(db, "route_batch_status", {
    month: "2026-03",
    generated_at: mapPublishedAt,
    status: "pass",
    route_count: 2,
    artifact_count: 4,
    missing_artifact_count: 0,
    hash_mismatch_count: 0,
    byte_length_mismatch_count: 0,
    total_byte_length: 512,
    issue_count: 0,
  });
  for (const route of [
    {
      routeId: "M57",
      shortName: "M57",
      longName: "East Side - West Side",
      routeType: "Local",
      tripType: "1",
    },
    {
      routeId: "M15-SBS",
      shortName: "M15-SBS",
      longName: "East Harlem - South Ferry",
      routeType: "SBS",
      tripType: "14",
    },
    {
      routeId: "B44",
      shortName: "B44",
      longName: "Sheepshead Bay - Williamsburg",
      routeType: "Local",
      tripType: "1",
    },
    {
      routeId: "B44+",
      shortName: "B44-SBS",
      longName: "Sheepshead Bay - Williamsburg",
      routeType: "SBS",
      tripType: "14",
    },
  ]) {
    await insertRow(db, "route_catalog", {
      route_id: route.routeId,
      route_short_name: route.shortName,
      route_long_name: route.longName,
      shape_count: 1,
      stop_count: 1,
      timepoint_stop_count: 1,
    });
    await insertRow(db, "route_catalog_type", {
      route_id: route.routeId,
      type_rank: 1,
      route_type: route.routeType,
    });
    await insertRow(db, "route_catalog_trip_type", {
      route_id: route.routeId,
      trip_type_rank: 1,
      trip_type: route.tripType,
    });
  }
  await seedExactRouteRegistry(db);
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
  await insertRow(db, "map_release_catalog", {
    release_id: mapReleaseId,
    published_at: mapPublishedAt,
    coverage_start: mapCoverage.start,
    coverage_end: mapCoverage.end,
    manifest_key: mapManifestKey,
    manifest_sha256: mapManifestSha256,
    release_profile: "full",
    verification_status: "pass",
    route_count: 1,
  });
  await insertRow(db, "map_release_catalog", {
    release_id: "pub_20260718T123456789Z",
    published_at: "2026-07-18T12:34:56.789Z",
    coverage_start: mapCoverage.start,
    coverage_end: mapCoverage.end,
    manifest_key: `map/2026-03/manifest.${"d".repeat(64)}.json`,
    manifest_sha256: "d".repeat(64),
    release_profile: "full",
    verification_status: "pass",
    route_count: 1,
  });
  await insertRow(db, "map_release_catalog", {
    release_id: "pub_20260720T123456789Z",
    published_at: "2026-07-20T12:34:56.789Z",
    coverage_start: mapCoverage.start,
    coverage_end: mapCoverage.end,
    manifest_key: `map/2026-03/manifest.${"e".repeat(64)}.json`,
    manifest_sha256: "e".repeat(64),
    release_profile: "demo",
    verification_status: "pass",
    route_count: 1,
  });
  await insertRow(db, "map_release_catalog", {
    release_id: "pub_20260721T123456789Z",
    published_at: "2026-07-21T12:34:56.789Z",
    coverage_start: mapCoverage.start,
    coverage_end: mapCoverage.end,
    manifest_key: `map/2026-03/manifest.${"f".repeat(64)}.json`,
    manifest_sha256: "f".repeat(64),
    release_profile: "full",
    verification_status: "fail",
    route_count: 1,
  });

  await seedPointedServingFixture(db);
}

async function seedPointedServingFixture(db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO serving_candidate(
        candidate_id, state, schema_version, semantic_input_fingerprint, source_commit,
        canonical_manifest_key, canonical_manifest_sha256, projection_schema, projection_sha256,
        exact_identity_projection_sha256, exact_identity_route_count, expected_dataset_count,
        expected_artifact_count, expected_d1_table_count, created_at
      ) VALUES (?, 'staging', 1, ?, ?, ?, ?, ?, ?, ?, 4, 1, 3, 0, ?)`,
    )
    .bind(
      candidateId,
      "1".repeat(64),
      "2".repeat(40),
      `serving/candidates/${candidateId}/candidate.manifest.json`,
      candidateManifestSha256,
      "bp.serving.d1.v2",
      "3".repeat(64),
      "6".repeat(64),
      mapPublishedAt,
    )
    .run();
  await insertRow(db, "serving_candidate_builder", {
    candidate_id: candidateId,
    builder_rank: 0,
    name: "worker-fixture",
    version: "1",
  });
  await insertRow(db, "serving_candidate_dataset", {
    candidate_id: candidateId,
    dataset_id: "reviewed-serving",
    grain: "month",
    coverage_start: null,
    coverage_end: mapCoverage.end,
    source_snapshot_ids_json: "[]",
    source_ids_json: "[]",
    missing_intervals_json: "[]",
  });
  for (const artifact of [
    {
      logicalId: mapManifestKey,
      key: mapManifestPhysicalKey,
      sha256: mapManifestSha256,
      bytes: new TextEncoder().encode(mapManifestBody).byteLength,
      mediaType: "application/json",
      schemaId: "bp.map.manifest.v2",
    },
    {
      logicalId: mapArtifactKey,
      key: mapArtifactPhysicalKey,
      sha256: mapArtifactSha256,
      bytes: new TextEncoder().encode(mapArtifactBody).byteLength,
      mediaType: "application/geo+json",
      schemaId: "bp.map.route-segments.v1",
    },
    {
      logicalId: capabilityManifestKey,
      key: capabilityManifestPhysicalKey,
      sha256: capabilityManifestSha256,
      bytes: new TextEncoder().encode(capabilityManifestBody).byteLength,
      mediaType: "application/json",
      schemaId: "bp.studio.route_capability_manifest.v2",
    },
  ]) {
    await insertRow(db, "serving_candidate_artifact", {
      candidate_id: candidateId,
      logical_id: artifact.logicalId,
      physical_key: artifact.key,
      sha256: artifact.sha256,
      byte_length: artifact.bytes,
      media_type: artifact.mediaType,
      schema_id: artifact.schemaId,
      verified_at: mapPublishedAt,
    });
  }
  for (const table of fixtureTables) {
    await db.prepare(`INSERT INTO ${table}_v2 SELECT *, ? FROM ${table}`).bind(candidateId).run();
  }
  await db
    .prepare("UPDATE serving_candidate SET state = 'ready', ready_at = ? WHERE candidate_id = ?")
    .bind(mapPublishedAt, candidateId)
    .run();
  await insertRow(db, "serving_activation_intent", {
    operation_id: "worker-fixture-activation",
    state: "prepared",
    expected_release_id: null,
    expected_generation: 0,
    release_id: mapReleaseId,
    candidate_id: candidateId,
    published_at: mapPublishedAt,
    activated_at: mapPublishedAt,
    canonical_manifest_sha256: candidateManifestSha256,
    new_generation: 1,
    created_at: mapPublishedAt,
    committed_at: null,
  });
  await insertRow(db, "serving_release", {
    release_id: mapReleaseId,
    candidate_id: candidateId,
    published_at: mapPublishedAt,
    activated_at: mapPublishedAt,
    retained_public: 1,
    canonical_manifest_sha256: candidateManifestSha256,
    operation_id: "worker-fixture-activation",
  });
  await db
    .prepare(
      "UPDATE serving_active_release SET release_id = ?, generation = 1, last_operation_id = ? WHERE singleton_id = 1",
    )
    .bind(mapReleaseId, "worker-fixture-activation")
    .run();
}

async function seedR2Fixture(): Promise<void> {
  const artifacts = requireArtifacts();
  await artifacts.put(mapManifestPhysicalKey, mapManifestBody, {
    httpMetadata: {
      contentType: "application/json",
    },
    customMetadata: { sha256: mapManifestSha256 },
  });
  await artifacts.put(mapArtifactPhysicalKey, mapArtifactBody, {
    httpMetadata: {
      contentType: "application/geo+json",
    },
    customMetadata: { sha256: mapArtifactSha256 },
  });
  await artifacts.put(capabilityManifestPhysicalKey, capabilityManifestBody, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { sha256: capabilityManifestSha256 },
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
    expect(testEnv.TEST_D1_MIGRATIONS).toBeDefined();
  });

  it("serves release status from real D1 tables", async () => {
    const status = decodeSchemaStrict(ReleaseStatusResponseSchema, await getJson("/api/v1/status"));
    expect(status.coverage.end).toBe("2026-03");
    expect(status.release.routeCount).toBe(2);
    expect(status.observedRealtimeEvidence.observedRouteCount).toBe(1);
  });

  it("keeps public route reads public without a session or with a garbage session", async () => {
    for (const cookie of [null, "bp_session=garbage"] as const) {
      const statusResponse = await SELF.fetch(
        new Request("https://example.test/api/v1/status", {
          headers: cookie === null ? {} : { Cookie: cookie },
        }),
      );
      const status = decodeSchemaStrict(ReleaseStatusResponseSchema, await statusResponse.json());

      expect(statusResponse.status).toBe(200);
      expect(status.coverage.end).toBe("2026-03");

      const studioRoutesResponse = await SELF.fetch(
        new Request("https://example.test/api/v1/studio/routes?schema=3", {
          headers: cookie === null ? {} : { Cookie: cookie },
        }),
      );
      const studioRoutes = decodeSchemaStrict(
        StudioRouteIndex3ResponseSchema,
        await studioRoutesResponse.json(),
      );

      expect(studioRoutesResponse.status).toBe(200);
      expect(studioRoutes.schemaVersion).toBe(3);
      expect(studioRoutes.routes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            routeId: "B44",
            slug: "b44",
            displayLabel: "B44",
            tripTypes: ["1"],
          }),
          expect.objectContaining({
            routeId: "B44+",
            slug: "b44-sbs",
            displayLabel: "B44-SBS",
            tripTypes: ["14"],
          }),
        ]),
      );
    }
  });

  it("keeps candidate-scoped exact identity independent of the legacy registry", async () => {
    const db = requireDb();
    await db.prepare("DELETE FROM exact_route_identity_release").run();
    try {
      const [legacy, exact] = await Promise.all([
        SELF.fetch("https://example.test/api/v1/studio/routes?schema=2"),
        SELF.fetch("https://example.test/api/v1/studio/routes?schema=3"),
      ]);
      expect(legacy.status).toBe(200);
      expect(exact.status).toBe(200);
      expect(
        decodeSchemaStrict(StudioRouteIndex3ResponseSchema, await exact.json()).routes,
      ).toEqual(expect.arrayContaining([expect.objectContaining({ routeId: "B44+" })]));
    } finally {
      await seedExactRouteRegistry(db);
    }
  });

  it("serves R2 map manifests and artifacts through the Worker", async () => {
    const manifest = decodeSchemaStrict(
      MapManifestResponseSchema,
      await getJson("/api/v1/map/manifest"),
    );
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      releaseId: mapReleaseId,
      publishedAt: mapPublishedAt,
      coverage: { start: null, end: mapCoverage.end },
    });
    expect(manifest.artifacts[0]).toEqual(
      expect.objectContaining({
        routeId: "M57",
        apiPath: `/api/v1/releases/${mapReleaseId}/artifacts/map/2026-03/routes/m57.segments.geojson`,
      }),
    );

    const artifact = await SELF.fetch(
      new Request(
        `https://example.test/api/v1/releases/${mapReleaseId}/artifacts/map/2026-03/routes/m57.segments.geojson`,
      ),
    );
    expect(artifact.status).toBe(200);
    expect(artifact.headers.get("Content-Type")).toContain("application/geo+json");
    expect(artifact.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(await artifact.json()).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("reports missing API bindings as explicit 503 responses", async () => {
    const statusResponse = await worker.fetch(
      new Request("https://example.test/api/v1/status"),
      {} satisfies Env,
    );
    expect(statusResponse.status).toBe(503);
    expect(await statusResponse.json()).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "SERVICE_UNAVAILABLE",
          message: "Service dependency is not configured.",
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
          message: "Service dependency is not configured.",
        }),
      }),
    );
  });
});
