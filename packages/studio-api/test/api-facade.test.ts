import { describe, expect, it } from "bun:test";
import { serializeRouteScorecard, serializeRouteScorecardCitations } from "@bp/db/d1";
import {
  HealthResponseSchema,
  HotspotListResponseSchema,
  MapManifestResponseSchema,
  ReleaseStatusResponseSchema,
  RouteCompareResponseSchema,
  RouteListResponseSchema,
  RouteProfileResponseSchema,
  RouteScorecardSchema,
  StudioDocsResponseSchema,
  StudioRoutesResponseSchema,
} from "@bp/domain";
import { handleStudioApiRequest, type StudioApiEnv } from "../src/index.js";

type D1Value = string | number | boolean | null;

type QueryCall = {
  query: string;
  bound: D1Value[];
};

class FakeStatement<T> {
  constructor(
    private readonly call: QueryCall,
    private readonly rows: T[],
  ) {}

  bind(...values: D1Value[]): FakeStatement<T> {
    this.call.bound = values;
    return this;
  }

  async first(): Promise<T | null> {
    return this.rows[0] ?? null;
  }

  async all(): Promise<{ results: T[] }> {
    return { results: this.rows };
  }

  async raw(): Promise<unknown[][]> {
    return this.rows.map((row) => Object.values(row as Record<string, unknown>));
  }
}

class FakeDb {
  readonly calls: QueryCall[] = [];

  constructor(private readonly rowsByTable: Record<string, unknown[]>) {}

  prepare<T = unknown>(query: string): FakeStatement<T> {
    const call = { query, bound: [] };
    this.calls.push(call);
    const table = Object.keys(this.rowsByTable).find((candidate) => query.includes(candidate));
    const rows = (table === undefined ? [] : this.rowsByTable[table]) as T[];

    return new FakeStatement(call, rows);
  }
}

class FakeR2Object {
  readonly httpEtag = '"test-etag"';
  readonly body: ReadableStream<Uint8Array>;

  constructor(
    private readonly value: string,
    private readonly contentType: string,
  ) {
    this.body = new Response(value).body ?? new ReadableStream<Uint8Array>();
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.value) as unknown;
  }

  writeHttpMetadata(headers: Headers): void {
    headers.set("Content-Type", this.contentType);
  }
}

class FakeR2Bucket {
  constructor(private readonly objects: Record<string, FakeR2Object>) {}

  async get(key: string): Promise<FakeR2Object | null> {
    return this.objects[key] ?? null;
  }
}

const route = {
  slug: "m15-sbs",
  routeId: "M15+",
  label: "M15 SBS",
  corridor: "First Avenue / Second Avenue",
  corridorFull: "First Avenue / Second Avenue",
  borough: "Manhattan",
  sbs: true,
  speedMph: 7.2,
  scheduledMph: 8.4,
  weightedAvgSpeed: 7.2,
  speedPercentile: 12,
  dailyRiders: 30_000,
  ridersYoyPct: 0,
  riderHoursLost: 0,
  laneCoverage: 65,
  aceStatus: "active",
  aceSince: "2024",
  tspCoverage: "none",
  reliability: "High attention route",
  observedReliability: null,
  diagnosis: "M15 SBS has slow segments and active treatment evidence.",
  spark: [7.2, 7.4, 7.1],
  termini: { north: "East Harlem", south: "South Ferry" },
  miles: 8.1,
  stops: 42,
  flags: ["ACE active"],
  peerSlug: null,
  interventions: [],
} as const;

const quality = {
  releaseLayer: "baseline_release",
  completenessStatus: "complete",
  confidence: "high",
  caveats: [],
} as const;

const scorecard = RouteScorecardSchema.parse({
  schemaVersion: 1,
  routeId: "M1",
  month: "2026-03",
  routeScore: 16,
  coverageStatus: "full",
  averageSpeedMph: 6.7409,
  hotspotCount: 10,
  citations: [
    {
      sourceId: "mta_bus_route_segment_speeds",
      title: "MTA Bus Route Segment Speeds",
      url: "https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds/kufs-yh3x",
      verifiedAt: "2026-04-27T00:00:00.000Z",
    },
  ],
});

