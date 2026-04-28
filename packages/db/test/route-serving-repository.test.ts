import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createBunSqliteServingDb } from "../src/d1/bun-sqlite.js";
import type { D1ServingDb } from "../src/d1/index.js";
import { routeArtifact, routeComparisonRank, routeMonthTrend } from "../src/d1/schema.js";
import type { D1DatabaseLike, D1PreparedStatement, D1Result, D1Value } from "../src/index.js";
import {
  getRouteBatchStatus,
  getRouteBriefSummary,
  listBuildEligibleRoutes,
  listRouteArtifacts,
  listRouteBriefSummaries,
  listRouteBuildPlan,
  listRouteComparisonRanks,
  listRouteEquityContexts,
  listRouteMonthTrends,
  listRouteReadiness,
  listRouteReliabilityBaselines,
  listSelectedRouteBuildCandidates,
} from "../src/index.js";

type QueryCall = {
  query: string;
  bound: D1Value[];
};

class FakeStatement<T> implements D1PreparedStatement<T> {
  constructor(
    private readonly call: QueryCall,
    private readonly rows: T[],
  ) {}

  bind(...values: D1Value[]): D1PreparedStatement<T> {
    this.call.bound = values;
    return this;
  }

  async first(): Promise<T | null> {
    return this.rows[0] ?? null;
  }

  async all(): Promise<D1Result<T>> {
    return { results: this.rows };
  }
}

class FakeDb implements D1DatabaseLike {
  readonly calls: QueryCall[] = [];

  constructor(private readonly rowsByTable: Record<string, unknown[]>) {}

  prepare<T = unknown>(query: string): D1PreparedStatement<T> {
    const call = { query, bound: [] };
    this.calls.push(call);
    const table = Object.keys(this.rowsByTable)
      .toSorted((left, right) => right.length - left.length)
      .find((candidate) => query.includes(candidate));
    const rows = (table === undefined ? [] : this.rowsByTable[table]) as T[];

    return new FakeStatement(call, rows);
  }
}

async function createDrizzleTestDb(): Promise<{ db: D1ServingDb; sqlite: Database }> {
  const sqlite = new Database(":memory:");
  const migrationSql = await Bun.file(
    new URL("../migrations/d1/0000_tense_jane_foster.sql", import.meta.url),
  ).text();
  sqlite.exec(migrationSql);

  return {
    db: createBunSqliteServingDb(sqlite),
    sqlite,
  };
}

const summaryRow = {
  route_id: "M1",
  month: "2026-03",
  route_score: 16,
  public_visible: 1,
  public_visibility_reason: "standard_route",
  average_speed_mph: 6.7409,
  hotspot_count: 10,
  total_ridership: 207870,
  total_transfers: 40500,
  ace_active: 0,
  ace_violation_count: 0,
  bus_lane_matched_lane_count: 228,
  schedule_match_rate: 1,
};

const peakWindowRow = {
  route_id: "M1",
  month: "2026-03",
  window_rank: 1,
  day_of_week: "Monday",
  hour_of_day: 17,
  ridership: 500,
  transfers: 50,
  matched_observation_count: 10,
  bus_trip_count: 100,
  weighted_average_speed_mph: 6.5,
  slow_observation_share: 0.2,
};

const slowestWindowRow = {
  route_id: "M1",
  month: "2026-03",
  window_rank: 1,
  day_of_week: "Thursday",
  hour_of_day: 12,
  observation_count: 10,
  bus_trip_count: 100,
  segment_count: 5,
  weighted_average_speed_mph: 4.5,
  weighted_average_travel_time_minutes: 9,
  slow_observation_share: 0.8,
};

const readinessRow = {
  route_id: "M1",
  month: "2026-03",
  route_short_name: "M1",
  route_long_name: "Harlem - East Village",
  readiness_status: "ready",
  build_eligible: 1,
  readiness_score: 100,
  speed_observation_count: 2003,
  speed_bus_trip_count: 15000,
  average_speed_mph: 6.7409,
  schedule_timepoint_count: 35566,
  shape_count: 37,
  stop_count: 164,
  timepoint_stop_count: 64,
};

