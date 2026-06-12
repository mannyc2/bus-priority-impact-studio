import { describe, expect, it } from "bun:test";
import { serializeRouteScorecard, serializeRouteScorecardCitations } from "@bp/db/d1";
import { MapManifestResponseSchema } from "@bp/domain/maps";
import {
  HealthResponseSchema,
  HotspotListResponseSchema,
  ReleaseStatusResponseSchema,
  RouteCompareResponseSchema,
  RouteListResponseSchema,
  RouteProfileResponseSchema,
  RouteScorecardSchema,
} from "@bp/domain/routes";
import { StudioDocsResponseSchema } from "@bp/domain/studio/docs";
import { StudioSearchResponseSchema } from "@bp/domain/studio/release";
import {
  StudioRouteDetailResponseSchema,
  StudioRouteHistoryResponseSchema,
  StudioRouteSectionsResponseSchema,
  StudioRouteSpeedHistoryResponseSchema,
  StudioRoutesResponseSchema,
} from "@bp/domain/studio/routes";
import {
  StudioRouteIndex2ResponseSchema,
  StudioSnapshotResponseSchema,
} from "@bp/domain/studio/snapshots";
import { studioOpenApiDocument } from "@bp/studio-api/contracts/openapi";
import { handleStudioApiRequest, type StudioApiEnv } from "@bp/studio-api/server";

type D1Value = string | number | boolean | null;

type QueryCall = {
  query: string;
  bound: D1Value[];
};

function selectedColumns(query: string): string[] {
  const selectMatch = query.match(/^select\s+(.+?)\s+from\s/s);
  const selectClause = selectMatch?.[1];
  if (selectClause === undefined) return [];
  return selectClause.split(/,\s*/).flatMap((segment) => {
    const aliasMatch = segment.match(/\s+as\s+"([^"]+)"/i);
    if (aliasMatch?.[1] !== undefined) return [aliasMatch[1]];
    const quotedNames = [...segment.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    return quotedNames.at(-1) ?? [];
  });
}

class FakeStatement<T> {
  constructor(
    private readonly call: QueryCall,
    private readonly rows: T[],
  ) {}

  private filteredRows(): T[] {
    if (
      this.call.query.includes("route_month_trend") &&
      this.call.query.includes("where") &&
      this.call.bound.length > 0
    ) {
      const routeId = this.call.bound[0];
      return this.rows.filter((row) => (row as { route_id?: unknown }).route_id === routeId);
    }

    return this.rows;
  }

  bind(...values: D1Value[]): FakeStatement<T> {
    this.call.bound = values;
    return this;
  }

  async first(): Promise<T | null> {
    return this.filteredRows()[0] ?? null;
  }

  async all(): Promise<{ results: T[] }> {
    return { results: this.filteredRows() };
  }

  async raw(): Promise<unknown[][]> {
    const columns = selectedColumns(this.call.query);
    return this.filteredRows().map((row) => {
      const record = row as Record<string, unknown>;
      if (columns.length > 0 && columns.every((column) => column in record)) {
        return columns.map((column) => record[column]);
      }
      return Object.values(record);
    });
  }
}

class FakeDb {
  readonly calls: QueryCall[] = [];

  constructor(private readonly rowsByTable: Record<string, unknown[]>) {}

