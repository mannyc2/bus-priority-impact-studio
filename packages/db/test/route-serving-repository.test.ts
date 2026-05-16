import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { createBunSqliteServingDb } from "../src/d1/bun-sqlite.js";
import type { D1ServingDb } from "../src/d1/index.js";
import { routeComparisonRank, routeMonthTrend } from "../src/d1/schema.js";
import {
  getRouteBatchStatus,
  getRouteBriefSummary,
  listBuildEligibleRoutes,
  listCorridorSummaries,
  listRouteBriefSummaries,
  listRouteBuildPlan,
  listRouteComparisonRanks,
  listRouteEquityContexts,
  listRouteInterventionComparisons,
  listRouteMonthTrends,
  listRouteObservedReliabilitySummaries,
  listRouteReadiness,
  listRouteReliabilityBaselines,
  listSelectedRouteBuildCandidates,
} from "../src/index.js";

async function createDrizzleTestDb(): Promise<{ db: D1ServingDb; sqlite: Database }> {
  const sqlite = new Database(":memory:");
  const migrationsDir = new URL("../migrations/d1/", import.meta.url);
  const filenames = (await readdir(migrationsDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  for (const filename of filenames) {
    sqlite.exec(await Bun.file(new URL(filename, migrationsDir)).text());
  }

  return {
    db: createBunSqliteServingDb(sqlite),
    sqlite,
  };
}

function insertRows(sqlite: Database, tableName: string, rows: readonly Record<string, unknown>[]) {
  for (const row of rows) {
    const columns = Object.keys(row);
    const placeholders = columns.map(() => "?").join(", ");
    sqlite
      .query(`INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`)
      .run(...(columns.map((column) => row[column]) as never[]));
  }
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

const observedReliabilitySummaryRow = {
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
};

const interventionEventRow = {
  event_id: "ace:M57:ACE:2026-01-15",
  route_id: "M57",
  intervention_type: "automated_bus_lane_enforcement",
  source_id: "mta_ace_routes",
  program: "ACE",
  implementation_date: "2026-01-15T00:00:00.000Z",
  implementation_month: "2026-01",
  event_status: "implemented",
  description: "ACE automated bus lane enforcement for M57",
};

const interventionComparisonRow = {
  route_id: "M57",
  month: "2026-03",
  event_id: "ace:M57:ACE:2026-01-15",
  intervention_type: "automated_bus_lane_enforcement",
  source_id: "mta_ace_routes",
  evaluation_level: "descriptive_before_after",
  comparison_status: "evaluated",
  pre_start_month: "2025-11",
  pre_end_month: "2025-12",
  post_start_month: "2026-02",
  post_end_month: "2026-03",
  requested_pre_month_count: 2,
  requested_post_month_count: 2,
  pre_sample_month_count: 2,
  post_sample_month_count: 2,
  pre_speed_observation_count: 30,
  post_speed_observation_count: 70,
  pre_average_speed_mph: 6.3333,
  post_average_speed_mph: 8,
  speed_delta_mph: 1.6667,
  pre_average_monthly_ridership: 1100,
  post_average_monthly_ridership: 1400,
  ridership_delta: 300,
  caveat:
    "Descriptive before/after only; not seasonality-adjusted and not matched to comparison routes.",
};

const corridorRow = {
  corridor_id: "street:broadway",
  corridor_name: "Broadway",
  corridor_key: "BROADWAY",
  derivation_method: "primary_route_stop_street",
};

const corridorRouteMemberRow = {
  corridor_id: "street:broadway",
  month: "2026-03",
  route_id: "M57",
  assignment_status: "assigned",
  assignment_reason: "primary_stop_street",
  stop_count: 2,
  matched_stop_count: 2,
  hotspot_count: 1,
  total_ridership: 1000,
  average_speed_mph: 6,
};

const corridorMonthSummaryRow = {
  corridor_id: "street:broadway",
  month: "2026-03",
  route_count: 1,
  assigned_route_count: 1,
  ambiguous_route_count: 0,
  unassigned_route_count: 0,
  total_ridership: 1000,
  total_transfers: 100,
  weighted_average_speed_mph: 6,
  hotspot_count: 1,
  observed_reliability_route_count: 1,
  insufficient_reliability_route_count: 0,
  intervention_comparison_count: 1,
  evaluated_intervention_comparison_count: 1,
};

const corridorHotspotRow = {
  corridor_id: "street:broadway",
  month: "2026-03",
  corridor_hotspot_rank: 1,
  route_id: "M57",
  route_hotspot_rank: 1,
  from_stop_name: "BROADWAY/MARCY AV",
  to_stop_name: "BROADWAY/KEAP ST",
  weighted_average_speed_mph: 5,
  hotspot_score: 80,
  rider_impact_score: 79,
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
    const { db, sqlite } = await createDrizzleTestDb();
    insertRows(sqlite, "route_brief_summary", [summaryRow]);
    insertRows(sqlite, "route_brief_peak_window", [peakWindowRow]);
    insertRows(sqlite, "route_brief_slowest_window", [slowestWindowRow]);

    const rows = await listRouteBriefSummaries(db, "2026-03");

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
    sqlite.close();
  });

  test("gets one route brief summary by route and month", async () => {
    const { db, sqlite } = await createDrizzleTestDb();
    insertRows(sqlite, "route_brief_summary", [{ ...summaryRow, ace_active: 1 }]);
    insertRows(sqlite, "route_brief_peak_window", [peakWindowRow]);
    insertRows(sqlite, "route_brief_slowest_window", [slowestWindowRow]);

    const row = await getRouteBriefSummary(db, "M1", "2026-03");

    expect(row).toEqual(
      expect.objectContaining({
        routeId: "M1",
        aceActive: true,
      }),
    );
    sqlite.close();
  });

  test("returns null when a route brief summary does not exist", async () => {
    const { db, sqlite } = await createDrizzleTestDb();

    await expect(getRouteBriefSummary(db, "M9", "2026-03")).resolves.toBeNull();
    sqlite.close();
  });

  test("gets route batch status with typed child rows", async () => {
    const { db, sqlite } = await createDrizzleTestDb();
    insertRows(sqlite, "route_batch_status", [batchStatusRow]);
    insertRows(sqlite, "route_batch_built_route", batchBuiltRouteRows);
    insertRows(sqlite, "route_batch_issue", batchIssueRows as Record<string, unknown>[]);

    const row = await getRouteBatchStatus(db, "2026-03");

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
    const { db, sqlite } = await createDrizzleTestDb();
    insertRows(sqlite, "route_readiness", [readinessRow]);
    insertRows(
      sqlite,
      "route_readiness_missing_input",
      missingInputRows as Record<string, unknown>[],
    );

    const rows = await listRouteReadiness(db, "2026-03");

    expect(rows).toEqual([
      expect.objectContaining({
        routeId: "M1",
        buildEligible: true,
        readinessScore: 100,
        missingInputs: [],
      }),
    ]);
    sqlite.close();
  });

  test("lists build-eligible routes only", async () => {
    const { db, sqlite } = await createDrizzleTestDb();
    insertRows(sqlite, "route_readiness", [readinessRow]);
    insertRows(
      sqlite,
      "route_readiness_missing_input",
      missingInputRows as Record<string, unknown>[],
    );

    const rows = await listBuildEligibleRoutes(db, "2026-03");

    expect(rows[0]).toEqual(
      expect.objectContaining({
        routeId: "M1",
        readinessStatus: "ready",
      }),
    );
    sqlite.close();
  });

  test("lists route build plan rows with typed flags and child rows", async () => {
    const { db, sqlite } = await createDrizzleTestDb();
    insertRows(sqlite, "route_build_plan", [buildPlanRow]);
    insertRows(
      sqlite,
      "route_readiness_missing_input",
      missingInputRows as Record<string, unknown>[],
    );

    const rows = await listRouteBuildPlan(db, "2026-03");

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
    sqlite.close();
  });

  test("lists route reliability baseline rows with child rows", async () => {
    const { db, sqlite } = await createDrizzleTestDb();
    insertRows(sqlite, "route_reliability_baseline", [reliabilityBaselineRow]);
    insertRows(sqlite, "route_reliability_gap_window", [reliabilityGapWindowRow]);
    insertRows(sqlite, "route_month_source_status", allSourceStatusRows);

    const rows = await listRouteReliabilityBaselines(db, "2026-03");

    expect(rows).toEqual([
      expect.objectContaining({
        routeId: "M57",
        reliabilityStatus: "scheduled_baseline_only",
        p90ScheduledHeadwayMinutes: 20,
        topLongGapWindows: [expect.objectContaining({ stopId: "S1", p90HeadwayMinutes: 20 })],
        sourceStatus: { observedHeadways: "needs_gtfs_rt_collection" },
      }),
    ]);
    sqlite.close();
  });

  test("lists observed reliability summary rows with source status", async () => {
    const { db, sqlite } = await createDrizzleTestDb();
    insertRows(sqlite, "route_observed_reliability_summary", [observedReliabilitySummaryRow]);
    insertRows(sqlite, "route_month_source_status", allSourceStatusRows);

    const rows = await listRouteObservedReliabilitySummaries(db, "2026-03");

    expect(rows).toEqual([
      expect.objectContaining({
        routeId: "M57",
        runId: "fixture-gtfs-rt",
        reliabilityStatus: "observed",
        medianObservedHeadwayMinutes: 8,
        observedBunchingShare: 0.12,
        waitReliabilityRatio: 1.02,
        sourceStatus: { observedHeadways: "needs_gtfs_rt_collection" },
      }),
    ]);
    sqlite.close();
  });

  test("lists route intervention comparisons with event context", async () => {
    const { db, sqlite } = await createDrizzleTestDb();
    insertRows(sqlite, "intervention_event", [interventionEventRow]);
    insertRows(sqlite, "route_intervention_comparison", [interventionComparisonRow]);

    const rows = await listRouteInterventionComparisons(db, "2026-03");

    expect(rows).toEqual([
      expect.objectContaining({
        routeId: "M57",
        program: "ACE",
        implementationMonth: "2026-01",
        evaluationLevel: "descriptive_before_after",
        comparisonStatus: "evaluated",
        speedDeltaMph: 1.6667,
        caveat: expect.stringContaining("Descriptive before/after only"),
      }),
    ]);
    sqlite.close();
  });

  test("lists corridor summaries with members and hotspots", async () => {
    const { db, sqlite } = await createDrizzleTestDb();
    insertRows(sqlite, "corridor", [corridorRow]);
    insertRows(sqlite, "corridor_route_member", [corridorRouteMemberRow]);
    insertRows(sqlite, "corridor_month_summary", [corridorMonthSummaryRow]);
    insertRows(sqlite, "corridor_hotspot", [corridorHotspotRow]);

    const rows = await listCorridorSummaries(db, "2026-03");

    expect(rows).toEqual([
      expect.objectContaining({
        corridorId: "street:broadway",
        corridorName: "Broadway",
        routeCount: 1,
        weightedAverageSpeedMph: 6,
        routeMembers: [expect.objectContaining({ route_id: "M57" })],
        topHotspots: [expect.objectContaining({ route_id: "M57", hotspot_score: 80 })],
      }),
    ]);
    sqlite.close();
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
    const { db, sqlite } = await createDrizzleTestDb();
    insertRows(sqlite, "route_equity_context", [equityContextRow]);
    insertRows(sqlite, "route_month_source_status", allSourceStatusRows);

    const rows = await listRouteEquityContexts(db, "2026-03");

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
    sqlite.close();
  });

  test("lists selected route build candidates only", async () => {
    const { db, sqlite } = await createDrizzleTestDb();
    insertRows(sqlite, "route_build_plan", [buildPlanRow]);
    insertRows(
      sqlite,
      "route_readiness_missing_input",
      missingInputRows as Record<string, unknown>[],
    );

    const rows = await listSelectedRouteBuildCandidates(db, "2026-03");

    expect(rows[0]).toEqual(
      expect.objectContaining({
        routeId: "M57",
        selectedForNextBatch: true,
      }),
    );
    sqlite.close();
  });

  test("rejects invalid child rows in summary reads", async () => {
    const { db, sqlite } = await createDrizzleTestDb();
    insertRows(sqlite, "route_brief_summary", [summaryRow]);
    insertRows(sqlite, "route_brief_peak_window", [{ ...peakWindowRow, hour_of_day: 99 }]);
    insertRows(sqlite, "route_brief_slowest_window", [slowestWindowRow]);

    await expect(listRouteBriefSummaries(db, "2026-03")).rejects.toThrow();
    sqlite.close();
  });
});
