import { createRouteScorecardTableSql } from "./route-scorecard.js";

export const createRouteArtifactTableSql = `
CREATE TABLE IF NOT EXISTS route_artifact (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  artifact_name TEXT NOT NULL,
  artifact_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  sha256 TEXT NOT NULL,
  PRIMARY KEY (route_id, month, artifact_name)
);
`;

export const createRouteBriefSummaryTableSql = `
CREATE TABLE IF NOT EXISTS route_brief_summary (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  route_score INTEGER NOT NULL CHECK (route_score BETWEEN 0 AND 100),
  public_visible INTEGER NOT NULL CHECK (public_visible IN (0, 1)),
  public_visibility_reason TEXT NOT NULL,
  average_speed_mph REAL NOT NULL CHECK (average_speed_mph >= 0),
  hotspot_count INTEGER NOT NULL CHECK (hotspot_count >= 0),
  total_ridership REAL NOT NULL CHECK (total_ridership >= 0),
  total_transfers REAL NOT NULL CHECK (total_transfers >= 0),
  ace_active INTEGER NOT NULL CHECK (ace_active IN (0, 1)),
  ace_violation_count INTEGER NOT NULL CHECK (ace_violation_count >= 0),
  bus_lane_matched_lane_count INTEGER NOT NULL CHECK (bus_lane_matched_lane_count >= 0),
  schedule_match_rate REAL NOT NULL CHECK (schedule_match_rate >= 0),
  peak_ridership_json TEXT NOT NULL,
  slowest_window_json TEXT NOT NULL,
  PRIMARY KEY (route_id, month)
);
`;

export const createRouteCatalogTableSql = `
CREATE TABLE IF NOT EXISTS route_catalog (
  route_id TEXT PRIMARY KEY,
  route_short_name TEXT NOT NULL,
  route_long_name TEXT,
  route_types_json TEXT NOT NULL,
  directions_json TEXT NOT NULL,
  shape_count INTEGER NOT NULL CHECK (shape_count >= 0),
  stop_count INTEGER NOT NULL CHECK (stop_count >= 0),
  timepoint_stop_count INTEGER NOT NULL CHECK (timepoint_stop_count >= 0),
  latitude_min REAL,
  latitude_max REAL,
  longitude_min REAL,
  longitude_max REAL
);
`;

export const createRouteMonthCoverageTableSql = `
CREATE TABLE IF NOT EXISTS route_month_coverage (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  speed_observation_count INTEGER NOT NULL CHECK (speed_observation_count >= 0),
  speed_bus_trip_count INTEGER NOT NULL CHECK (speed_bus_trip_count >= 0),
  average_speed_mph REAL,
  schedule_timepoint_count INTEGER NOT NULL CHECK (schedule_timepoint_count >= 0),
  has_speed_data INTEGER NOT NULL CHECK (has_speed_data IN (0, 1)),
  has_schedule_data INTEGER NOT NULL CHECK (has_schedule_data IN (0, 1)),
  PRIMARY KEY (route_id, month)
);
`;

export const createRouteReadinessTableSql = `
CREATE TABLE IF NOT EXISTS route_readiness (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  route_short_name TEXT NOT NULL,
  route_long_name TEXT,
  readiness_status TEXT NOT NULL CHECK (readiness_status IN ('ready', 'partial', 'missing_geometry', 'missing_schedule', 'missing_speed')),
  build_eligible INTEGER NOT NULL CHECK (build_eligible IN (0, 1)),
  readiness_score INTEGER NOT NULL CHECK (readiness_score BETWEEN 0 AND 100),
  missing_inputs_json TEXT NOT NULL,
  speed_observation_count INTEGER NOT NULL CHECK (speed_observation_count >= 0),
  speed_bus_trip_count INTEGER NOT NULL CHECK (speed_bus_trip_count >= 0),
  average_speed_mph REAL,
  schedule_timepoint_count INTEGER NOT NULL CHECK (schedule_timepoint_count >= 0),
  shape_count INTEGER NOT NULL CHECK (shape_count >= 0),
  stop_count INTEGER NOT NULL CHECK (stop_count >= 0),
  timepoint_stop_count INTEGER NOT NULL CHECK (timepoint_stop_count >= 0),
  PRIMARY KEY (route_id, month)
);
`;

export const createRouteBuildPlanTableSql = `
CREATE TABLE IF NOT EXISTS route_build_plan (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  route_short_name TEXT NOT NULL,
  route_long_name TEXT,
  candidate_rank INTEGER CHECK (candidate_rank IS NULL OR candidate_rank >= 1),
  plan_status TEXT NOT NULL CHECK (plan_status IN ('selected', 'backlog', 'already_built', 'blocked')),
  selected_for_next_batch INTEGER NOT NULL CHECK (selected_for_next_batch IN (0, 1)),
  already_built INTEGER NOT NULL CHECK (already_built IN (0, 1)),
  build_eligible INTEGER NOT NULL CHECK (build_eligible IN (0, 1)),
  priority_score REAL NOT NULL CHECK (priority_score >= 0),
  readiness_status TEXT NOT NULL CHECK (readiness_status IN ('ready', 'partial', 'missing_geometry', 'missing_schedule', 'missing_speed')),
  readiness_score INTEGER NOT NULL CHECK (readiness_score BETWEEN 0 AND 100),
  missing_inputs_json TEXT NOT NULL,
  speed_observation_count INTEGER NOT NULL CHECK (speed_observation_count >= 0),
  speed_bus_trip_count INTEGER NOT NULL CHECK (speed_bus_trip_count >= 0),
  average_speed_mph REAL,
  schedule_timepoint_count INTEGER NOT NULL CHECK (schedule_timepoint_count >= 0),
  PRIMARY KEY (route_id, month)
);
`;