const buildPlanRow = {
  route_id: "M57",
  month: "2026-03",
  route_short_name: "M57",
  route_long_name: "East Side - West Side",
  candidate_rank: 1,
  plan_status: "selected",
  selected_for_next_batch: 1,
  already_built: 0,
  build_eligible: 1,
  priority_score: 3000.75,
  readiness_status: "ready",
  readiness_score: 100,
  speed_observation_count: 5549,
  speed_bus_trip_count: 14369,
  average_speed_mph: 5.2718,
  schedule_timepoint_count: 12650,
};

const batchStatusRow = {
  month: "2026-03",
  generated_at: "2026-04-27T14:45:59.462Z",
  status: "pass",
  route_count: 7,
  artifact_count: 63,
  missing_artifact_count: 0,
  hash_mismatch_count: 0,
  byte_length_mismatch_count: 0,
  total_byte_length: 123456,
  issue_count: 0,
};

const batchBuiltRouteRows = [
  {
    month: "2026-03",
    route_rank: 1,
    route_id: "M1",
    artifact_count: null,
    status: "built",
  },
  {
    month: "2026-03",
    route_rank: 2,
    route_id: "M2",
    artifact_count: null,
    status: "built",
  },
  {
    month: "2026-03",
    route_rank: 3,
    route_id: "M57",
    artifact_count: null,
    status: "built",
  },
];

const batchIssueRows: unknown[] = [];

const reliabilityGapWindowRow = {
  route_id: "M57",
  month: "2026-03",
  window_rank: 1,
  day_type: "weekday",
  direction_id: "N",
  stop_id: "S1",
  stop_name: null,
  sample_count: 50,
  median_headway_minutes: 10,
  p90_headway_minutes: 20,
  max_headway_minutes: 30,
};

const reliabilitySourceStatusRows = [
  {
    route_id: "M57",
    month: "2026-03",
    source_scope: "reliability",
    source_id: "observedHeadways",
    status: "needs_gtfs_rt_collection",
    row_count: null,
    snapshot_id: null,
    note: null,
  },
];

const equitySourceStatusRows = [
  {
    route_id: "M1",
    month: "2026-03",
    source_scope: "equity_context",
    source_id: "routeSpatialJoin",
    status: "pending_tract_geometry_join",
    row_count: null,
    snapshot_id: null,
    note: null,
  },
];

const allSourceStatusRows = [...reliabilitySourceStatusRows, ...equitySourceStatusRows];

const missingInputRows: unknown[] = [];

const reliabilityBaselineRow = {
  route_id: "M57",
  month: "2026-03",
  reliability_status: "scheduled_baseline_only",
  scheduled_timepoint_count: 23464,
  stop_headway_group_count: 126,
  headway_sample_count: 23000,
  median_scheduled_headway_minutes: 10,
  p90_scheduled_headway_minutes: 20,
  max_scheduled_headway_minutes: 60,
  scheduled_short_headway_share: 0.02,
  scheduled_long_gap_share: 0.15,
};

const equityContextRow = {
  route_id: "M1",
  month: "2026-03",
  acs_year: 2024,
  assignment_geography: "county_proxy",
  assigned_county_fips: "061",
  assigned_county_name: "New York County",
  assignment_method: "route_id_prefix",
  tract_count: 309,
  total_population: 1640000,
  occupied_housing_units: 780000,
  no_vehicle_households: 600000,
  no_vehicle_household_share: 0.7692,
  median_household_income: 98000,
  poverty_rate: 15.4,
  public_transit_commuter_share: 58.2,
  hispanic_share: 25.1,
  non_hispanic_white_share: 44.3,
  non_hispanic_black_share: 12.1,
  non_hispanic_asian_share: 14.2,
};