  prepare<T = unknown>(query: string): FakeStatement<T> {
    const call = { query, bound: [] };
    this.calls.push(call);
    const table = Object.keys(this.rowsByTable)
      .sort((left, right) => right.length - left.length)
      .find((candidate) => query.includes(candidate));
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

const CAPABILITY_MANIFEST_KEY = "studio/v2/routes/route-capability-manifest.json";

function capabilitySurface(state: string, reason: string | null = null) {
  return { state, reason, depth: null, dataAsOf: null, freshness: "unknown" };
}

function capabilityManifestArtifact(
  routes: { routeId: string; overallState: string; surfaces: Record<string, unknown>; caveats?: string[] }[],
): FakeR2Object {
  return new FakeR2Object(
    JSON.stringify({
      artifactKind: "route_capability_manifest",
      schemaVersion: 1,
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      routes: routes.map((route) => ({ caveats: [], ...route })),
    }),
    "application/json",
  );
}

function dossierSummaryArtifact(routeId: string, routeSlug: string): FakeR2Object {
  return new FakeR2Object(
    JSON.stringify({
      artifactKind: "studio_route_dossier_summary",
      schemaVersion: 1,
      generatedAt: "2026-06-10T00:00:00.000Z",
      routeId,
      routeSlug,
      releaseMonth: "2026-03",
      dataAsOf: "2026-03",
      speed: {
        current: 6.9,
        movement6mPct: -8,
        peerPercentile: 12,
        sparkline: [
          { month: "2026-02", value: 7 },
          { month: "2026-03", value: 6.9 },
        ],
        dataAsOf: "2026-03",
      },
      ridership: {
        current: 42000,
        movement6mPct: 3.5,
        peerPercentile: 96,
        sparkline: [
          { month: "2026-02", value: 41500 },
          { month: "2026-03", value: 42000 },
        ],
        dataAsOf: "2026-03",
      },
      worstSegment: {
        segmentId: "seg-1",
        direction: "NB",
        label: "14th–23rd",
        averageSpeedMph: 3.7,
        persistenceMonths: 3,
        dataAsOf: "2026-03",
      },
      treatmentPosture: {
        aceActive: true,
        aceSince: "2024-06-01",
        busLaneMatchedLaneCount: 5,
        latestEvents: [
          { date: "2024-06-01", kind: "ace_enforcement", label: "ACE enforcement began" },
        ],
        dataAsOf: "2026-03",
      },
    }),
    "application/json",
  );
}

// Standard contrast routes for the snapshot/index/sections handler tests: a rich route
// with surfaced findings + partial speed history, and a sparse summary-only route.
const STANDARD_ROUTE_CAPABILITIES = [
  {
    routeId: "M15+",
    overallState: "ready",
    surfaces: {
      condition: capabilitySurface("ready"),
      speedHistory: capabilitySurface("partial", "16 cells missing"),
      detectorFindings: capabilitySurface("ready"),
      reliability: capabilitySurface("building"),
      ridership: capabilitySurface("ready"),
      scheduleBaseline: capabilitySurface("ready"),
    },
  },
  {
    routeId: "Q1",
    overallState: "checked_clean",
    surfaces: {
      condition: capabilitySurface("ready"),
      detectorFindings: capabilitySurface("checked_clean"),
      ridership: capabilitySurface("ready"),
    },
  },
  {
    routeId: "B99",
    overallState: "building",
    surfaces: {
      condition: capabilitySurface("ready"),
      detectorFindings: capabilitySurface("insufficient_data"),
      speedHistory: capabilitySurface("insufficient_data"),
      ridership: capabilitySurface("insufficient_data"),
    },
  },
];

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
      [CAPABILITY_MANIFEST_KEY]: capabilityManifestArtifact(STANDARD_ROUTE_CAPABILITIES),
      "studio/v2/routes/m15-sbs/dossier.json": dossierSummaryArtifact("M15+", "m15-sbs"),
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
          schemaVersion: 2,
          generatedAt: "2026-06-05T00:00:00.000Z",
          route,
          segments: [],
          artifactRefs: [],
          quality,
        }),
        "application/json",
      ),
      "studio/v2/routes/m15-sbs/speed-history.json": new FakeR2Object(
        JSON.stringify({
          artifactKind: "studio_route_speed_history",
          schemaVersion: 1,
          generatedAt: "2026-06-06T00:00:00.000Z",
          routeId: "M15+",
          routeSlug: "m15-sbs",
          source: {
            table: "local_route_segment_speed",
            dbPath: "data/local/pipeline.sqlite",
            speedSpinePath: "data/artifacts/studio/v2/routes/m15-sbs/speed-spine.json",
            startMonth: "2026-02",
            endMonth: "2026-03",
            artifactPath: "data/artifacts/studio/v2/routes/m15-sbs/speed-history.json",
          },
          dimensions: {
            months: ["2026-02", "2026-03"],
            dayparts: ["am_peak", "midday", "pm_peak", "off_peak"],
            segments: [
              {
                segmentId: "m15-sbs-n-node-001-node-002",
                direction: "N",
                displayOrder: 10,
                label: "First Av to Second Av",
                fromNodeId: "node-001",
                toNodeId: "node-002",
              },
            ],
          },
          summary: {
            monthCount: 2,
            segmentCount: 1,
            daypartCount: 4,
            cellCount: 8,
            availableCellCount: 2,
            missingCellCount: 6,
            sourceObservationCount: 20,
            traversalCount: 200,
            unmappedRawKeyCount: 0,
          },
          unmappedRawKeys: [],
          cells: [
            {
              segmentId: "m15-sbs-n-node-001-node-002",
              month: "2026-02",
              daypart: "am_peak",
              status: "available",
              observationCount: 10,
              traversalCount: 100,
              averageSpeedMph: 8,
              averageTravelTimeMinutes: 3,
              averageRoadDistanceMiles: 0.4,
              segmentDaypartMeanSpeedMph: 9,
              deltaFromSegmentDaypartMeanMph: -1,
              pctFromSegmentDaypartMean: -0.1111,
            },
            {
              segmentId: "m15-sbs-n-node-001-node-002",
              month: "2026-02",
              daypart: "midday",
              status: "missing",
              observationCount: 0,
              traversalCount: 0,
              averageSpeedMph: null,
              averageTravelTimeMinutes: null,
              averageRoadDistanceMiles: null,
              segmentDaypartMeanSpeedMph: null,
              deltaFromSegmentDaypartMeanMph: null,
              pctFromSegmentDaypartMean: null,
            },
          ],
        }),
        "application/json",
      ),
      "studio/v2/routes/m15-sbs/timeline.json": new FakeR2Object(
        JSON.stringify({
          artifactKind: "bp.tier2_route_timeline_bundle.v1",
          schemaVersion: 1,
          generatedAt: "2026-06-06T20:14:00.000Z",
          routeId: "M15+",
          summary: {
            eventCount: 1,
            defaultEventCount: 1,
          },
          events: [
            {
              eventId: "m15_sbs_launch_oct2010",
              displayDate: "2010-10",
              title: "M15 Select Bus Service Launches on 1st/2nd Avenue",
            },
          ],
        }),
        "application/json",
      ),
      "studio/v2/detectors/model-artifacts.json": new FakeR2Object(
        JSON.stringify({
          artifactKind: "model_artifact_serving_projection",
          schemaVersion: 1,
          generatedAt: "2026-06-07T00:00:00.000Z",
          releaseMonth: "2026-03",
          historyWindow: { startMonth: "2023-04", endMonth: "2026-03" },
          sourceEvaluationPath:
            "data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation.json",
          summary: {
            modelCount: 2,
            availableModelCount: 1,
            missingModelCount: 1,
            detectorConsumerCount: 3,
          },
          models: [
            {
              modelId: "segment_speed_residuals_v1",
              status: "available",
              panelId: "segment_month_panel_v1",
              releaseMonth: "2026-03",
              modeledReleaseRowCount: 404,
              routeCount: 2,
              segmentCount: 12,
              detectorConsumers: ["speed_pace_hotspot", "treatment_scope_mismatch"],
              limitations: ["fixture limitation"],
            },
            {
              modelId: "pulse_fingerprint_v1",
              status: "missing",
              panelId: "route_hour_of_week_pulse_panel_v1",
              releaseMonth: "2026-03",
              modeledReleaseRowCount: 0,
              routeCount: 0,
              segmentCount: 0,
              detectorConsumers: ["pulse_fingerprint"],
              limitations: ["not built in fixture"],
            },
          ],
        }),
        "application/json",
      ),
    }) as unknown as R2Bucket,
  };
}