function createStudioProjectionEnv(): StudioApiEnv {
  return {
    ARTIFACTS: new FakeR2Bucket({
      "studio/v1/briefs.json": new FakeR2Object(
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-06-05T00:00:00.000Z",
          briefs: [],
          quality,
        }),
        "application/json",
      ),
      "studio/v1/docs.json": new FakeR2Object(
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-06-05T00:00:00.000Z",
          sections: [{ title: "Quickstart", body: ["Use the API."] }],
          endpoints: [{ method: "GET", path: "/api/v1/studio/routes", body: "List routes." }],
          quality,
        }),
        "application/json",
      ),
      "studio/v1/findings.json": new FakeR2Object(
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-06-05T00:00:00.000Z",
          findings: [],
          quality,
        }),
        "application/json",
      ),
      "studio/v1/methods.json": new FakeR2Object(
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-06-05T00:00:00.000Z",
          datasets: [
            {
              name: "MTA Bus Speeds",
              publisher: "MTA",
              grain: "route-month",
              cadence: "monthly",
            },
          ],
          quality,
        }),
        "application/json",
      ),
      "studio/v1/routes.json": new FakeR2Object(
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-06-05T00:00:00.000Z",
          routes: [route],
          quality,
        }),
        "application/json",
      ),
      "studio/v1/routes/m15-sbs/index.json": new FakeR2Object(
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-06-05T00:00:00.000Z",
          route,
          segments: [],
          artifactRefs: [],
          quality,
        }),
        "application/json",
      ),
    }) as unknown as R2Bucket,
  };
}

async function fetchApi(path: string, env: StudioApiEnv = {}): Promise<Response> {
  const response = await handleStudioApiRequest(new Request(`https://example.test${path}`), env);
  if (response === null) {
    throw new Error(`Expected API response for ${path}`);
  }
  return response;
}

