import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const localRouteCatalog = sqliteTable("local_route_catalog", {
  routeId: text("route_id").primaryKey(),
  routeShortName: text("route_short_name").notNull(),
  routeLongName: text("route_long_name"),
  shapeCount: integer("shape_count").notNull(),
  stopCount: integer("stop_count").notNull(),
  timepointStopCount: integer("timepoint_stop_count").notNull(),
  latitudeMin: real("latitude_min"),
  latitudeMax: real("latitude_max"),
  longitudeMin: real("longitude_min"),
  longitudeMax: real("longitude_max"),
});

export const localRouteCatalogType = sqliteTable(
  "local_route_catalog_type",
  {
    routeId: text("route_id").notNull(),
    typeRank: integer("type_rank").notNull(),
    routeType: text("route_type").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.typeRank] })],
);

export const localRouteDirection = sqliteTable(
  "local_route_direction",
  {
    routeId: text("route_id").notNull(),
    directionRank: integer("direction_rank").notNull(),
    directionName: text("direction_name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.directionRank] })],
);

export const localRouteMonthCoverage = sqliteTable(
  "local_route_month_coverage",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    speedObservationCount: integer("speed_observation_count").notNull(),
    speedBusTripCount: integer("speed_bus_trip_count").notNull(),
    averageSpeedMph: real("average_speed_mph"),
    scheduleTimepointCount: integer("schedule_timepoint_count").notNull(),
    hasSpeedData: integer("has_speed_data", { mode: "boolean" }).notNull(),
    hasScheduleData: integer("has_schedule_data", { mode: "boolean" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month] })],
);

export const localRouteReadiness = sqliteTable(
  "local_route_readiness",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    routeShortName: text("route_short_name").notNull(),
    routeLongName: text("route_long_name"),
    readinessStatus: text("readiness_status").notNull(),
    buildEligible: integer("build_eligible", { mode: "boolean" }).notNull(),
    readinessScore: integer("readiness_score").notNull(),
    speedObservationCount: integer("speed_observation_count").notNull(),
    speedBusTripCount: integer("speed_bus_trip_count").notNull(),
    averageSpeedMph: real("average_speed_mph"),
    scheduleTimepointCount: integer("schedule_timepoint_count").notNull(),
    shapeCount: integer("shape_count").notNull(),
    stopCount: integer("stop_count").notNull(),
    timepointStopCount: integer("timepoint_stop_count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month] })],
);

export const localRouteReadinessMissingInput = sqliteTable(
  "local_route_readiness_missing_input",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    inputRank: integer("input_rank").notNull(),
    inputName: text("input_name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month, table.inputRank] })],
);

export const localRouteBuildPlan = sqliteTable(
  "local_route_build_plan",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    routeShortName: text("route_short_name").notNull(),
    routeLongName: text("route_long_name"),
    candidateRank: integer("candidate_rank"),
    planStatus: text("plan_status").notNull(),
    selectedForNextBatch: integer("selected_for_next_batch", { mode: "boolean" }).notNull(),
    alreadyBuilt: integer("already_built", { mode: "boolean" }).notNull(),
    buildEligible: integer("build_eligible", { mode: "boolean" }).notNull(),
    priorityScore: real("priority_score").notNull(),
    readinessStatus: text("readiness_status").notNull(),
    readinessScore: integer("readiness_score").notNull(),
    speedObservationCount: integer("speed_observation_count").notNull(),
    speedBusTripCount: integer("speed_bus_trip_count").notNull(),
    averageSpeedMph: real("average_speed_mph"),
    scheduleTimepointCount: integer("schedule_timepoint_count").notNull(),
    shapeCount: integer("shape_count").notNull(),
    stopCount: integer("stop_count").notNull(),
    timepointStopCount: integer("timepoint_stop_count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month] })],
);

export const localRouteReliabilityBaseline = sqliteTable(
  "local_route_reliability_baseline",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    reliabilityStatus: text("reliability_status").notNull(),
    scheduledTimepointCount: integer("scheduled_timepoint_count").notNull(),
    stopHeadwayGroupCount: integer("stop_headway_group_count").notNull(),
    headwaySampleCount: integer("headway_sample_count").notNull(),
    medianScheduledHeadwayMinutes: real("median_scheduled_headway_minutes"),
    p90ScheduledHeadwayMinutes: real("p90_scheduled_headway_minutes"),
    maxScheduledHeadwayMinutes: real("max_scheduled_headway_minutes"),
    scheduledShortHeadwayShare: real("scheduled_short_headway_share"),
    scheduledLongGapShare: real("scheduled_long_gap_share"),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month] })],
);