describe("route serving repository", () => {
  test("lists route brief summaries with typed child rows", async () => {
    const db = new FakeDb({
      route_brief_peak_window: [peakWindowRow],
      route_brief_slowest_window: [slowestWindowRow],
      route_brief_summary: [summaryRow],
    });

    const rows = await listRouteBriefSummaries(db, "2026-03");

    expect(db.calls[0]).toEqual(
      expect.objectContaining({
        bound: ["2026-03"],
      }),
    );
    expect(db.calls[0]?.query).toContain("WHERE month = ? AND public_visible = 1");
    expect(db.calls[0]?.query).toContain("ORDER BY route_score ASC");
    expect(rows).toEqual([
      expect.objectContaining({
        routeId: "M1",
        month: "2026-03",
        routeScore: 16,
        aceActive: false,
        peakRidership: expect.objectContaining({ dayOfWeek: "Monday", hourOfDay: 17 }),
        slowestWindow: expect.objectContaining({ dayOfWeek: "Thursday", hourOfDay: 12 }),
      }),
    ]);
  });

  test("gets one route brief summary by route and month", async () => {
    const db = new FakeDb({
      route_brief_peak_window: [peakWindowRow],
      route_brief_slowest_window: [slowestWindowRow],
      route_brief_summary: [{ ...summaryRow, ace_active: 1 }],
    });

    const row = await getRouteBriefSummary(db, "M1", "2026-03");

    expect(db.calls[0]?.bound).toEqual(["M1", "2026-03"]);
    expect(row).toEqual(
      expect.objectContaining({
        routeId: "M1",
        aceActive: true,
      }),
    );
  });

  test("returns null when a route brief summary does not exist", async () => {
    const db = new FakeDb({ route_brief_summary: [] });

    await expect(getRouteBriefSummary(db, "M9", "2026-03")).resolves.toBeNull();
  });

  test("gets route batch status with typed child rows", async () => {
    const db = new FakeDb({
      route_batch_built_route: batchBuiltRouteRows,
      route_batch_issue: batchIssueRows,
      route_batch_status: [batchStatusRow],
    });

    const row = await getRouteBatchStatus(db, "2026-03");

    expect(db.calls[0]?.query).toContain("FROM route_batch_status");
    expect(db.calls[0]?.bound).toEqual(["2026-03"]);
    expect(row).toEqual(
      expect.objectContaining({
        month: "2026-03",
        status: "pass",
        routeCount: 7,
        artifactCount: 63,
        builtRouteIds: ["M1", "M2", "M57"],
        issues: [],
      }),
    );
  });

  test("lists artifact metadata for a route", async () => {
    const { db, sqlite } = await createDrizzleTestDb();
    await db.insert(routeArtifact).values({
      routeId: "M1",
      month: "2026-03",
      artifactName: "route-brief-input.json",
      artifactKey: "route-slices/m1-2026-03/route-brief-input.json",
      contentType: "application/json",
      byteLength: 123,
      sha256: "a".repeat(64),
    });

    const rows = await listRouteArtifacts(db, "M1", "2026-03");

    expect(rows).toEqual([
      expect.objectContaining({
        routeId: "M1",
        artifactName: "route-brief-input.json",
        byteLength: 123,
      }),
    ]);
    sqlite.close();
  });

  test("lists comparison ranks ordered by rank", async () => {
    const { db, sqlite } = await createDrizzleTestDb();
    await db.insert(routeComparisonRank).values({
      month: "2026-03",
      rank: 1,
      routeId: "M1",
      routeScore: 16,
      averageSpeedMph: 6.7409,
      totalRidership: 207870,
      aceViolationCount: 0,
      busLaneMatchedLaneCount: 228,
    });

    const rows = await listRouteComparisonRanks(db, "2026-03");

    expect(rows).toEqual([
      expect.objectContaining({
        rank: 1,
        routeId: "M1",
        routeScore: 16,
      }),
    ]);
    sqlite.close();
  });

  test("lists route readiness rows with missing input details", async () => {
    const db = new FakeDb({
      route_readiness_missing_input: missingInputRows,
      route_readiness: [readinessRow],
    });

    const rows = await listRouteReadiness(db, "2026-03");

    expect(db.calls[0]?.query).toContain("ORDER BY build_eligible DESC");
    expect(db.calls[0]?.bound).toEqual(["2026-03"]);
    expect(rows).toEqual([
      expect.objectContaining({
        routeId: "M1",
        buildEligible: true,
        readinessScore: 100,
        missingInputs: [],
      }),
    ]);
  });

  test("lists build-eligible routes only", async () => {
    const db = new FakeDb({
      route_readiness_missing_input: missingInputRows,
      route_readiness: [readinessRow],
    });

    const rows = await listBuildEligibleRoutes(db, "2026-03");

    expect(db.calls[0]?.query).toContain("WHERE month = ? AND build_eligible = 1");
    expect(rows[0]).toEqual(
      expect.objectContaining({
        routeId: "M1",
        readinessStatus: "ready",
      }),
    );
  });

  test("lists route build plan rows with typed flags and child rows", async () => {
    const db = new FakeDb({
      route_readiness_missing_input: missingInputRows,
      route_build_plan: [buildPlanRow],
    });

    const rows = await listRouteBuildPlan(db, "2026-03");

    expect(db.calls[0]?.query).toContain("FROM route_build_plan");
    expect(db.calls[0]?.bound).toEqual(["2026-03"]);
    expect(rows).toEqual([
      expect.objectContaining({
        routeId: "M57",
        candidateRank: 1,
        planStatus: "selected",
        selectedForNextBatch: true,
        alreadyBuilt: false,
        missingInputs: [],
      }),
    ]);
  });

  test("lists route reliability baseline rows with child rows", async () => {
    const db = new FakeDb({
      route_reliability_gap_window: [reliabilityGapWindowRow],
      route_month_source_status: allSourceStatusRows,
      route_reliability_baseline: [reliabilityBaselineRow],
    });

    const rows = await listRouteReliabilityBaselines(db, "2026-03");

    expect(db.calls[0]?.query).toContain("FROM route_reliability_baseline");
    expect(db.calls[0]?.bound).toEqual(["2026-03"]);
    expect(rows).toEqual([
      expect.objectContaining({
        routeId: "M57",
        reliabilityStatus: "scheduled_baseline_only",
        p90ScheduledHeadwayMinutes: 20,
        topLongGapWindows: [expect.objectContaining({ stopId: "S1", p90HeadwayMinutes: 20 })],
        sourceStatus: { observedHeadways: "needs_gtfs_rt_collection" },
      }),
    ]);
  });

  test("lists route monthly trend rows ordered by month", async () => {
    const { db, sqlite } = await createDrizzleTestDb();
    await db.insert(routeMonthTrend).values({
      routeId: "M57",
      month: "2026-03",
      speedObservationCount: 5549,
      speedBusTripCount: 14369,
      averageSpeedMph: 5.2718,
      ridership: 250000,
      transfers: 30000,
      hasSpeedTrend: true,
      hasRidershipTrend: true,
    });

    const rows = await listRouteMonthTrends(db, "M57");

    expect(rows).toEqual([
      expect.objectContaining({
        routeId: "M57",
        month: "2026-03",
        averageSpeedMph: 5.2718,
        ridership: 250000,
        hasSpeedTrend: true,
        hasRidershipTrend: true,
      }),
    ]);
    sqlite.close();
  });

  test("lists route equity context rows with source-status child rows", async () => {
    const db = new FakeDb({
      route_month_source_status: allSourceStatusRows,
      route_equity_context: [equityContextRow],
    });

    const rows = await listRouteEquityContexts(db, "2026-03");

    expect(db.calls[0]?.query).toContain("FROM route_equity_context");
    expect(db.calls[0]?.bound).toEqual(["2026-03"]);
    expect(rows).toEqual([
      expect.objectContaining({
        routeId: "M1",
        acsYear: 2024,
        assignedCountyName: "New York County",
        noVehicleHouseholdShare: 0.7692,
        raceEthnicityShare: expect.objectContaining({
          nonHispanicWhite: 44.3,
        }),
        sourceStatus: { routeSpatialJoin: "pending_tract_geometry_join" },
      }),
    ]);
  });

  test("lists selected route build candidates only", async () => {
    const db = new FakeDb({
      route_readiness_missing_input: missingInputRows,
      route_build_plan: [buildPlanRow],
    });

    const rows = await listSelectedRouteBuildCandidates(db, "2026-03");

    expect(db.calls[0]?.query).toContain("WHERE month = ? AND selected_for_next_batch = 1");
    expect(db.calls[0]?.query).toContain("ORDER BY candidate_rank ASC");
    expect(rows[0]).toEqual(
      expect.objectContaining({
        routeId: "M57",
        selectedForNextBatch: true,
      }),
    );
  });

  test("rejects invalid child rows in summary reads", async () => {
    const db = new FakeDb({
      route_brief_peak_window: [{ ...peakWindowRow, hour_of_day: 99 }],
      route_brief_slowest_window: [slowestWindowRow],
      route_brief_summary: [summaryRow],
    });

    await expect(listRouteBriefSummaries(db, "2026-03")).rejects.toThrow();
  });
});