describe("Studio API facade", () => {
  it("serves health, schema, and OpenAPI routes through the package facade", async () => {
    const [healthResponse, schemaResponse, openApiResponse] = await Promise.all([
      fetchApi("/api/health"),
      fetchApi("/api/schema/route-scorecard"),
      fetchApi("/api/openapi.json"),
    ]);

    expect(healthResponse.status).toBe(200);
    expect(HealthResponseSchema.parse(await healthResponse.json())).toEqual(
      expect.objectContaining({ ok: true, service: "bus-priority-impact-studio" }),
    );

    expect(schemaResponse.status).toBe(200);
    expect(await schemaResponse.json()).toEqual(expect.objectContaining({ type: "object" }));

    expect(openApiResponse.status).toBe(200);
    const openApi = (await openApiResponse.json()) as {
      openapi?: unknown;
      paths?: Record<string, unknown>;
    };
    expect(openApi.openapi).toBe("3.1.0");
    expect(openApi.paths).toEqual(
      expect.objectContaining({
        "/api/v1/studio/routes": expect.any(Object),
        "/api/v1/studio/snapshot": expect.any(Object),
        "/api/v1/studio/briefs/{briefId}/draft/generate": expect.any(Object),
      }),
    );
  });

  it("keeps unknown API routes closed at the package facade", async () => {
    const response = await fetchApi("/api/missing");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  it("serves a D1-backed route scorecard", async () => {
    const db = new FakeDb({
      route_scorecard_citation: serializeRouteScorecardCitations(scorecard),
      route_scorecard: [serializeRouteScorecard(scorecard)],
    });
    const response = await fetchApi("/api/routes/m1/scorecard?month=2026-03", {
      DB: db as unknown as D1Database,
    });

    expect(response.status).toBe(200);
    expect(RouteScorecardSchema.parse(await response.json())).toEqual(scorecard);
    expect(db.calls[0]?.bound).toEqual(expect.arrayContaining(["M1", "2026-03"]));
  });

  it("serves D1-backed v1 status, route cards, profile, hotspots, and comparisons", async () => {
    const db = new FakeDb({
      corridor_hotspot: [
        {
          corridor_id: "corridor-b46",
          month: "2026-03",
          corridor_hotspot_rank: 1,
          route_id: "B46-SBS",
          route_hotspot_rank: 2,
          from_stop_name: "DeKalb Av",
          to_stop_name: "Eastern Pkwy",
          weighted_average_speed_mph: 4.9,
          hotspot_score: 91,
          rider_impact_score: 88,
        },
      ],
      corridor_intervention_context: [],
      corridor_month_summary: [
        {
          corridor_id: "corridor-b46",
          month: "2026-03",
          route_count: 1,
          assigned_route_count: 1,
          ambiguous_route_count: 0,
          unassigned_route_count: 0,
          total_ridership: 123456,
          total_transfers: 1234,
          weighted_average_speed_mph: 6.4,
          hotspot_count: 1,
          observed_reliability_route_count: 1,
          insufficient_reliability_route_count: 0,
          intervention_comparison_count: 1,
          evaluated_intervention_comparison_count: 1,
        },
      ],
      corridor_route_member: [],
      corridor: [
        {
          corridor_id: "corridor-b46",
          corridor_name: "Utica Avenue",
          corridor_key: "utica-avenue",
          derivation_method: "route_member",
        },
      ],
      route_artifact: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          artifact_name: "route-brief",
          artifact_key: "briefs/2026-03/b46-sbs.json",
          content_type: "application/json",
          byte_length: 2048,
          sha256: "a".repeat(64),
        },
      ],
      route_batch_built_route: [
        {
          month: "2026-03",
          route_rank: 1,
          route_id: "B46-SBS",
          artifact_count: 3,
          status: "built",
        },
        {
          month: "2026-03",
          route_rank: 2,
          route_id: "M15-SBS",
          artifact_count: 3,
          status: "built",
        },
      ],
      route_batch_issue: [],
      route_batch_status: [
        {
          month: "2026-03",
          generated_at: "2026-05-17T15:46:52.274Z",
          status: "pass",
          route_count: 2,
          artifact_count: 6,
          missing_artifact_count: 0,
          hash_mismatch_count: 0,
          byte_length_mismatch_count: 0,
          total_byte_length: 1234,
          issue_count: 0,
        },
      ],
      route_brief_peak_window: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          window_rank: 1,
          day_of_week: "weekday",
          hour_of_day: 8,
          ridership: 1000,
          transfers: 50,
          matched_observation_count: 20,
          bus_trip_count: 10,
          weighted_average_speed_mph: 6.1,
          slow_observation_share: 0.4,
        },
      ],
      route_brief_slowest_window: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          window_rank: 1,
          day_of_week: "weekday",
          hour_of_day: 17,
          observation_count: 40,
          bus_trip_count: 20,
          segment_count: 5,
          weighted_average_speed_mph: 4.9,
          weighted_average_travel_time_minutes: 12.5,
          slow_observation_share: 0.7,
        },
      ],
      route_brief_summary: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          route_score: 38,
          public_visible: true,
          public_visibility_reason: "public",
          average_speed_mph: 6.4,
          hotspot_count: 9,
          total_ridership: 123456,
          total_transfers: 1234,
          ace_active: true,
          ace_violation_count: 10,
          bus_lane_matched_lane_count: 4,
          schedule_match_rate: 0.98,
        },
        {
          route_id: "M15-SBS",
          month: "2026-03",
          route_score: 54,
          public_visible: true,
          public_visibility_reason: "public",
          average_speed_mph: 7.8,
          hotspot_count: 6,
          total_ridership: 234567,
          total_transfers: 2345,
          ace_active: true,
          ace_violation_count: 20,
          bus_lane_matched_lane_count: 8,
          schedule_match_rate: 0.99,
        },
      ],
      route_comparison_rank: [
        {
          month: "2026-03",
          rank: 1,
          route_id: "B46-SBS",
          route_score: 38,
          average_speed_mph: 6.4,
          total_ridership: 123456,
          ace_violation_count: 10,
          bus_lane_matched_lane_count: 4,
        },
        {
          month: "2026-03",
          rank: 2,
          route_id: "M15-SBS",
          route_score: 54,
          average_speed_mph: 7.8,
          total_ridership: 234567,
          ace_violation_count: 20,
          bus_lane_matched_lane_count: 8,
        },
      ],
      route_month_source_status: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          source_scope: "reliability",
          source_id: "observedHeadways",
          status: "available",
          row_count: 42,
          snapshot_id: "bus-observatory-2026-03",
          note: "third-party recovered",
        },
      ],
      route_observed_reliability_summary: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          run_id: "bus-observatory-2026-03",
          reliability_status: "observed",
          min_sample_threshold: 30,
          sample_count: 2500,
          stop_count: 50,
          direction_count: 2,
          average_observed_headway_minutes: 8,
          median_observed_headway_minutes: 7,
          p90_observed_headway_minutes: 14,
          max_observed_headway_minutes: 22,
          scheduled_median_headway_minutes: null,
          bunching_threshold_minutes: 3,
          long_gap_threshold_minutes: 20,
          observed_bunching_share: 0.12,
          observed_long_gap_share: 0.2,
          expected_wait_minutes: 5,
          scheduled_expected_wait_minutes: null,
          excess_wait_minutes: 1.5,
          wait_reliability_ratio: null,
        },
        {
          route_id: "M15-SBS",
          month: "2026-03",
          run_id: "bus-observatory-2026-03",
          reliability_status: "observed",
          min_sample_threshold: 30,
          sample_count: 3200,
          stop_count: 60,
          direction_count: 2,
          average_observed_headway_minutes: 7,
          median_observed_headway_minutes: 6,
          p90_observed_headway_minutes: 13,
          max_observed_headway_minutes: 21,
          scheduled_median_headway_minutes: null,
          bunching_threshold_minutes: 3,
          long_gap_threshold_minutes: 20,
          observed_bunching_share: 0.08,
          observed_long_gap_share: 0.17,
          expected_wait_minutes: 4,
          scheduled_expected_wait_minutes: null,
          excess_wait_minutes: 0.8,
          wait_reliability_ratio: null,
        },
      ],
    });
    const env = { BASELINE_MONTH: "2026-03", DB: db as unknown as D1Database };

    const [status, routes, profile, hotspots, compare] = await Promise.all([
      fetchApi("/api/v1/status", env),
      fetchApi("/api/v1/routes?limit=2", env),
      fetchApi("/api/v1/routes/b46-sbs/profile", env),
      fetchApi("/api/v1/hotspots?month=2026-03&limit=1", env),
      fetchApi("/api/v1/compare?month=2026-03&a=b46-sbs&b=m15-sbs", env),
    ]);

    expect(ReleaseStatusResponseSchema.parse(await status.json())).toEqual(
      expect.objectContaining({
        baselineMonth: "2026-03",
        canonicalMonthlyRelease: expect.objectContaining({ status: "pass", routeCount: 2 }),
        observedRealtimeEvidence: expect.objectContaining({
          runId: "bus-observatory-2026-03",
          source: "third_party_recovered",
        }),
      }),
    );
    expect(RouteListResponseSchema.parse(await routes.json()).routes).toHaveLength(2);
    expect(RouteProfileResponseSchema.parse(await profile.json())).toEqual(
      expect.objectContaining({
        route: expect.objectContaining({ routeId: "B46-SBS" }),
        artifacts: [expect.objectContaining({ key: "briefs/2026-03/b46-sbs.json" })],
      }),
    );
    expect(HotspotListResponseSchema.parse(await hotspots.json()).hotspots[0]).toEqual(
      expect.objectContaining({ corridorName: "Utica Avenue", routeId: "B46-SBS" }),
    );
    expect(RouteCompareResponseSchema.parse(await compare.json())).toEqual(
      expect.objectContaining({
        deltas: expect.objectContaining({ routeScore: 16 }),
      }),
    );
  });

  it("serves R2-backed map manifests and artifact objects", async () => {
    const hash = "b".repeat(64);
    const bucket = new FakeR2Bucket({
      "map/2026-03/manifest.json": new FakeR2Object(
        JSON.stringify({
          schemaVersion: 1,
          artifactKind: "map_artifact_manifest",
          analysisPeriod: "2026-03",
          generatedAt: "2026-05-17T15:46:47.037Z",
          status: "pass",
          artifactCount: 1,
          routeSegmentArtifactCount: 1,
          totalFeatureCount: 3,
          totalByteLength: 128,
          issueCount: 0,
          artifacts: [
            {
              artifactKind: "map_route_segments_geojson",
              artifactKey: "map/route-segments/b46-sbs/2026-03/all-day.geojson",
              contentType: "application/geo+json",
              byteLength: 128,
              sha256: hash,
              featureCount: 3,
              routeId: "B46-SBS",
            },
          ],
        }),
        "application/json; charset=utf-8",
      ),
      "map/route-segments/b46-sbs/2026-03/all-day.geojson": new FakeR2Object(
        '{"type":"FeatureCollection","features":[]}',
        "application/geo+json",
      ),
    });
    const env = { ARTIFACTS: bucket as unknown as R2Bucket };

    const manifestResponse = await fetchApi("/api/v1/map/manifest?month=2026-03", env);
    const artifactResponse = await fetchApi(
      "/api/v1/artifacts/map/route-segments/b46-sbs/2026-03/all-day.geojson",
      env,
    );

    expect(MapManifestResponseSchema.parse(await manifestResponse.json())).toEqual(
      expect.objectContaining({
        baselineMonth: "2026-03",
        artifactCount: 1,
        artifacts: [
          expect.objectContaining({
            routeId: "B46-SBS",
            apiPath: "/api/v1/artifacts/map/route-segments/b46-sbs/2026-03/all-day.geojson",
          }),
        ],
      }),
    );
    expect(artifactResponse.headers.get("Content-Type")).toBe("application/geo+json");
    expect(await artifactResponse.text()).toBe('{"type":"FeatureCollection","features":[]}');
  });

  it("serves Studio projection-backed routes and docs", async () => {
    const env = createStudioProjectionEnv();
    const [routesResponse, detailResponse, docsResponse] = await Promise.all([
      fetchApi("/api/v1/studio/routes", env),
      fetchApi("/api/v1/studio/routes/m15-sbs", env),
      fetchApi("/api/v1/studio/docs", env),
    ]);

    expect(routesResponse.headers.get("Server-Timing")).toContain("studio;dur=");
    expect(routesResponse.headers.get("X-Studio-Release")).toBe("studio/v1");
    expect(StudioRoutesResponseSchema.parse(await routesResponse.json()).routes[0]?.slug).toBe(
      "m15-sbs",
    );
    expect((await detailResponse.json()) as unknown).toEqual(
      expect.objectContaining({
        route: expect.objectContaining({ slug: "m15-sbs" }),
      }),
    );
    expect(StudioDocsResponseSchema.parse(await docsResponse.json()).endpoints).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/api/v1/studio/routes" })]),
    );
  });

  it("fails Studio API reads closed when projection artifacts are missing", async () => {
    const [missingProjection, missingBinding] = await Promise.all([
      fetchApi("/api/v1/studio/briefs", { ARTIFACTS: new FakeR2Bucket({}) as unknown as R2Bucket }),
      fetchApi("/api/v1/studio/briefs"),
    ]);

    expect(missingProjection.status).toBe(503);
    expect(
      ((await missingProjection.json()) as { error?: { message?: string } }).error?.message,
    ).toMatch(/not found at studio\/v1\/briefs\.json/);
    expect(missingBinding.status).toBe(503);
    expect(
      ((await missingBinding.json()) as { error?: { message?: string } }).error?.message,
    ).toMatch(/ARTIFACTS R2 binding/);
  });
});