export const localRouteReliabilityGapWindow = sqliteTable(
  "local_route_reliability_gap_window",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    windowRank: integer("window_rank").notNull(),
    dayType: text("day_type").notNull(),
    directionId: text("direction_id").notNull(),
    stopId: text("stop_id").notNull(),
    stopName: text("stop_name"),
    sampleCount: integer("sample_count").notNull(),
    medianHeadwayMinutes: real("median_headway_minutes").notNull(),
    p90HeadwayMinutes: real("p90_headway_minutes").notNull(),
    maxHeadwayMinutes: real("max_headway_minutes").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month, table.windowRank] })],
);

export const localRouteMonthSourceStatus = sqliteTable(
  "local_route_month_source_status",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    sourceScope: text("source_scope").notNull(),
    sourceId: text("source_id").notNull(),
    status: text("status").notNull(),
    rowCount: integer("row_count"),
    snapshotId: text("snapshot_id"),
    note: text("note"),
  },
  (table) => [
    primaryKey({ columns: [table.routeId, table.month, table.sourceScope, table.sourceId] }),
  ],
);

export const localRouteMonthTrend = sqliteTable(
  "local_route_month_trend",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    speedObservationCount: integer("speed_observation_count").notNull(),
    speedBusTripCount: integer("speed_bus_trip_count").notNull(),
    averageSpeedMph: real("average_speed_mph"),
    ridership: real("ridership"),
    transfers: real("transfers"),
    hasSpeedTrend: integer("has_speed_trend", { mode: "boolean" }).notNull(),
    hasRidershipTrend: integer("has_ridership_trend", { mode: "boolean" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month] })],
);

export const localRouteSegmentSpeed = sqliteTable(
  "local_route_segment_speed",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    rowRank: integer("row_rank").notNull(),
    timestamp: text("timestamp").notNull(),
    dayOfWeek: text("day_of_week").notNull(),
    hourOfDay: integer("hour_of_day").notNull(),
    direction: text("direction").notNull(),
    borough: text("borough").notNull(),
    routeType: text("route_type").notNull(),
    stopOrder: integer("stop_order").notNull(),
    timepointStopId: text("timepoint_stop_id").notNull(),
    timepointStopName: text("timepoint_stop_name").notNull(),
    timepointStopLatitude: real("timepoint_stop_latitude").notNull(),
    timepointStopLongitude: real("timepoint_stop_longitude").notNull(),
    nextTimepointStopId: text("next_timepoint_stop_id").notNull(),
    nextTimepointStopName: text("next_timepoint_stop_name").notNull(),
    nextTimepointStopLatitude: real("next_timepoint_stop_latitude").notNull(),
    nextTimepointStopLongitude: real("next_timepoint_stop_longitude").notNull(),
    roadDistanceMiles: real("road_distance_miles").notNull(),
    averageTravelTimeMinutes: real("average_travel_time_minutes").notNull(),
    averageRoadSpeedMph: real("average_road_speed_mph").notNull(),
    busTripCount: integer("bus_trip_count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month, table.rowRank] })],
);

export const localRouteHourlyRidership = sqliteTable(
  "local_route_hourly_ridership",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    dayOfWeek: text("day_of_week").notNull(),
    hourOfDay: integer("hour_of_day").notNull(),
    ridership: real("ridership").notNull(),
    transfers: real("transfers").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.routeId, table.month, table.dayOfWeek, table.hourOfDay] }),
  ],
);

export const localRouteScheduleTimepoint = sqliteTable(
  "local_route_schedule_timepoint",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    rowRank: integer("row_rank").notNull(),
    scheduleDate: text("schedule_date").notNull(),
    dayType: text("day_type").notNull(),
    direction: text("direction").notNull(),
    shapeId: text("shape_id").notNull(),
    stopSequence: integer("stop_sequence").notNull(),
    stopId: text("stop_id").notNull(),
    stopName: text("stop_name"),
    scheduleTime: text("schedule_time").notNull(),
    distanceFromStart: real("distance_from_start"),
    tripHeadsign: text("trip_headsign"),
    blockId: text("block_id").notNull(),
    bundle: text("bundle"),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month, table.rowRank] })],
);