export const createRouteReliabilityBaselineTableSql = `
CREATE TABLE IF NOT EXISTS route_reliability_baseline (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  reliability_status TEXT NOT NULL CHECK (reliability_status IN ('scheduled_baseline_only')),
  scheduled_timepoint_count INTEGER NOT NULL CHECK (scheduled_timepoint_count >= 0),
  stop_headway_group_count INTEGER NOT NULL CHECK (stop_headway_group_count >= 0),
  headway_sample_count INTEGER NOT NULL CHECK (headway_sample_count >= 0),
  median_scheduled_headway_minutes REAL,
  p90_scheduled_headway_minutes REAL,
  max_scheduled_headway_minutes REAL,
  scheduled_short_headway_share REAL,
  scheduled_long_gap_share REAL,
  top_long_gap_windows_json TEXT NOT NULL,
  source_status_json TEXT NOT NULL,
  PRIMARY KEY (route_id, month)
);
`;

export const createRouteMonthTrendTableSql = `
CREATE TABLE IF NOT EXISTS route_month_trend (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  speed_observation_count INTEGER NOT NULL CHECK (speed_observation_count >= 0),
  speed_bus_trip_count INTEGER NOT NULL CHECK (speed_bus_trip_count >= 0),
  average_speed_mph REAL,
  ridership REAL,
  transfers REAL,
  has_speed_trend INTEGER NOT NULL CHECK (has_speed_trend IN (0, 1)),
  has_ridership_trend INTEGER NOT NULL CHECK (has_ridership_trend IN (0, 1)),
  PRIMARY KEY (route_id, month)
);
`;

export const createRouteEquityContextTableSql = `
CREATE TABLE IF NOT EXISTS route_equity_context (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  acs_year INTEGER NOT NULL CHECK (acs_year >= 2000),
  assignment_geography TEXT NOT NULL CHECK (assignment_geography IN ('county_proxy')),
  assigned_county_fips TEXT,
  assigned_county_name TEXT,
  assignment_method TEXT NOT NULL CHECK (assignment_method IN ('route_id_prefix', 'unassigned')),
  tract_count INTEGER NOT NULL CHECK (tract_count >= 0),
  total_population INTEGER,
  occupied_housing_units INTEGER,
  no_vehicle_households INTEGER,
  no_vehicle_household_share REAL,
  median_household_income REAL,
  poverty_rate REAL,
  public_transit_commuter_share REAL,
  hispanic_share REAL,
  non_hispanic_white_share REAL,
  non_hispanic_black_share REAL,
  non_hispanic_asian_share REAL,
  source_status_json TEXT NOT NULL,
  PRIMARY KEY (route_id, month)
);
`;

export const createRouteComparisonRankTableSql = `
CREATE TABLE IF NOT EXISTS route_comparison_rank (
  month TEXT NOT NULL,
  rank INTEGER NOT NULL CHECK (rank >= 1),
  route_id TEXT NOT NULL,
  route_score INTEGER NOT NULL CHECK (route_score BETWEEN 0 AND 100),
  average_speed_mph REAL NOT NULL CHECK (average_speed_mph >= 0),
  total_ridership REAL NOT NULL CHECK (total_ridership >= 0),
  ace_violation_count INTEGER NOT NULL CHECK (ace_violation_count >= 0),
  bus_lane_matched_lane_count INTEGER NOT NULL CHECK (bus_lane_matched_lane_count >= 0),
  PRIMARY KEY (month, rank)
);
`;

export const createRouteBatchStatusTableSql = `
CREATE TABLE IF NOT EXISTS route_batch_status (
  month TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail')),
  route_count INTEGER NOT NULL CHECK (route_count >= 0),
  artifact_count INTEGER NOT NULL CHECK (artifact_count >= 0),
  missing_artifact_count INTEGER NOT NULL CHECK (missing_artifact_count >= 0),
  hash_mismatch_count INTEGER NOT NULL CHECK (hash_mismatch_count >= 0),
  byte_length_mismatch_count INTEGER NOT NULL CHECK (byte_length_mismatch_count >= 0),
  total_byte_length INTEGER NOT NULL CHECK (total_byte_length >= 0),
  issue_count INTEGER NOT NULL CHECK (issue_count >= 0),
  built_route_ids_json TEXT NOT NULL,
  issues_json TEXT NOT NULL
);
`;

export const createServingTablesSql = [
  createRouteScorecardTableSql,
  createRouteCatalogTableSql,
  createRouteMonthCoverageTableSql,
  createRouteReadinessTableSql,
  createRouteBuildPlanTableSql,
  createRouteReliabilityBaselineTableSql,
  createRouteMonthTrendTableSql,
  createRouteEquityContextTableSql,
  createRouteArtifactTableSql,
  createRouteBriefSummaryTableSql,
  createRouteComparisonRankTableSql,
  createRouteBatchStatusTableSql,
].join("\n");