function createSparseStudioRouteDb(): FakeDb {
  return new FakeDb({
    route_artifact: [
      {
        route_id: "M15+",
        month: "2026-03",
        artifact_name: "brief.json",
      },
      {
        route_id: "M15+",
        month: "2026-03",
        artifact_name: "route_timeline_bundle",
      },
    ],
    route_brief_summary: [
      {
        route_id: "M15+",
        month: "2026-03",
        public_visible: true,
        public_visibility_reason: "public",
        route_score: 24,
        average_speed_mph: 7.2,
        hotspot_count: 4,
        total_ridership: 900000,
        total_transfers: 10000,
        ace_active: true,
        ace_violation_count: 10,
        bus_lane_matched_lane_count: 8,
        schedule_match_rate: 0.98,
      },
      {
        route_id: "B99",
        month: "2026-03",
        public_visible: false,
        public_visibility_reason: "no_rich_artifact",
        route_score: 72,
        average_speed_mph: 11.1,
        hotspot_count: 0,
        total_ridership: 0,
        total_transfers: 0,
        ace_active: false,
        ace_violation_count: 0,
        bus_lane_matched_lane_count: 0,
        schedule_match_rate: 0.6,
      },
    ],
    route_catalog: [
      {
        route_id: "M15+",
        route_short_name: "M15-SBS",
        route_long_name: "East Harlem - South Ferry",
        shape_count: 2,
        stop_count: 42,
        timepoint_stop_count: 12,
      },
      {
        route_id: "B99",
        route_short_name: "B99",
        route_long_name: "Late Night Shuttle",
        shape_count: 1,
        stop_count: 10,
        timepoint_stop_count: 4,
      },
    ],
    route_catalog_type: [
      {
        route_id: "M15+",
        type_rank: 1,
        route_type: "Select Bus Service",
      },
      {
        route_id: "B99",
        type_rank: 1,
        route_type: "Local",
      },
    ],
    route_month_trend: [
      {
        route_id: "M15+",
        month: "2023-04",
        speed_observation_count: 4106,
        speed_bus_trip_count: 72587,
        average_speed_mph: 7.1,
        ridership: 880000,
        transfers: 70737,
        has_speed_trend: true,
        has_ridership_trend: true,
      },
      {
        route_id: "B99",
        month: "2026-03",
        speed_observation_count: 0,
        speed_bus_trip_count: 0,
        average_speed_mph: null,
        ridership: null,
        transfers: null,
        has_speed_trend: false,
        has_ridership_trend: false,
      },
    ],
    route_speed_history_coverage: [
      {
        route_id: "M15+",
        month: "2026-03",
        route_slug: "m15-sbs",
        history_start_month: "2023-04",
        history_end_month: "2026-03",
        artifact_path: "studio/v2/routes/m15-sbs/speed-history.json",
        artifact_status: "written",
        month_count: 36,
        segment_count: 12,
        cell_count: 1728,
        available_cell_count: 1712,
        missing_cell_count: 16,
        generated_at: "2026-06-06T00:00:00.000Z",
      },
    ],
    route_timeline_index: [
      {
        route_id: "M15+",
        month: "2026-03",
        support_level: "timeline_sparse",
        quality_flags_json: JSON.stringify(["low_default_event_count"]),
        default_event_count: 1,
        secondary_event_count: 0,
        review_only_event_count: 0,
        event_count: 1,
        source_backed_event_count: 1,
        date_assertion_backed_event_count: 1,
        unresolved_date_event_count: 0,
        low_confidence_event_count: 0,
        unaccounted_candidate_count: 0,
        validation_error_count: 0,
        validation_warning_count: 0,
        total_tokens: 21507,
        default_events_json: JSON.stringify([
          {
            eventId: "m15_sbs_launch_oct2010",
            displayDate: "2010-10",
            title: "M15 Select Bus Service Launches on 1st/2nd Avenue",
          },
        ]),
        bundle_artifact_key: "studio/v2/routes/m15-sbs/timeline.json",
        bundle_artifact_sha256: "b".repeat(64),
        bundle_artifact_byte_length: 512,
        source_bundle_path: "/tmp/m15-timeline.json",
        generated_at: "2026-06-06T20:14:00.000Z",
      },
    ],
    source_month_coverage: [
      {
        source_id: "local_route_segment_speed",
        month: "2026-03",
        label: "Route segment speed rows",
        source_kind: "source_table",
        grain: "route x month x segment/hour speed observation",
        status: "available",
        row_count: 4200,
        route_count: 350,
        note: null,
        generated_at: "2026-06-06T00:00:00.000Z",
        artifact_path:
          "data/artifacts/source-month-coverage/2023-04_to_2026-03/coverage-matrix.json",
      },
      {
        source_id: "local_route_schedule_stop_source_year",
        month: "2026-03",
        label: "Route schedule stop source-year support",
        source_kind: "source_year_table",
        grain: "source year x route x schedule stop",
        status: "partial",
        row_count: 27538626,
        route_count: 375,
        note: "Source-year schedule stop rows for 375/386 status routes in 2026.",
        generated_at: "2026-06-06T00:00:00.000Z",
        artifact_path:
          "data/artifacts/source-month-coverage/2023-04_to_2026-03/coverage-matrix.json",
      },
    ],
    route_observed_reliability_summary: [],
    route_readiness: [
      {
        route_id: "M15+",
        month: "2026-03",
        readiness_status: "ready",
        build_eligible: true,
        readiness_score: 100,
        speed_observation_count: 4000,
        speed_bus_trip_count: 70000,
        average_speed_mph: 7.2,
        schedule_timepoint_count: 12,
        shape_count: 2,
        stop_count: 42,
        timepoint_stop_count: 12,
      },
      {
        route_id: "B99",
        month: "2026-03",
        readiness_status: "partial",
        build_eligible: false,
        readiness_score: 60,
        speed_observation_count: 0,
        speed_bus_trip_count: 0,
        average_speed_mph: null,
        schedule_timepoint_count: 4,
        shape_count: 1,
        stop_count: 10,
        timepoint_stop_count: 4,
      },
    ],
  });
}