export const localRouteStop = sqliteTable(
  "local_route_stop",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    stopId: text("stop_id").notNull(),
    routeShortName: text("route_short_name").notNull(),
    stopName: text("stop_name").notNull(),
    inEffect: integer("in_effect", { mode: "boolean" }).notNull(),
    directionId: text("direction_id").notNull(),
    direction: text("direction").notNull(),
    timepoint: integer("timepoint", { mode: "boolean" }).notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.routeId, table.month, table.stopId, table.directionId] }),
  ],
);

export const localBusLane = sqliteTable("local_bus_lane", {
  segmentId: text("segment_id").primaryKey(),
  street: text("street").notNull(),
  borough: text("borough").notNull(),
  facility: text("facility").notNull(),
  direction: text("direction"),
  trafficDirection: text("traffic_direction"),
  hours: text("hours"),
  days: text("days"),
  laneType: text("lane_type"),
  laneSubtype: text("lane_subtype"),
  laneWidth: text("lane_width"),
  openDate: text("open_date"),
  shapeLength: real("shape_length"),
});

export const localBusLaneCoordinate = sqliteTable(
  "local_bus_lane_coordinate",
  {
    segmentId: text("segment_id").notNull(),
    coordinateRank: integer("coordinate_rank").notNull(),
    longitude: real("longitude").notNull(),
    latitude: real("latitude").notNull(),
  },
  (table) => [primaryKey({ columns: [table.segmentId, table.coordinateRank] })],
);

export const localAceRoute = sqliteTable(
  "local_ace_route",
  {
    routeId: text("route_id").notNull(),
    program: text("program", { enum: ["ABLE", "ACE"] }).notNull(),
    implementationDate: text("implementation_date").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.program, table.implementationDate] })],
);

export const localAceViolationSummary = sqliteTable(
  "local_ace_violation_summary",
  {
    month: text("month").notNull(),
    routeId: text("route_id").notNull(),
    violationType: text("violation_type").notNull(),
    violationStatus: text("violation_status").notNull(),
    violationCount: integer("violation_count").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.month, table.routeId, table.violationType, table.violationStatus],
    }),
  ],
);

export const localRouteEquityContext = sqliteTable(
  "local_route_equity_context",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    acsYear: integer("acs_year").notNull(),
    assignmentGeography: text("assignment_geography").notNull(),
    assignedCountyFips: text("assigned_county_fips"),
    assignedCountyName: text("assigned_county_name"),
    assignmentMethod: text("assignment_method").notNull(),
    tractCount: integer("tract_count").notNull(),
    totalPopulation: integer("total_population"),
    occupiedHousingUnits: integer("occupied_housing_units"),
    noVehicleHouseholds: integer("no_vehicle_households"),
    noVehicleHouseholdShare: real("no_vehicle_household_share"),
    medianHouseholdIncome: real("median_household_income"),
    povertyRate: real("poverty_rate"),
    publicTransitCommuterShare: real("public_transit_commuter_share"),
    hispanicShare: real("hispanic_share"),
    nonHispanicWhiteShare: real("non_hispanic_white_share"),
    nonHispanicBlackShare: real("non_hispanic_black_share"),
    nonHispanicAsianShare: real("non_hispanic_asian_share"),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month] })],
);

export const localRouteArtifact = sqliteTable(
  "local_route_artifact",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    artifactName: text("artifact_name").notNull(),
    artifactKey: text("artifact_key").notNull(),
    contentType: text("content_type").notNull(),
    byteLength: integer("byte_length").notNull(),
    sha256: text("sha256").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month, table.artifactName] })],
);

