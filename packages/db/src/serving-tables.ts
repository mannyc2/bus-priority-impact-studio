import {
  createRouteScorecardCitationTableSql,
  createRouteScorecardTableSql,
} from "./route-scorecard.js";

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
  PRIMARY KEY (route_id, month)
);
`;

export const createRouteBriefPeakWindowTableSql = `
CREATE TABLE IF NOT EXISTS route_brief_peak_window (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  window_rank INTEGER NOT NULL CHECK (window_rank >= 1),
  day_of_week TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  ridership REAL CHECK (ridership IS NULL OR ridership >= 0),
  transfers REAL CHECK (transfers IS NULL OR transfers >= 0),
  matched_observation_count INTEGER CHECK (matched_observation_count IS NULL OR matched_observation_count >= 0),
  bus_trip_count INTEGER CHECK (bus_trip_count IS NULL OR bus_trip_count >= 0),
  weighted_average_speed_mph REAL CHECK (weighted_average_speed_mph IS NULL OR weighted_average_speed_mph >= 0),
  slow_observation_share REAL CHECK (slow_observation_share IS NULL OR slow_observation_share >= 0),
  PRIMARY KEY (route_id, month, window_rank)
);
`;

export const createRouteBriefSlowestWindowTableSql = `
CREATE TABLE IF NOT EXISTS route_brief_slowest_window (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  window_rank INTEGER NOT NULL CHECK (window_rank >= 1),
  day_of_week TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  observation_count INTEGER CHECK (observation_count IS NULL OR observation_count >= 0),
  bus_trip_count INTEGER CHECK (bus_trip_count IS NULL OR bus_trip_count >= 0),
  segment_count INTEGER CHECK (segment_count IS NULL OR segment_count >= 0),
  weighted_average_speed_mph REAL CHECK (weighted_average_speed_mph IS NULL OR weighted_average_speed_mph >= 0),
  weighted_average_travel_time_minutes REAL CHECK (weighted_average_travel_time_minutes IS NULL OR weighted_average_travel_time_minutes >= 0),
  slow_observation_share REAL CHECK (slow_observation_share IS NULL OR slow_observation_share >= 0),
  PRIMARY KEY (route_id, month, window_rank)
);
`;

export const createRouteCatalogTableSql = `
CREATE TABLE IF NOT EXISTS route_catalog (
  route_id TEXT PRIMARY KEY,
  route_short_name TEXT NOT NULL,
  route_long_name TEXT,
  shape_count INTEGER NOT NULL CHECK (shape_count >= 0),
  stop_count INTEGER NOT NULL CHECK (stop_count >= 0),
  timepoint_stop_count INTEGER NOT NULL CHECK (timepoint_stop_count >= 0),
  latitude_min REAL,
  latitude_max REAL,
  longitude_min REAL,
  longitude_max REAL
);
`;

export const createRouteCatalogTypeTableSql = `
CREATE TABLE IF NOT EXISTS route_catalog_type (
  route_id TEXT NOT NULL,
  type_rank INTEGER NOT NULL CHECK (type_rank >= 1),
  route_type TEXT NOT NULL,
  PRIMARY KEY (route_id, type_rank)
);
`;

export const createRouteDirectionTableSql = `
CREATE TABLE IF NOT EXISTS route_direction (
  route_id TEXT NOT NULL,
  direction_id INTEGER NOT NULL CHECK (direction_id >= 0),
  direction_name TEXT NOT NULL,
  PRIMARY KEY (route_id, direction_id)
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

export const createRouteReadinessMissingInputTableSql = `
CREATE TABLE IF NOT EXISTS route_readiness_missing_input (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  input_rank INTEGER NOT NULL CHECK (input_rank >= 1),
  input_name TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('blocking', 'warning')),
  note TEXT,
  PRIMARY KEY (route_id, month, input_rank)
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
  PRIMARY KEY (route_id, month)
);
`;

export const createRouteReliabilityGapWindowTableSql = `
CREATE TABLE IF NOT EXISTS route_reliability_gap_window (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  window_rank INTEGER NOT NULL CHECK (window_rank >= 1),
  day_type TEXT NOT NULL,
  direction_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  stop_name TEXT,
  sample_count INTEGER NOT NULL CHECK (sample_count >= 0),
  median_headway_minutes REAL NOT NULL CHECK (median_headway_minutes >= 0),
  p90_headway_minutes REAL NOT NULL CHECK (p90_headway_minutes >= 0),
  max_headway_minutes REAL NOT NULL CHECK (max_headway_minutes >= 0),
  PRIMARY KEY (route_id, month, window_rank)
);
`;

export const createRouteMonthSourceStatusTableSql = `
CREATE TABLE IF NOT EXISTS route_month_source_status (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  source_scope TEXT NOT NULL CHECK (source_scope IN ('reliability', 'equity_context')),
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  row_count INTEGER CHECK (row_count IS NULL OR row_count >= 0),
  snapshot_id TEXT,
  note TEXT,
  PRIMARY KEY (route_id, month, source_scope, source_id)
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
  issue_count INTEGER NOT NULL CHECK (issue_count >= 0)
);
`;

export const createRouteBatchBuiltRouteTableSql = `
CREATE TABLE IF NOT EXISTS route_batch_built_route (
  month TEXT NOT NULL,
  route_rank INTEGER NOT NULL CHECK (route_rank >= 1),
  route_id TEXT NOT NULL,
  artifact_count INTEGER CHECK (artifact_count IS NULL OR artifact_count >= 0),
  status TEXT NOT NULL,
  PRIMARY KEY (month, route_rank)
);
`;

export const createRouteBatchIssueTableSql = `
CREATE TABLE IF NOT EXISTS route_batch_issue (
  month TEXT NOT NULL,
  issue_rank INTEGER NOT NULL CHECK (issue_rank >= 1),
  route_id TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warning')),
  issue_code TEXT NOT NULL,
  message TEXT NOT NULL,
  PRIMARY KEY (month, issue_rank)
);
`;

export const createServingTablesSql = [
  createRouteScorecardTableSql,
  createRouteScorecardCitationTableSql,
  createRouteCatalogTableSql,
  createRouteCatalogTypeTableSql,
  createRouteDirectionTableSql,
  createRouteMonthCoverageTableSql,
  createRouteReadinessTableSql,
  createRouteReadinessMissingInputTableSql,
  createRouteBuildPlanTableSql,
  createRouteReliabilityBaselineTableSql,
  createRouteReliabilityGapWindowTableSql,
  createRouteMonthSourceStatusTableSql,
  createRouteMonthTrendTableSql,
  createRouteEquityContextTableSql,
  createRouteArtifactTableSql,
  createRouteBriefSummaryTableSql,
  createRouteBriefPeakWindowTableSql,
  createRouteBriefSlowestWindowTableSql,
  createRouteComparisonRankTableSql,
  createRouteBatchStatusTableSql,
  createRouteBatchBuiltRouteTableSql,
  createRouteBatchIssueTableSql,
].join("\n");
