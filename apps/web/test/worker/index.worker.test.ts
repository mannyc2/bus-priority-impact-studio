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
} from "@bp/domain";
import { describe, expect, it } from "vitest";
import type { Env } from "../../src/worker/index.js";
import worker from "../../src/worker/index.js";

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

describe("Worker production-behavior harness", () => {
  it("serves a validated health response", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/health"));

    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(await response.json())).toEqual(
      expect.objectContaining({
        ok: true,
        service: "bus-priority-impact-studio",
      }),
    );
  });

  it("keeps unknown API routes closed", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/missing"));

    expect(response.status).toBe(404);
  });

  it("delegates non-API deep links to static assets", async () => {
    const paths: string[] = [];
    const assets = {
      fetch: async (input: RequestInfo | URL): Promise<Response> => {
        const request = input instanceof Request ? input : new Request(input);
        paths.push(new URL(request.url).pathname);
        return new Response('<!doctype html><div id="root"></div>', {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    } as Fetcher;

    const response = await worker.fetch(new Request("https://example.test/routes/b46"), {
      ASSETS: assets,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(paths).toEqual(["/routes/b46"]);
  });

  it("serves a D1-backed route scorecard", async () => {
    const db = new FakeDb({
      route_scorecard_citation: serializeRouteScorecardCitations(scorecard),
      route_scorecard: [serializeRouteScorecard(scorecard)],
    });
    const env = { DB: db as unknown as D1Database } satisfies Env;
    const response = await worker.fetch(
      new Request("https://example.test/api/routes/m1/scorecard?month=2026-03"),
      env,
    );

    expect(response.status).toBe(200);
    expect(RouteScorecardSchema.parse(await response.json())).toEqual(scorecard);
    expect(db.calls[0]?.bound).toEqual(expect.arrayContaining(["M1", "2026-03"]));
  });

  it("serves D1-backed v1 release status with recovered provenance", async () => {
    const db = new FakeDb({
      route_batch_built_route: [
        {
          month: "2026-03",
          route_rank: 1,
          route_id: "M1",
          artifact_count: 3,
          status: "built",
        },
        {
          month: "2026-03",
          route_rank: 2,
          route_id: "M2",
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
      route_month_source_status: [
        {
          route_id: "M1",
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
          route_id: "M1",
          month: "2026-03",
          run_id: "bus-observatory-2026-03",
          reliability_status: "observed",
          min_sample_threshold: 30,
          sample_count: 42,
          stop_count: 10,
          direction_count: 2,
          average_observed_headway_minutes: 8,
          median_observed_headway_minutes: 7,
          p90_observed_headway_minutes: 14,
          max_observed_headway_minutes: 22,
          scheduled_median_headway_minutes: null,
          bunching_threshold_minutes: 3,
          long_gap_threshold_minutes: 20,
          observed_bunching_share: 0.1,
          observed_long_gap_share: 0.2,
          expected_wait_minutes: 5,
          scheduled_expected_wait_minutes: null,
          excess_wait_minutes: null,
          wait_reliability_ratio: null,
        },
        {
          route_id: "M2",
          month: "2026-03",
          run_id: "bus-observatory-2026-03",
          reliability_status: "insufficient_gtfs_rt_samples",
          min_sample_threshold: 30,
          sample_count: 0,
          stop_count: 0,
          direction_count: 0,
          average_observed_headway_minutes: null,
          median_observed_headway_minutes: null,
          p90_observed_headway_minutes: null,
          max_observed_headway_minutes: null,
          scheduled_median_headway_minutes: null,
          bunching_threshold_minutes: null,
          long_gap_threshold_minutes: null,
          observed_bunching_share: null,
          observed_long_gap_share: null,
          expected_wait_minutes: null,
          scheduled_expected_wait_minutes: null,
          excess_wait_minutes: null,
          wait_reliability_ratio: null,
        },
      ],
    });

    const response = await worker.fetch(new Request("https://example.test/api/v1/status"), {
      BASELINE_MONTH: "2026-03",
      DB: db as unknown as D1Database,
    });

    expect(response.status).toBe(200);
    expect(ReleaseStatusResponseSchema.parse(await response.json())).toEqual(
      expect.objectContaining({
        baselineMonth: "2026-03",
        canonicalMonthlyRelease: expect.objectContaining({ status: "pass", routeCount: 2 }),
        observedRealtimeEvidence: expect.objectContaining({
          runId: "bus-observatory-2026-03",
          source: "third_party_recovered",
          observedRouteCount: 1,
          insufficientRouteCount: 1,
          sampleCount: 42,
        }),
      }),
    );
  });

  it("serves compact D1-backed route cards with completeness labels", async () => {
    const db = new FakeDb({
      route_brief_peak_window: [],
      route_brief_slowest_window: [],
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
      route_month_source_status: [],
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
          excess_wait_minutes: null,
          wait_reliability_ratio: null,
        },
        {
          route_id: "M15-SBS",
          month: "2026-03",
          run_id: "bus-observatory-2026-03",
          reliability_status: "insufficient_gtfs_rt_samples",
          min_sample_threshold: 30,
          sample_count: 5,
          stop_count: 2,
          direction_count: 1,
          average_observed_headway_minutes: null,
          median_observed_headway_minutes: null,
          p90_observed_headway_minutes: null,
          max_observed_headway_minutes: null,
          scheduled_median_headway_minutes: null,
          bunching_threshold_minutes: null,
          long_gap_threshold_minutes: null,
          observed_bunching_share: null,
          observed_long_gap_share: null,
          expected_wait_minutes: null,
          scheduled_expected_wait_minutes: null,
          excess_wait_minutes: null,
          wait_reliability_ratio: null,
        },
      ],
    });

    const response = await worker.fetch(new Request("https://example.test/api/v1/routes?limit=2"), {
      BASELINE_MONTH: "2026-03",
      DB: db as unknown as D1Database,
    });

    expect(response.status).toBe(200);
    expect(RouteListResponseSchema.parse(await response.json())).toEqual(
      expect.objectContaining({
        baselineMonth: "2026-03",
        routes: [
          expect.objectContaining({
            routeId: "B46-SBS",
            rank: 1,
            reliabilityStatus: "observed",
            observedBunchingShare: 0.12,
            quality: expect.objectContaining({
              completenessStatus: "complete",
              confidence: "medium",
            }),
          }),
          expect.objectContaining({
            routeId: "M15-SBS",
            rank: 2,
            reliabilityStatus: "insufficient_gtfs_rt_samples",
            quality: expect.objectContaining({ completenessStatus: "insufficient_samples" }),
          }),
        ],
      }),
    );
  });

  it("serves a D1-backed route profile payload with artifact references", async () => {
    const hash = "a".repeat(64);
    const db = new FakeDb({
      route_artifact: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          artifact_name: "route-brief",
          artifact_key: "briefs/2026-03/b46-sbs.json",
          content_type: "application/json",
          byte_length: 2048,
          sha256: hash,
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
      ],
      route_month_source_status: [],
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
      ],
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/v1/routes/b46-sbs/profile"),
      {
        BASELINE_MONTH: "2026-03",
        DB: db as unknown as D1Database,
      },
    );

    expect(response.status).toBe(200);
    expect(RouteProfileResponseSchema.parse(await response.json())).toEqual(
      expect.objectContaining({
        baselineMonth: "2026-03",
        route: expect.objectContaining({
          routeId: "B46-SBS",
          reliabilityStatus: "observed",
          quality: expect.objectContaining({ confidence: "medium" }),
        }),
        peakRidership: expect.objectContaining({ hourOfDay: 8 }),
        slowestWindow: expect.objectContaining({ hourOfDay: 17 }),
        observedReliability: expect.objectContaining({
          runId: "bus-observatory-2026-03",
          sampleCount: 2500,
        }),
        artifacts: [
          {
            name: "route-brief",
            key: "briefs/2026-03/b46-sbs.json",
            contentType: "application/json",
            byteLength: 2048,
            sha256: hash,
          },
        ],
      }),
    );
  });

  it("serves an R2-backed map manifest and artifact objects", async () => {
    const hash = "b".repeat(64);
    const manifest = {
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
    };
    const bucket = new FakeR2Bucket({
      "map/2026-03/manifest.json": new FakeR2Object(
        JSON.stringify(manifest),
        "application/json; charset=utf-8",
      ),
      "map/route-segments/b46-sbs/2026-03/all-day.geojson": new FakeR2Object(
        '{"type":"FeatureCollection","features":[]}',
        "application/geo+json",
      ),
    });

    const manifestResponse = await worker.fetch(
      new Request("https://example.test/api/v1/map/manifest?month=2026-03"),
      { ARTIFACTS: bucket as unknown as R2Bucket },
    );

    expect(manifestResponse.status).toBe(200);
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

    const artifactResponse = await worker.fetch(
      new Request(
        "https://example.test/api/v1/artifacts/map/route-segments/b46-sbs/2026-03/all-day.geojson",
      ),
      { ARTIFACTS: bucket as unknown as R2Bucket },
    );

    expect(artifactResponse.status).toBe(200);
    expect(artifactResponse.headers.get("Content-Type")).toBe("application/geo+json");
    expect(await artifactResponse.text()).toBe('{"type":"FeatureCollection","features":[]}');
  });

  it("serves D1-backed hotspot cards", async () => {
    const db = new FakeDb({
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
      corridor: [
        {
          corridor_id: "corridor-b46",
          corridor_name: "Utica Avenue",
          corridor_key: "utica-avenue",
          derivation_method: "route_member",
        },
      ],
    });

    const response = await worker.fetch(
      new Request("https://example.test/api/v1/hotspots?month=2026-03&limit=1"),
      { DB: db as unknown as D1Database },
    );

    expect(response.status).toBe(200);
    expect(HotspotListResponseSchema.parse(await response.json())).toEqual(
      expect.objectContaining({
        baselineMonth: "2026-03",
        hotspots: [
          expect.objectContaining({
            corridorName: "Utica Avenue",
            routeId: "B46-SBS",
            rank: 1,
            hotspotScore: 91,
          }),
        ],
      }),
    );
  });

  it("serves D1-backed route comparisons", async () => {
    const db = new FakeDb({
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
      route_month_source_status: [],
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

    const response = await worker.fetch(
      new Request("https://example.test/api/v1/compare?month=2026-03&a=b46-sbs&b=m15-sbs"),
      { DB: db as unknown as D1Database },
    );

    expect(response.status).toBe(200);
    expect(RouteCompareResponseSchema.parse(await response.json())).toEqual(
      expect.objectContaining({
        baselineMonth: "2026-03",
        routes: [
          expect.objectContaining({ routeId: "B46-SBS", observedBunchingShare: 0.12 }),
          expect.objectContaining({ routeId: "M15-SBS", observedBunchingShare: 0.08 }),
        ],
        deltas: expect.objectContaining({
          routeScore: 16,
          averageSpeedMph: 1.3999999999999995,
          observedBunchingShare: -0.039999999999999994,
        }),
      }),
    );
  });

  it("rejects route scorecard requests without a valid month", async () => {
    const response = await worker.fetch(
      new Request("https://example.test/api/routes/M1/scorecard"),
      { DB: new FakeDb({}) as unknown as D1Database },
    );

    expect(response.status).toBe(400);
  });
});