export const localRouteScorecard = sqliteTable(
  "local_route_scorecard",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    routeScore: integer("route_score").notNull(),
    coverageStatus: text("coverage_status", { enum: ["full", "no_observed_speed"] }).notNull(),
    averageSpeedMph: real("average_speed_mph").notNull(),
    hotspotCount: integer("hotspot_count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month] })],
);

export const localRouteBriefSummary = sqliteTable(
  "local_route_brief_summary",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    routeScore: integer("route_score").notNull(),
    publicVisible: integer("public_visible", { mode: "boolean" }).notNull(),
    publicVisibilityReason: text("public_visibility_reason").notNull(),
    averageSpeedMph: real("average_speed_mph").notNull(),
    hotspotCount: integer("hotspot_count").notNull(),
    totalRidership: real("total_ridership").notNull(),
    totalTransfers: real("total_transfers").notNull(),
    aceActive: integer("ace_active", { mode: "boolean" }).notNull(),
    aceViolationCount: integer("ace_violation_count").notNull(),
    busLaneMatchedLaneCount: integer("bus_lane_matched_lane_count").notNull(),
    scheduleMatchRate: real("schedule_match_rate").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month] })],
);

export const localRouteBriefPeakWindow = sqliteTable(
  "local_route_brief_peak_window",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    windowRank: integer("window_rank").notNull(),
    dayOfWeek: text("day_of_week").notNull(),
    hourOfDay: integer("hour_of_day").notNull(),
    ridership: real("ridership"),
    transfers: real("transfers"),
    matchedObservationCount: integer("matched_observation_count"),
    busTripCount: integer("bus_trip_count"),
    weightedAverageSpeedMph: real("weighted_average_speed_mph"),
    slowObservationShare: real("slow_observation_share"),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month, table.windowRank] })],
);

export const localRouteBriefSlowestWindow = sqliteTable(
  "local_route_brief_slowest_window",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    windowRank: integer("window_rank").notNull(),
    dayOfWeek: text("day_of_week").notNull(),
    hourOfDay: integer("hour_of_day").notNull(),
    observationCount: integer("observation_count"),
    busTripCount: integer("bus_trip_count"),
    segmentCount: integer("segment_count"),
    weightedAverageSpeedMph: real("weighted_average_speed_mph"),
    weightedAverageTravelTimeMinutes: real("weighted_average_travel_time_minutes"),
    slowObservationShare: real("slow_observation_share"),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month, table.windowRank] })],
);

export const localRouteComparisonRank = sqliteTable(
  "local_route_comparison_rank",
  {
    month: text("month").notNull(),
    rank: integer("rank").notNull(),
    routeId: text("route_id").notNull(),
    routeScore: integer("route_score").notNull(),
    averageSpeedMph: real("average_speed_mph").notNull(),
    totalRidership: real("total_ridership").notNull(),
    aceViolationCount: integer("ace_violation_count").notNull(),
    busLaneMatchedLaneCount: integer("bus_lane_matched_lane_count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.month, table.rank] })],
);

export const localRouteBatchStatus = sqliteTable("local_route_batch_status", {
  month: text("month").primaryKey(),
  generatedAt: text("generated_at").notNull(),
  status: text("status", { enum: ["pass", "fail"] }).notNull(),
  routeCount: integer("route_count").notNull(),
  artifactCount: integer("artifact_count").notNull(),
  missingArtifactCount: integer("missing_artifact_count").notNull(),
  hashMismatchCount: integer("hash_mismatch_count").notNull(),
  byteLengthMismatchCount: integer("byte_length_mismatch_count").notNull(),
  totalByteLength: integer("total_byte_length").notNull(),
  issueCount: integer("issue_count").notNull(),
});

export const localRouteBatchBuiltRoute = sqliteTable(
  "local_route_batch_built_route",
  {
    month: text("month").notNull(),
    routeRank: integer("route_rank").notNull(),
    routeId: text("route_id").notNull(),
    artifactCount: integer("artifact_count"),
    status: text("status").notNull(),
  },
  (table) => [primaryKey({ columns: [table.month, table.routeRank] })],
);

export const localRouteBatchIssue = sqliteTable(
  "local_route_batch_issue",
  {
    month: text("month").notNull(),
    issueRank: integer("issue_rank").notNull(),
    routeId: text("route_id"),
    severity: text("severity").notNull(),
    issueCode: text("issue_code").notNull(),
    message: text("message").notNull(),
  },
  (table) => [primaryKey({ columns: [table.month, table.issueRank] })],
);