async function fetchApi(path: string, env: StudioApiEnv = {}): Promise<Response> {
  const response = await handleStudioApiRequest(new Request(`https://example.test${path}`), env);
  if (response === null) {
    throw new Error(`Expected API response for ${path}`);
  }
  return response;
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
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
        "/api/v1/studio/routes/sections": expect.any(Object),
        "/api/v1/studio/routes/{routeId}/history": expect.any(Object),
        "/api/v1/studio/routes/{routeId}/speed-history": expect.any(Object),
        "/api/v1/studio/routes/{routeId}/timeline": expect.any(Object),
        "/api/v1/studio/snapshot": expect.any(Object),
        "/api/v1/studio/briefs/{briefId}/draft/generate": expect.any(Object),
      }),
    );
  });

  it("keeps unknown API routes closed at the package facade", async () => {
    const response = await fetchApi("/api/missing");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "API route was not found.",
      },
    });
  });

  it("returns method-aware JSON errors for known API paths", async () => {
    const response = await handleStudioApiRequest(
      new Request("https://example.test/api/v1/studio/routes", { method: "POST" }),
      {},
    );

    expect(response?.status).toBe(405);
    expect(response?.headers.get("Allow")).toBe("GET");
    await expect(response?.json()).resolves.toEqual({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Method is not allowed for this API route.",
      },
    });
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
    const [routesResponse, detailResponse, speedHistoryResponse, docsResponse] = await Promise.all([
      fetchApi("/api/v1/studio/routes", env),
      fetchApi("/api/v1/studio/routes/m15-sbs", env),
      fetchApi("/api/v1/studio/routes/m15-sbs/speed-history", env),
      fetchApi("/api/v1/studio/docs", env),
    ]);

    expect(routesResponse.headers.get("Server-Timing")).toContain("studio;dur=");
    expect(routesResponse.headers.get("X-Studio-Release")).toBe("studio/v1");
    expect(StudioRoutesResponseSchema.parse(await routesResponse.json()).routes[0]?.slug).toBe(
      "m15-sbs",
    );
    // C2: the detail response embeds the pipeline-built capability row + dossier summary.
    expect((await detailResponse.json()) as unknown).toEqual(
      expect.objectContaining({
        schemaVersion: 2,
        route: expect.objectContaining({ slug: "m15-sbs" }),
        capability: expect.objectContaining({ overallState: "ready" }),
        dossier: expect.objectContaining({
          routeSlug: "m15-sbs",
          speed: expect.objectContaining({ current: 6.9, movement6mPct: -8, peerPercentile: 12 }),
          worstSegment: expect.objectContaining({ segmentId: "seg-1", persistenceMonths: 3 }),
        }),
      }),
    );
    const speedHistory = StudioRouteSpeedHistoryResponseSchema.parse(
      await speedHistoryResponse.json(),
    );
    expect(speedHistory.routeSlug).toBe("m15-sbs");
    expect(speedHistory.summary.cellCount).toBe(8);
    expect(speedHistory.cells.map((cell) => cell.status)).toEqual(["available", "missing"]);
    const docs = StudioDocsResponseSchema.parse(await docsResponse.json());
    expect(docs.sections[0]?.title).toBe("Quickstart");
    expect(docs.endpoints).toEqual(
      expect.arrayContaining([
        { method: "GET", path: "/api/v1/studio/routes", body: "List Studio route cards." },
        {
          method: "GET",
          path: "/api/v1/studio/routes/{routeId}",
          body: "Fetch route detail, KPIs, diagnosis, and segment evidence.",
        },
        {
          method: "POST",
          path: "/api/v1/studio/briefs",
          body: "Create a new Studio brief draft from a route, finding, or source brief seed.",
        },
      ]),
    );
    expect(docs.endpoints).not.toContainEqual({
      method: "GET",
      path: "/api/v1/studio/routes",
      body: "List routes.",
    });
    expect(docs.endpoints.length).toBe(
      Object.values(studioOpenApiDocument.paths).reduce(
        (sum, pathItem) =>
          sum +
          (["get", "post", "put", "patch", "delete"] as const).filter(
            (method) => pathItem[method] !== undefined,
          ).length,
        0,
      ),
    );
  });

  it("keeps the Tier-1 route dossier response within the 60 KB gzip budget (C2)", async () => {
    // Worst-case-shaped payload: full 36-month sparklines, every capability surface,
    // and far more segments/insights than any real route carries today (real worst
    // case measured 2026-06-10: ~5.3 KB gz across the 12 rich routes).
    const env = createStudioProjectionEnv();
    const response = await fetchApi("/api/v1/studio/routes/m15-sbs", env);
    const detail = StudioRouteDetailResponseSchema.parse(await response.json());
    const padded = {
      ...detail,
      segments: Array.from({ length: 60 }, (_, i) => ({
        id: `M15+:2026-03:N:${i}:node-${i}:node-${i + 1}`,
        routeSlug: "m15-sbs",
        direction: "NB",
        from: `Cross street number ${i} with a realistically long name`,
        to: `Cross street number ${i + 1} with a realistically long name`,
        speedMph: 6.5,
        scheduledMph: 8.2,
        riderHours: 1234.5,
        lane: "partial",
        ace: true,
        tsp: false,
        hours: Array.from({ length: 24 }, (_, h) => 5 + (h % 7)),
      })),
      dossier: {
        ...(detail.dossier ?? {}),
        speed: {
          ...(detail.dossier?.speed ?? {}),
          sparkline: Array.from({ length: 36 }, (_, i) => ({
            month: `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
            value: 6.123456 + i * 0.01,
          })),
        },
        ridership: {
          ...(detail.dossier?.ridership ?? {}),
          sparkline: Array.from({ length: 36 }, (_, i) => ({
            month: `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
            value: 40000 + i * 137,
          })),
        },
      },
    };
    const gzippedBytes = Bun.gzipSync(JSON.stringify(padded)).byteLength;
    expect(gzippedBytes).toBeLessThanOrEqual(60 * 1024);
  });

  it("serves a D1/R2-backed Studio route timeline bundle", async () => {
    const env = {
      ...createStudioProjectionEnv(),
      BASELINE_MONTH: "2026-03",
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    };

    const response = await fetchApi("/api/v1/studio/routes/m15-sbs/timeline", env);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Studio-Release")).toBe("studio/v1");
    expect((await response.json()) as unknown).toEqual(
      expect.objectContaining({
        artifactKind: "bp.tier2_route_timeline_bundle.v1",
        routeId: "M15+",
        events: [
          expect.objectContaining({
            eventId: "m15_sbs_launch_oct2010",
          }),
        ],
      }),
    );
  });

  it("enriches Studio route detail with frontend-safe route insights", async () => {
    const env = {
      ARTIFACTS: new FakeR2Bucket({
        "studio/v1/routes/m15-sbs/index.json": new FakeR2Object(
          JSON.stringify({
            schemaVersion: 2,
            generatedAt: "2026-06-05T00:00:00.000Z",
            route,
            segments: [],
            artifactRefs: [
              {
                routeId: "M15+",
                month: "2026-03",
                name: "detector_readiness_manifest",
                key: "studio/v2/detectors/route-detector-readiness-manifest.json",
                contentType: "application/json",
                byteLength: 1234,
                sha256: "a".repeat(64),
              },
            ],
            quality,
          }),
          "application/json",
        ),
        "studio/v2/detectors/route-detector-readiness-manifest.json": new FakeR2Object(
          JSON.stringify({
            artifactKind: "detector_readiness_serving_manifest",
            schemaVersion: 1,
            routes: [
              {
                routeId: "M15+",
                publicFindingCandidateRefs: [
                  {
                    detectorId: "customer_journey_shortfall",
                    routeId: "M15+",
                    scopeId: "M15+:2026-04:Peak:SBS",
                    month: "2026-04",
                    asOfMonth: "2026-04",
                    bucket: "public_finding_candidate",
                    evidenceRefPath: "cjtp.json#scope:m15-peak",
                    sourceProjectionPath: "cjtp.json",
                    caveats: ["true_customer_impact", "wait_component_driven"],
                  },
                  {
                    detectorId: "treatment_scope_gap",
                    routeId: "M15+",
                    scopeId: "M15+:2026-03:N:1:stop-a:stop-b",
                    month: "2026-03",
                    asOfMonth: null,
                    bucket: "public_finding_candidate",
                    evidenceRefPath: "treatment.json#scope:m15-gap",
                    sourceProjectionPath: "treatment.json",
                    caveats: ["fit_status:true_uncovered", "genuine_slowness"],
                  },
                ],
                routeContextRefs: [],
                reviewQueueCounts: { customer_journey_shortfall: 2 },
                suppressedCounts: { customer_journey_shortfall: 1 },
              },
            ],
          }),
          "application/json",
        ),
      }) as unknown as R2Bucket,
      BASELINE_MONTH: "2026-03",
      DB: createSparseStudioRouteDb() as unknown as D1Database,
    } satisfies StudioApiEnv;

    const response = await fetchApi("/api/v1/studio/routes/m15-sbs", env);
    const detail = StudioRouteDetailResponseSchema.parse(await response.json());

    expect(detail.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "customer_journey",
          placement: "overview",
          title: "Customer journey shortfall",
          shortText:
            "Customer journey shortfall appears in peak service, mainly on the wait-time side.",
        }),
        expect.objectContaining({
          kind: "treatment_scope",
          placement: "map_segment",
          title: "Possible treatment coverage gap",
          shortText: "This slow segment appears outside the confirmed treatment coverage.",
        }),
      ]),
    );
    expect(JSON.stringify(detail.insights)).not.toContain("reviewQueueCounts");
    expect(JSON.stringify(detail.insights)).not.toContain("suppressedCounts");
    expect(JSON.stringify(detail.insights)).not.toContain("reviewed signals");
  });

  it("loads alias route segment artifacts so treatment insights can attach to visible rows", async () => {
    const bx12Route = {
      ...route,
      slug: "bx12-sbs",
      routeId: "BX12+",
      label: "Bx12",
      corridor: "Bay Plaza - Inwood",
      corridorFull: "Bay Plaza - Inwood",
      borough: "Bronx",
      sbs: true,
    } as const;
    const richSegmentId = "BX12+:2026-03:W:1:802025:103255";
    const targetSegmentId = "BX12:2026-03:W:19:103999:104235";
    const env = {
      ARTIFACTS: new FakeR2Bucket({
        "studio/v1/routes/bx12-sbs/index.json": new FakeR2Object(
          JSON.stringify({
            schemaVersion: 2,
            generatedAt: "2026-06-05T00:00:00.000Z",
            route: bx12Route,
            segments: [
              {
                id: richSegmentId,
                routeSlug: "bx12-sbs",
                direction: "WB",
                from: "Fixture start",
                to: "Fixture end",
                speedMph: 6.4,
                scheduledMph: 8.7,
                riderHours: 14,
                lane: "yes",
                ace: false,
                tsp: false,
                hours: Array.from({ length: 24 }, () => 0),
              },
            ],
            artifactRefs: [],
            quality,
          }),
          "application/json",
        ),
        "studio/v2/routes/bx12/speed-spine.json": new FakeR2Object(
          JSON.stringify({
            artifactKind: "bp.route_speed_spine.v1",
            routeId: "BX12",
            routeSlug: "bx12",
            segments: [
              {
                segmentId: "bx12-w-node-005-node-007",
                direction: "W",
                displayOrder: 19,
                label: "E FORDHAM RD/WEBSTERAV to E FORDHAM RD/VALENTINE AV",
                averageRoadDistanceMiles: 0.42,
                averageSpeedMph: 5.9,
                raw: {
                  sourceStopPairs: [
                    {
                      fromStopId: "103999",
                      fromStopName: "E FORDHAM RD/WEBSTERAV",
                      toStopId: "104235",
                      toStopName: "E FORDHAM RD/VALENTINE AV",
                      stopOrders: [19],
                    },
                  ],
                },
              },
            ],
          }),
          "application/json",
        ),
        "studio/v2/detectors/route-detector-readiness-manifest.json": new FakeR2Object(
          JSON.stringify({
            artifactKind: "detector_readiness_serving_manifest",
            schemaVersion: 1,
            routes: [
              {
                routeId: "BX12",
                publicFindingCandidateRefs: [
                  {
                    detectorId: "treatment_scope_mismatch",
                    routeId: "BX12",
                    scopeId: targetSegmentId,
                    month: "2026-03",
                    asOfMonth: null,
                    bucket: "public_finding_candidate",
                    caveats: ["mismatch_overlap_confirmed"],
                  },
                ],
                routeContextRefs: [],
              },
            ],
          }),
          "application/json",
        ),
      }) as unknown as R2Bucket,
      BASELINE_MONTH: "2026-03",
      DB: new FakeDb({
        route_artifact: [],
        route_brief_summary: [
          {
            route_id: "BX12",
            month: "2026-03",
            public_visible: true,
            public_visibility_reason: "public",
            route_score: 32,
            average_speed_mph: 8.6,
            hotspot_count: 10,
            total_ridership: 4000,
            total_transfers: 0,
            ace_active: false,
            ace_violation_count: 0,
            bus_lane_matched_lane_count: 8,
            schedule_match_rate: 0.98,
          },
        ],
        route_catalog: [
          {
            route_id: "BX12",
            route_short_name: "Bx12",
            route_long_name: "Bay Plaza - Inwood",
            shape_count: 2,
            stop_count: 58,
            timepoint_stop_count: 12,
          },
        ],
        route_catalog_type: [
          {
            route_id: "BX12",
            type_rank: 1,
            route_type: "Select Bus Service",
          },
        ],
        route_month_trend: [],
        route_speed_history_coverage: [],
        route_timeline_index: [],
        source_month_coverage: [],
        route_observed_reliability_summary: [],
        route_readiness: [
          {
            route_id: "BX12",
            month: "2026-03",
            readiness_status: "ready",
            build_eligible: true,
            readiness_score: 100,
            speed_observation_count: 4000,
            speed_bus_trip_count: 70000,
            average_speed_mph: 8.6,
            schedule_timepoint_count: 12,
            shape_count: 2,
            stop_count: 58,
            timepoint_stop_count: 12,
          },
        ],
      }) as unknown as D1Database,
    } satisfies StudioApiEnv;

    const response = await fetchApi("/api/v1/studio/routes/bx12", env);
    const detail = StudioRouteDetailResponseSchema.parse(await response.json());

    expect(detail.route.routeId).toBe("BX12");
    expect(detail.route.slug).toBe("bx12");
    expect(detail.segments.map((segment) => segment.id)).toEqual([richSegmentId, targetSegmentId]);
    expect(detail.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scopeId: targetSegmentId,
          target: expect.objectContaining({
            segmentIds: expect.arrayContaining([targetSegmentId]),
          }),
        }),
      ]),
    );
    expect(detail.quality.caveats).toContain(
      "Segment rows are loaded from an equivalent base/SBS route artifact so detector segment refs can attach deterministically.",
    );
    expect(detail.quality.caveats).toContain(
      "Some detector insight segment rows are aligned from the route speed-spine provenance so detector refs attach to visible route rows.",
    );
  });

  it("serves a D1-backed Studio route index v2 from the full catalog", async () => {
    const db = new FakeDb({
      route_artifact: [
        {
          route_id: "M15+",
          month: "2026-03",
          artifact_name: "brief.json",
        },
      ],
      route_brief_summary: [
        {
          route_id: "M15+",
          month: "2026-03",
          public_visible: true,
          route_score: 24,
          average_speed_mph: 7.2,
          hotspot_count: 4,
          total_ridership: 900000,
          ace_active: true,
          bus_lane_matched_lane_count: 8,
        },
        {
          route_id: "B99",
          month: "2026-03",
          public_visible: false,
          route_score: 72,
          average_speed_mph: 11.1,
          hotspot_count: 0,
          total_ridership: 0,
          ace_active: false,
          bus_lane_matched_lane_count: 0,
        },
      ],
      route_catalog: [
        {
          route_id: "M15+",
          route_short_name: "M15-SBS",
          route_long_name: "East Harlem - South Ferry",
          shape_count: 2,
          stop_count: 42,
          timepoint_stop_count: 12,
        },
        {
          route_id: "B99",
          route_short_name: "B99",
          route_long_name: "Late Night Shuttle",
          shape_count: 1,
          stop_count: 10,
          timepoint_stop_count: 4,
        },
      ],
      route_catalog_type: [
        {
          route_id: "M15+",
          type_rank: 1,
          route_type: "Select Bus Service",
        },
        {
          route_id: "B99",
          type_rank: 1,
          route_type: "Local",
        },
      ],
      route_month_trend: [
        {
          route_id: "M15+",
          month: "2023-04",
          average_speed_mph: 7.1,
          ridership: 880000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2026-03",
          average_speed_mph: 7.2,
          ridership: 900000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "B99",
          month: "2026-03",
          average_speed_mph: null,
          ridership: null,
          has_speed_trend: false,
          has_ridership_trend: false,
        },
      ],
      route_speed_history_coverage: [
        {
          route_id: "M15+",
          month: "2026-03",
          route_slug: "m15-sbs",
          history_start_month: "2023-04",
          history_end_month: "2026-03",
          artifact_path: "studio/v2/routes/m15-sbs/speed-history.json",
          artifact_status: "written",
          month_count: 36,
          segment_count: 12,
          cell_count: 1728,
          available_cell_count: 1712,
          missing_cell_count: 16,
          generated_at: "2026-06-06T00:00:00.000Z",
        },
      ],
      route_readiness: [
        {
          route_id: "M15+",
          month: "2026-03",
          readiness_status: "ready",
          build_eligible: true,
          readiness_score: 100,
          speed_observation_count: 4000,
          speed_bus_trip_count: 70000,
          average_speed_mph: 7.2,
          schedule_timepoint_count: 12,
          shape_count: 2,
          stop_count: 42,
          timepoint_stop_count: 12,
        },
        {
          route_id: "B99",
          month: "2026-03",
          readiness_status: "partial",
          build_eligible: false,
          readiness_score: 60,
          speed_observation_count: 0,
          speed_bus_trip_count: 0,
          average_speed_mph: null,
          schedule_timepoint_count: 4,
          shape_count: 1,
          stop_count: 10,
          timepoint_stop_count: 4,
        },
      ],
    });

    const response = await fetchApi("/api/v1/studio/routes?schema=2", {
      ARTIFACTS: new FakeR2Bucket({
        [CAPABILITY_MANIFEST_KEY]: capabilityManifestArtifact(STANDARD_ROUTE_CAPABILITIES),
      }) as unknown as R2Bucket,
      BASELINE_MONTH: "2026-03",
      DB: db as unknown as D1Database,
      LAST_BUILT_SPEED_MONTH: "2026-03",
    });

    expect(response.status).toBe(200);
    const index = StudioRouteIndex2ResponseSchema.parse(await response.json());
    expect(index.routes.map((route) => route.routeId)).toEqual(["M15+", "B99"]);
    const richRoute = index.routes.find((route) => route.routeId === "M15+");
    // Capability is joined from the pipeline manifest, not computed in the Worker.
    expect(richRoute?.capability.overallState).toBe("ready");
    expect(richRoute?.capability.surfaces["speedHistory"]?.state).toBe("partial");
    const sparse = index.routes.find((route) => route.routeId === "B99");
    expect(sparse?.capability.overallState).toBe("building");
    expect(sparse?.capability.surfaces["detectorFindings"]?.state).toBe("insufficient_data");
    expect(sparse?.caveats).toContain(
      "A baseline summary exists, but the rich public artifact gate is not satisfied.",
    );
  });

  it("serves Snapshot 2.0 route sections from deterministic D1 route facts", async () => {
    const db = new FakeDb({
      route_artifact: [
        {
          route_id: "M15+",
          month: "2026-03",
          artifact_name: "brief.json",
        },
      ],
      route_brief_summary: [
        {
          route_id: "M15+",
          month: "2026-03",
          public_visible: true,
          public_visibility_reason: "public",
          route_score: 24,
          average_speed_mph: 7.2,
          hotspot_count: 4,
          total_ridership: 900000,
          total_transfers: 10000,
          ace_active: true,
          ace_violation_count: 10,
          bus_lane_matched_lane_count: 8,
          schedule_match_rate: 0.98,
        },
        {
          route_id: "Q1",
          month: "2026-03",
          public_visible: true,
          public_visibility_reason: "public",
          route_score: 35,
          average_speed_mph: 6.5,
          hotspot_count: 6,
          total_ridership: 600000,
          total_transfers: 5000,
          ace_active: false,
          ace_violation_count: 0,
          bus_lane_matched_lane_count: 0,
          schedule_match_rate: 0.74,
        },
        {
          route_id: "B99",
          month: "2026-03",
          public_visible: false,
          public_visibility_reason: "no_rich_artifact",
          route_score: 72,
          average_speed_mph: 11.1,
          hotspot_count: 0,
          total_ridership: 0,
          total_transfers: 0,
          ace_active: false,
          ace_violation_count: 0,
          bus_lane_matched_lane_count: 0,
          schedule_match_rate: 0.6,
        },
      ],
      route_catalog: [
        {
          route_id: "M15+",
          route_short_name: "M15-SBS",
          route_long_name: "East Harlem - South Ferry",
          shape_count: 2,
          stop_count: 42,
          timepoint_stop_count: 12,
        },
        {
          route_id: "Q1",
          route_short_name: "Q1",
          route_long_name: "Queens Village - Jamaica",
          shape_count: 1,
          stop_count: 28,
          timepoint_stop_count: 8,
        },
        {
          route_id: "B99",
          route_short_name: "B99",
          route_long_name: "Late Night Shuttle",
          shape_count: 1,
          stop_count: 10,
          timepoint_stop_count: 4,
        },
      ],
      route_catalog_type: [
        {
          route_id: "M15+",
          type_rank: 1,
          route_type: "Select Bus Service",
        },
        {
          route_id: "Q1",
          type_rank: 1,
          route_type: "Local",
        },
        {
          route_id: "B99",
          type_rank: 1,
          route_type: "Local",
        },
      ],
      route_month_trend: [
        {
          route_id: "M15+",
          month: "2023-04",
          average_speed_mph: 8.2,
          ridership: 820000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2023-05",
          average_speed_mph: 8.1,
          ridership: 830000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2023-06",
          average_speed_mph: 8,
          ridership: 840000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2023-07",
          average_speed_mph: 7.9,
          ridership: 850000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2023-08",
          average_speed_mph: 7.8,
          ridership: 860000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2025-03",
          average_speed_mph: 7.6,
          ridership: 880000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2025-09",
          average_speed_mph: 7.5,
          ridership: 890000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "M15+",
          month: "2026-03",
          average_speed_mph: 7.2,
          ridership: 900000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "Q1",
          month: "2023-04",
          average_speed_mph: 6.7,
          ridership: 560000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "Q1",
          month: "2026-03",
          average_speed_mph: 6.5,
          ridership: 600000,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "B99",
          month: "2026-03",
          average_speed_mph: null,
          ridership: null,
          has_speed_trend: false,
          has_ridership_trend: false,
        },
      ],
      route_speed_history_coverage: [
        {
          route_id: "M15+",
          month: "2026-03",
          route_slug: "m15-sbs",
          history_start_month: "2023-04",
          history_end_month: "2026-03",
          artifact_path: "studio/v2/routes/m15-sbs/speed-history.json",
          artifact_status: "written",
          month_count: 36,
          segment_count: 12,
          cell_count: 1728,
          available_cell_count: 1712,
          missing_cell_count: 16,
          generated_at: "2026-06-06T00:00:00.000Z",
        },
      ],
      route_readiness: [
        {
          route_id: "M15+",
          month: "2026-03",
          readiness_status: "ready",
          build_eligible: true,
          readiness_score: 100,
          speed_observation_count: 4000,
          speed_bus_trip_count: 70000,
          average_speed_mph: 7.2,
          schedule_timepoint_count: 12,
          shape_count: 2,
          stop_count: 42,
          timepoint_stop_count: 12,
        },
        {
          route_id: "Q1",
          month: "2026-03",
          readiness_status: "partial",
          build_eligible: true,
          readiness_score: 78,
          speed_observation_count: 2200,
          speed_bus_trip_count: 32000,
          average_speed_mph: 6.5,
          schedule_timepoint_count: 0,
          shape_count: 1,
          stop_count: 28,
          timepoint_stop_count: 8,
        },
        {
          route_id: "B99",
          month: "2026-03",
          readiness_status: "partial",
          build_eligible: false,
          readiness_score: 60,
          speed_observation_count: 0,
          speed_bus_trip_count: 0,
          average_speed_mph: null,
          schedule_timepoint_count: 4,
          shape_count: 1,
          stop_count: 10,
          timepoint_stop_count: 4,
        },
      ],
    });

    const response = await fetchApi("/api/v1/studio/routes/sections", {
      ARTIFACTS: new FakeR2Bucket({
        [CAPABILITY_MANIFEST_KEY]: capabilityManifestArtifact(STANDARD_ROUTE_CAPABILITIES),
      }) as unknown as R2Bucket,
      BASELINE_MONTH: "2026-03",
      DB: db as unknown as D1Database,
      LAST_BUILT_SPEED_MONTH: "2026-03",
    });

    expect(response.status).toBe(200);
    const routeSections = StudioRouteSectionsResponseSchema.parse(await response.json());
    // C3: months are resolved internally from D1, and rankings declare their freshness.
    expect(routeSections.baselineMonth).toBe("2026-03");
    expect(routeSections.dataAsOf).toBe("2026-03");
    expect(routeSections.sections.map((section) => section.sectionId)).toEqual([
      "needs_attention",
      "worsening_fast",
      "treatment_gaps",
      "data_coverage",
      "reliability_watch",
      "evidence_ready",
    ]);

    const sections = new Map(routeSections.sections.map((section) => [section.sectionId, section]));
    expect(sections.get("needs_attention")).toEqual(
      expect.objectContaining({
        status: "available",
        rows: expect.arrayContaining([
          expect.objectContaining({ rank: 1, routeId: "M15+", slug: "m15-sbs" }),
        ]),
      }),
    );
    expect(sections.get("worsening_fast")).toEqual(
      expect.objectContaining({
        status: "partial",
        rows: expect.arrayContaining([
          expect.objectContaining({
            routeId: "M15+",
            reasons: expect.arrayContaining(["-1.0 mph from 2023-04 to 2026-03"]),
            // §16-D3: every section row carries 6-month movement + 12-month context.
            movement6mPct: expect.any(Number),
            context12mPct: expect.any(Number),
          }),
        ]),
      }),
    );
    expect(sections.get("treatment_gaps")).toEqual(
      expect.objectContaining({
        status: "partial",
        rows: expect.arrayContaining([
          expect.objectContaining({
            routeId: "Q1",
            reasons: expect.arrayContaining(["No ACE or bus-lane match in summary"]),
          }),
        ]),
      }),
    );
    expect(sections.get("data_coverage")).toEqual(
      expect.objectContaining({
        status: "available",
        rows: expect.arrayContaining([
          expect.objectContaining({
            routeId: "B99",
            reasons: expect.arrayContaining([
              "detector findings insufficient_data",
              "speed history insufficient_data",
              "ridership history insufficient_data",
            ]),
          }),
        ]),
      }),
    );
    expect(sections.get("reliability_watch")).toEqual(
      expect.objectContaining({
        status: "not_built",
        rows: [],
        notBuiltReason: expect.any(String),
      }),
    );
    expect(sections.get("evidence_ready")).toEqual(
      expect.objectContaining({
        status: "not_built",
        rows: [],
        notBuiltReason: expect.any(String),
      }),
    );
  });

  it("promotes Evidence Ready route sections when Tier 2 materialized views are published", async () => {
    const env = {
      ARTIFACTS: new FakeR2Bucket({
        "studio/v2/tier2/vocab-materialized-views.json": new FakeR2Object(
          JSON.stringify({
            artifactKind: "bp.tier2_vocab_materialized_views.v1",
            schemaVersion: 1,
            generatedAt: "2026-06-06T20:00:00.000Z",
            routeEvidenceBundles: [
              {
                routeId: "M15",
                surfaceCount: 90,
                mappedFieldCount: 104,
                unresolvedFieldCount: 22,
                sourceCount: 35,
                sourceIds: ["mta-board-1", "nyc-dot-1"],
                timelineCandidateSurfaceCount: 8,
                metricObservationSurfaceCount: 20,
                treatmentSurfaceCount: 12,
                claimSurfaceCount: 7,
                evidencePointerCount: 140,
              },
              {
                routeId: "B99",
                surfaceCount: 12,
                mappedFieldCount: 20,
                unresolvedFieldCount: 2,
                sourceCount: 4,
                sourceIds: ["mta-board-2"],
                timelineCandidateSurfaceCount: 1,
                metricObservationSurfaceCount: 2,
                treatmentSurfaceCount: 0,
                claimSurfaceCount: 1,
                evidencePointerCount: 22,
              },
            ],
          }),
          "application/json",
        ),
      }) as unknown as R2Bucket,
      BASELINE_MONTH: "2026-03",
      DB: createSparseStudioRouteDb() as unknown as D1Database,
      LAST_BUILT_SPEED_MONTH: "2026-03",
    };

    const response = await fetchApi("/api/v1/studio/routes/sections", env);

    expect(response.status).toBe(200);
    const routeSections = StudioRouteSectionsResponseSchema.parse(await response.json());
    const evidenceReady = routeSections.sections.find(
      (section) => section.sectionId === "evidence_ready",
    );
    expect(evidenceReady).toEqual(
      expect.objectContaining({
        status: "partial",
        notBuiltReason: null,
        rows: expect.arrayContaining([
          expect.objectContaining({
            routeId: "M15+",
            slug: "m15-sbs",
            supportLevel: "evidence_ready",
            reasons: expect.arrayContaining([
              "90 route-linked Tier 2 surfaces",
              "35 sources",
              "104 normalized fields",
            ]),
            metrics: expect.arrayContaining([
              expect.objectContaining({ id: "tier2_surfaces", value: 90 }),
              expect.objectContaining({ id: "timeline_candidates", value: 8 }),
            ]),
          }),
          expect.objectContaining({
            routeId: "B99",
            slug: "b99",
            supportLevel: "evidence_ready",
          }),
        ]),
      }),
    );
    expect(routeSections.quality.caveats).toContain(
      "Reliability Watch is not_built; Evidence Ready is derived from the published Tier 2 materialized-view artifact.",
    );
  });

  it("resolves sparse catalog routes through list, search, and detail", async () => {
    const env = {
      ...createStudioProjectionEnv(),
      BASELINE_MONTH: "2026-03",
      DB: createSparseStudioRouteDb() as unknown as D1Database,
      LAST_BUILT_SPEED_MONTH: "2026-03",
    };

    const [routesResponse, searchResponse, detailResponse, historyResponse] =
      await Promise.all([
        fetchApi("/api/v1/studio/routes", env),
        fetchApi("/api/v1/studio/search?q=late%20night", env),
        fetchApi("/api/v1/studio/routes/b99", env),
        fetchApi("/api/v1/studio/routes/b99/history", env),
      ]);

    expect(routesResponse.status).toBe(200);
    const routes = StudioRoutesResponseSchema.parse(await routesResponse.json());
    expect(routes.routes.map((candidate) => candidate.slug)).toEqual(["m15-sbs", "b99"]);
    expect(routes.routes.find((candidate) => candidate.slug === "b99")?.flags).toContain(
      "No rich artifact",
    );

    expect(searchResponse.status).toBe(200);
    const search = StudioSearchResponseSchema.parse(await searchResponse.json());
    expect(search.routes.map((candidate) => candidate.slug)).toContain("b99");

    expect(detailResponse.status).toBe(200);
    const detail = StudioRouteDetailResponseSchema.parse(await detailResponse.json());
    expect(detail.route.slug).toBe("b99");
    expect(detail.segments).toEqual([]);
    expect(detail.artifactRefs).toEqual([]);
    expect(detail.quality.caveats).toContain(
      "This is a partial route detail built from the all-route index; rich map, segment, finding, and evidence sections may be unavailable.",
    );

    expect(historyResponse.status).toBe(200);
    const history = StudioRouteHistoryResponseSchema.parse(await historyResponse.json());
    expect(history.route.slug).toBe("b99");
    expect(history.points).toHaveLength(1);
    expect(history.coverage).toEqual({
      startMonth: "2026-03",
      endMonth: "2026-03",
      pointCount: 1,
      speedMonthCount: 0,
      ridershipMonthCount: 0,
    });
  });

  it("keeps Snapshot 2.0 addressability endpoints mutually consistent", async () => {
    const env = {
      ...createStudioProjectionEnv(),
      BASELINE_MONTH: "2026-03",
      DB: createSparseStudioRouteDb() as unknown as D1Database,
      LAST_BUILT_SPEED_MONTH: "2026-03",
    };

    const [snapshotResponse, routeIndexResponse, routesResponse] = await Promise.all([
      fetchApi("/api/v1/studio/snapshot", env),
      fetchApi("/api/v1/studio/routes?schema=2", env),
      fetchApi("/api/v1/studio/routes", env),
    ]);

    const snapshot = StudioSnapshotResponseSchema.parse(await snapshotResponse.json());
    const routeIndex = StudioRouteIndex2ResponseSchema.parse(await routeIndexResponse.json());
    const routes = StudioRoutesResponseSchema.parse(await routesResponse.json());
    const snapshot2 = snapshot.v2;

    expect(snapshot2).toBeDefined();
    expect(snapshot2?.routeUniverse).toEqual(
      expect.objectContaining({
        source: "route_catalog",
        indexedRouteCount: routeIndex.routes.length,
        routeCount: routeIndex.routes.length,
      }),
    );
    expect(snapshot2?.counts.routeIndexRows).toBe(routeIndex.routes.length);
    expect(snapshot2?.counts.routeHistoryRows).toBe(
      routeIndex.routes.reduce((sum, route) => sum + route.historyCoverage.pointCount, 0),
    );
    expect(snapshot2?.counts.routeSpeedHistoryCoverageRows).toBe(1);
    expect(snapshot2?.counts.sourceMonthCoverageRows).toBe(2);
    expect(snapshot2?.sourceMonths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "local_route_schedule_stop_source_year",
          status: "partial",
          routeCount: 375,
          grain: "source year x route x schedule stop",
        }),
        expect.objectContaining({
          sourceId: "detector_model_artifact_status",
          status: "available",
          rowCount: 2,
          grain: "model_artifact_status",
          producerCommand: "evaluate detectors",
        }),
      ]),
    );
    expect(snapshot2?.projections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "route_index",
          path: "/api/v1/studio/routes?schema=2",
          status: "available",
        }),
        expect.objectContaining({
          id: "route_history_summary",
          path: "/api/v1/studio/routes/:routeId/history",
          status: "available",
        }),
        expect.objectContaining({
          id: "route_speed_history",
          path: "/api/v1/studio/routes/:routeId/speed-history",
          status: "partial",
        }),
        expect.objectContaining({
          id: "source_month_coverage",
          path: "d1:source_month_coverage",
          status: "available",
        }),
        expect.objectContaining({
          id: "detector_model_status",
          path: "studio/v2/detectors/model-artifacts.json",
          status: "partial",
          storage: "r2",
          months: expect.objectContaining({ start: "2023-04", end: "2026-03" }),
        }),
      ]),
    );
    expect(snapshot2?.caveats).toContain(
      "Detector model status is published as a compact R2 projection; raw model rows remain internal.",
    );

    const routeIndexSlugs = routeIndex.routes.map((route) => route.slug);
    expect(routes.routes.map((route) => route.slug)).toEqual(routeIndexSlugs);
    expect(uniqueValues(routeIndex.routes.map((route) => route.routeId))).toHaveLength(
      routeIndex.routes.length,
    );
    expect(uniqueValues(routeIndexSlugs)).toHaveLength(routeIndex.routes.length);

    const sparseRoute = routeIndex.routes.find(
      (route) => route.capability.overallState === "building",
    );
    if (sparseRoute === undefined) {
      throw new Error("Expected fixture to include a sparse Snapshot 2.0 route.");
    }
    expect(sparseRoute.slug).toBe("b99");
    expect(sparseRoute.capability.surfaces["detectorFindings"]?.state).toBe("insufficient_data");

    const historyRoute = routeIndex.routes.find(
      (route) => route.historyCoverage.speedMonthCount > 0,
    );
    if (historyRoute === undefined) {
      throw new Error("Expected fixture to include a route with speed history.");
    }
    expect(historyRoute).toEqual(expect.objectContaining({ slug: "m15-sbs" }));
    expect(historyRoute.projectionRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "route_speed_history",
          path: "/api/v1/studio/routes/m15-sbs/speed-history",
          status: "partial",
          months: expect.objectContaining({ end: "2026-03" }),
        }),
      ]),
    );

    const [searchResponse, detailResponse, historyResponse] = await Promise.all([
      fetchApi("/api/v1/studio/search?q=late%20night", env),
      fetchApi(`/api/v1/studio/routes/${sparseRoute.slug}`, env),
      fetchApi(`/api/v1/studio/routes/${historyRoute.slug}/history`, env),
    ]);

    const search = StudioSearchResponseSchema.parse(await searchResponse.json());
    expect(search.routes.map((route) => route.slug)).toContain(sparseRoute.slug);

    const detail = StudioRouteDetailResponseSchema.parse(await detailResponse.json());
    expect(detail.route.slug).toBe(sparseRoute.slug);
    expect(detail.segments).toEqual([]);
    expect(detail.quality.caveats).toEqual(
      expect.arrayContaining([
        "This is a partial route detail built from the all-route index; rich map, segment, finding, and evidence sections may be unavailable.",
      ]),
    );

    const history = StudioRouteHistoryResponseSchema.parse(await historyResponse.json());
    expect(history.route.slug).toBe(historyRoute.slug);
    expect(history.coverage).toEqual(historyRoute.historyCoverage);
    expect(history.coverage.pointCount).toBe(history.points.length);
  });

  it("serves D1-backed Studio route month history", async () => {
    const db = new FakeDb({
      route_artifact: [],
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
      ],
      route_catalog: [
        {
          route_id: "B46-SBS",
          route_short_name: "B46-SBS",
          route_long_name: "Kings Plaza - Williamsburg Bridge Plaza",
          shape_count: 2,
          stop_count: 44,
          timepoint_stop_count: 12,
        },
      ],
      route_catalog_type: [
        {
          route_id: "B46-SBS",
          type_rank: 1,
          route_type: "Select Bus Service",
        },
      ],
      route_month_trend: [
        {
          route_id: "B46-SBS",
          month: "2023-04",
          speed_observation_count: 4106,
          speed_bus_trip_count: 72587,
          average_speed_mph: 7.5684,
          ridership: 380085,
          transfers: 70737,
          has_speed_trend: true,
          has_ridership_trend: true,
        },
        {
          route_id: "B46-SBS",
          month: "2026-05",
          speed_observation_count: 0,
          speed_bus_trip_count: 0,
          average_speed_mph: null,
          ridership: 411222,
          transfers: 80123,
          has_speed_trend: false,
          has_ridership_trend: true,
        },
      ],
      route_observed_reliability_summary: [],
      route_readiness: [
        {
          route_id: "B46-SBS",
          month: "2026-03",
          route_short_name: "B46-SBS",
          route_long_name: "Kings Plaza - Williamsburg Bridge Plaza",
          readiness_status: "ready",
          build_eligible: true,
          readiness_score: 100,
          speed_observation_count: 4000,
          speed_bus_trip_count: 70000,
          average_speed_mph: 6.4,
          schedule_timepoint_count: 12,
          shape_count: 2,
          stop_count: 44,
          timepoint_stop_count: 12,
        },
      ],
      route_readiness_missing_input: [],
    });
    const response = await fetchApi("/api/v1/studio/routes/b46-sbs/history", {
      BASELINE_MONTH: "2026-03",
      DB: db as unknown as D1Database,
      LAST_BUILT_SPEED_MONTH: "2026-03",
    });

    expect(response.status).toBe(200);
    const history = StudioRouteHistoryResponseSchema.parse(await response.json());
    expect(history.route.slug).toBe("b46-sbs");
    expect(history.coverage).toEqual({
      startMonth: "2023-04",
      endMonth: "2026-05",
      pointCount: 2,
      speedMonthCount: 1,
      ridershipMonthCount: 2,
    });
    expect(history.points[1]).toEqual(
      expect.objectContaining({
        month: "2026-05",
        averageSpeedMph: null,
        ridership: 411222,
        hasSpeedTrend: false,
        hasRidershipTrend: true,
      }),
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
