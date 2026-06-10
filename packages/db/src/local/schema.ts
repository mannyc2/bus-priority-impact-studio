import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  (table) => [
    primaryKey({ columns: [table.routeId, table.month] }),
    index("local_route_month_coverage_month_idx").on(table.month),
  ],
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
  (table) => [
    primaryKey({ columns: [table.routeId, table.month] }),
    index("local_route_readiness_month_idx").on(table.month),
  ],
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
  (table) => [
    primaryKey({ columns: [table.routeId, table.month] }),
    index("local_route_build_plan_month_idx").on(table.month),
  ],
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
  (table) => [
    primaryKey({ columns: [table.routeId, table.month] }),
    index("local_route_reliability_baseline_month_idx").on(table.month),
  ],
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

export const localGtfsRtCollectionRun = sqliteTable("local_gtfs_rt_collection_run", {
  runId: text("run_id").primaryKey(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  status: text("status", {
    enum: ["running", "completed", "completed_with_errors", "failed"],
  }).notNull(),
  requestedDurationSeconds: integer("requested_duration_seconds").notNull(),
  sampleSeconds: integer("sample_seconds").notNull(),
  requestedFeedTypes: text("requested_feed_types").notNull(),
  snapshotCount: integer("snapshot_count").notNull(),
  successCount: integer("success_count").notNull(),
  failureCount: integer("failure_count").notNull(),
  rawDirectory: text("raw_directory").notNull(),
  error: text("error"),
});

export const localGtfsRtFeedSnapshot = sqliteTable(
  "local_gtfs_rt_feed_snapshot",
  {
    runId: text("run_id").notNull(),
    feedType: text("feed_type", {
      enum: ["vehicle_positions", "trip_updates", "alerts"],
    }).notNull(),
    sampleIndex: integer("sample_index").notNull(),
    sourceId: text("source_id").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    status: text("status", {
      enum: ["ok", "http_error", "network_error", "write_error"],
    }).notNull(),
    httpStatus: integer("http_status"),
    byteLength: integer("byte_length"),
    sha256: text("sha256"),
    rawPath: text("raw_path"),
    redactedUrl: text("redacted_url").notNull(),
    error: text("error"),
  },
  (table) => [primaryKey({ columns: [table.runId, table.feedType, table.sampleIndex] })],
);

export const localGtfsRtParsedSnapshot = sqliteTable(
  "local_gtfs_rt_parsed_snapshot",
  {
    runId: text("run_id").notNull(),
    feedType: text("feed_type", {
      enum: ["vehicle_positions", "trip_updates", "alerts"],
    }).notNull(),
    sampleIndex: integer("sample_index").notNull(),
    parsedAt: text("parsed_at").notNull(),
    status: text("status", { enum: ["parsed", "parse_error"] }).notNull(),
    gtfsRealtimeVersion: text("gtfs_realtime_version"),
    feedTimestamp: integer("feed_timestamp"),
    entityCount: integer("entity_count").notNull(),
    vehiclePositionCount: integer("vehicle_position_count").notNull(),
    tripUpdateCount: integer("trip_update_count").notNull(),
    stopTimeUpdateCount: integer("stop_time_update_count").notNull(),
    alertCount: integer("alert_count").notNull(),
    error: text("error"),
  },
  (table) => [primaryKey({ columns: [table.runId, table.feedType, table.sampleIndex] })],
);

export const localGtfsRtVehiclePosition = sqliteTable(
  "local_gtfs_rt_vehicle_position",
  {
    runId: text("run_id").notNull(),
    feedType: text("feed_type", {
      enum: ["vehicle_positions", "trip_updates", "alerts"],
    }).notNull(),
    sampleIndex: integer("sample_index").notNull(),
    entityId: text("entity_id").notNull(),
    entityDeleted: integer("entity_deleted", { mode: "boolean" }).notNull(),
    gtfsRealtimeVersion: text("gtfs_realtime_version"),
    feedTimestamp: integer("feed_timestamp"),
    sourceRouteId: text("source_route_id"),
    routeId: text("route_id"),
    tripId: text("trip_id"),
    startDate: text("start_date"),
    startTime: text("start_time"),
    directionId: integer("direction_id"),
    scheduleRelationship: text("schedule_relationship"),
    vehicleId: text("vehicle_id"),
    vehicleLabel: text("vehicle_label"),
    vehicleLicensePlate: text("vehicle_license_plate"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    bearing: real("bearing"),
    odometer: real("odometer"),
    speed: real("speed"),
    currentStopSequence: integer("current_stop_sequence"),
    stopId: text("stop_id"),
    currentStatus: text("current_status"),
    timestamp: integer("timestamp"),
    congestionLevel: text("congestion_level"),
    occupancyStatus: text("occupancy_status"),
    occupancyPercentage: real("occupancy_percentage"),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.feedType, table.sampleIndex, table.entityId] }),
  ],
);

export const localGtfsRtTripUpdate = sqliteTable(
  "local_gtfs_rt_trip_update",
  {
    runId: text("run_id").notNull(),
    feedType: text("feed_type", {
      enum: ["vehicle_positions", "trip_updates", "alerts"],
    }).notNull(),
    sampleIndex: integer("sample_index").notNull(),
    entityId: text("entity_id").notNull(),
    entityDeleted: integer("entity_deleted", { mode: "boolean" }).notNull(),
    gtfsRealtimeVersion: text("gtfs_realtime_version"),
    feedTimestamp: integer("feed_timestamp"),
    sourceRouteId: text("source_route_id"),
    routeId: text("route_id"),
    tripId: text("trip_id"),
    startDate: text("start_date"),
    startTime: text("start_time"),
    directionId: integer("direction_id"),
    scheduleRelationship: text("schedule_relationship"),
    vehicleId: text("vehicle_id"),
    vehicleLabel: text("vehicle_label"),
    vehicleLicensePlate: text("vehicle_license_plate"),
    timestamp: integer("timestamp"),
    delay: integer("delay"),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.feedType, table.sampleIndex, table.entityId] }),
  ],
);

export const localGtfsRtStopTimeUpdate = sqliteTable(
  "local_gtfs_rt_stop_time_update",
  {
    runId: text("run_id").notNull(),
    feedType: text("feed_type", {
      enum: ["vehicle_positions", "trip_updates", "alerts"],
    }).notNull(),
    sampleIndex: integer("sample_index").notNull(),
    entityId: text("entity_id").notNull(),
    updateRank: integer("update_rank").notNull(),
    stopSequence: integer("stop_sequence"),
    stopId: text("stop_id"),
    arrivalDelay: integer("arrival_delay"),
    arrivalTime: integer("arrival_time"),
    arrivalUncertainty: integer("arrival_uncertainty"),
    departureDelay: integer("departure_delay"),
    departureTime: integer("departure_time"),
    departureUncertainty: integer("departure_uncertainty"),
    scheduleRelationship: text("schedule_relationship"),
    assignedStopId: text("assigned_stop_id"),
  },
  (table) => [
    primaryKey({
      columns: [table.runId, table.feedType, table.sampleIndex, table.entityId, table.updateRank],
    }),
  ],
);

export const localGtfsRtAlert = sqliteTable(
  "local_gtfs_rt_alert",
  {
    runId: text("run_id").notNull(),
    feedType: text("feed_type", {
      enum: ["vehicle_positions", "trip_updates", "alerts"],
    }).notNull(),
    sampleIndex: integer("sample_index").notNull(),
    entityId: text("entity_id").notNull(),
    entityDeleted: integer("entity_deleted", { mode: "boolean" }).notNull(),
    gtfsRealtimeVersion: text("gtfs_realtime_version"),
    feedTimestamp: integer("feed_timestamp"),
    cause: text("cause"),
    effect: text("effect"),
    activePeriodJson: text("active_period_json"),
    informedEntityJson: text("informed_entity_json"),
    urlJson: text("url_json"),
    headerTextJson: text("header_text_json"),
    descriptionTextJson: text("description_text_json"),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.feedType, table.sampleIndex, table.entityId] }),
  ],
);

export const localObservedVehicleStopEvent = sqliteTable(
  "local_observed_vehicle_stop_event",
  {
    runId: text("run_id").notNull(),
    eventRank: integer("event_rank").notNull(),
    routeId: text("route_id").notNull(),
    sourceRouteId: text("source_route_id"),
    directionId: integer("direction_id"),
    stopId: text("stop_id").notNull(),
    vehicleKey: text("vehicle_key").notNull(),
    vehicleId: text("vehicle_id"),
    vehicleLabel: text("vehicle_label"),
    tripId: text("trip_id"),
    observedTimestamp: integer("observed_timestamp").notNull(),
    sampleIndex: integer("sample_index").notNull(),
    currentStatus: text("current_status"),
    latitude: real("latitude"),
    longitude: real("longitude"),
  },
  (table) => [primaryKey({ columns: [table.runId, table.eventRank] })],
);

export const localObservedHeadwaySample = sqliteTable(
  "local_observed_headway_sample",
  {
    runId: text("run_id").notNull(),
    sampleRank: integer("sample_rank").notNull(),
    routeId: text("route_id").notNull(),
    sourceRouteId: text("source_route_id"),
    directionId: integer("direction_id"),
    stopId: text("stop_id").notNull(),
    previousVehicleKey: text("previous_vehicle_key").notNull(),
    vehicleKey: text("vehicle_key").notNull(),
    previousObservedTimestamp: integer("previous_observed_timestamp").notNull(),
    observedTimestamp: integer("observed_timestamp").notNull(),
    headwaySeconds: integer("headway_seconds").notNull(),
    headwayMinutes: real("headway_minutes").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.sampleRank] })],
);

export const localRouteObservedReliabilitySummary = sqliteTable(
  "local_route_observed_reliability_summary",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    runId: text("run_id").notNull(),
    reliabilityStatus: text("reliability_status", {
      enum: ["observed", "insufficient_gtfs_rt_samples"],
    }).notNull(),
    minSampleThreshold: integer("min_sample_threshold").notNull(),
    sampleCount: integer("sample_count").notNull(),
    stopCount: integer("stop_count").notNull(),
    directionCount: integer("direction_count").notNull(),
    averageObservedHeadwayMinutes: real("average_observed_headway_minutes"),
    medianObservedHeadwayMinutes: real("median_observed_headway_minutes"),
    p90ObservedHeadwayMinutes: real("p90_observed_headway_minutes"),
    maxObservedHeadwayMinutes: real("max_observed_headway_minutes"),
    scheduledMedianHeadwayMinutes: real("scheduled_median_headway_minutes"),
    bunchingThresholdMinutes: real("bunching_threshold_minutes"),
    longGapThresholdMinutes: real("long_gap_threshold_minutes"),
    observedBunchingShare: real("observed_bunching_share"),
    observedLongGapShare: real("observed_long_gap_share"),
    expectedWaitMinutes: real("expected_wait_minutes"),
    scheduledExpectedWaitMinutes: real("scheduled_expected_wait_minutes"),
    excessWaitMinutes: real("excess_wait_minutes"),
    waitReliabilityRatio: real("wait_reliability_ratio"),
  },
  (table) => [
    primaryKey({ columns: [table.routeId, table.month, table.runId] }),
    index("local_route_observed_reliability_summary_month_idx").on(table.month),
  ],
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
    index("local_route_month_source_status_month_scope_idx").on(table.month, table.sourceScope),
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
  (table) => [
    primaryKey({ columns: [table.routeId, table.month] }),
    index("local_route_month_trend_month_route_idx").on(table.month, table.routeId),
  ],
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
  (table) => [
    primaryKey({ columns: [table.routeId, table.month, table.rowRank] }),
    index("local_route_segment_speed_month_route_idx").on(table.month, table.routeId),
  ],
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
    index("local_route_hourly_ridership_month_route_idx").on(table.month, table.routeId),
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

export const localRouteHotspotSummary = sqliteTable(
  "local_route_hotspot_summary",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    generatedAt: text("generated_at").notNull(),
    routeWeightedAverageSpeedMph: real("route_weighted_average_speed_mph").notNull(),
    observationCount: integer("observation_count").notNull(),
    busTripCount: integer("bus_trip_count").notNull(),
    ridershipWeighted: integer("ridership_weighted", { mode: "boolean" }).notNull(),
    ridershipWindowCount: integer("ridership_window_count").notNull(),
    ridershipMatchedObservationCount: integer("ridership_matched_observation_count").notNull(),
    ridershipExposure: real("ridership_exposure").notNull(),
    segmentCount: integer("segment_count").notNull(),
    hotspotCount: integer("hotspot_count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month] })],
);

export const localRouteHotspot = sqliteTable(
  "local_route_hotspot",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    hotspotRank: integer("hotspot_rank").notNull(),
    segmentId: text("segment_id").notNull(),
    direction: text("direction").notNull(),
    stopOrder: integer("stop_order").notNull(),
    timepointStopId: text("timepoint_stop_id").notNull(),
    timepointStopName: text("timepoint_stop_name").notNull(),
    nextTimepointStopId: text("next_timepoint_stop_id").notNull(),
    nextTimepointStopName: text("next_timepoint_stop_name").notNull(),
    observationCount: integer("observation_count").notNull(),
    busTripCount: integer("bus_trip_count").notNull(),
    weightedAverageSpeedMph: real("weighted_average_speed_mph").notNull(),
    weightedAverageTravelTimeMinutes: real("weighted_average_travel_time_minutes").notNull(),
    averageRoadDistanceMiles: real("average_road_distance_miles").notNull(),
    slowWindowShare: real("slow_window_share").notNull(),
    speedSeverity: real("speed_severity").notNull(),
    hotspotScore: integer("hotspot_score").notNull(),
    ridershipExposure: real("ridership_exposure"),
    transferExposure: real("transfer_exposure"),
    riderDelayIndex: real("rider_delay_index"),
    riderImpactShare: real("rider_impact_share"),
    riderWeightedSpeedSeverity: real("rider_weighted_speed_severity"),
    riderWeightedSlowWindowShare: real("rider_weighted_slow_window_share"),
    riderImpactScore: integer("rider_impact_score"),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month, table.hotspotRank] })],
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

export const localBusWaitAssessment = sqliteTable(
  "local_bus_wait_assessment",
  {
    month: text("month").notNull(),
    routeId: text("route_id").notNull(),
    borough: text("borough").notNull(),
    dayType: integer("day_type").notNull(),
    tripType: text("trip_type").notNull(),
    period: text("period").notNull(),
    tripsPassingWait: integer("trips_passing_wait").notNull(),
    scheduledTrips: integer("scheduled_trips").notNull(),
    waitAssessment: real("wait_assessment"),
  },
  (table) => [
    primaryKey({
      columns: [table.month, table.routeId, table.dayType, table.tripType, table.period],
    }),
  ],
);

export const localBusCustomerJourneyMetric = sqliteTable(
  "local_bus_customer_journey_metric",
  {
    month: text("month").notNull(),
    routeId: text("route_id").notNull(),
    borough: text("borough").notNull(),
    tripType: text("trip_type").notNull(),
    period: text("period").notNull(),
    customers: real("customers").notNull(),
    additionalBusStopTimeMinutes: real("additional_bus_stop_time_minutes"),
    additionalTravelTimeMinutes: real("additional_travel_time_minutes"),
    customerJourneyTimeMinutes: real("customer_journey_time_minutes"),
  },
  (table) => [
    primaryKey({
      columns: [table.month, table.routeId, table.tripType, table.period],
    }),
  ],
);

export const localDotTrafficSpeed = sqliteTable(
  "local_dot_traffic_speed",
  {
    linkId: text("link_id").notNull(),
    sampledAt: text("sampled_at").notNull(),
    speed: real("speed"),
    travelTime: real("travel_time"),
    statusCode: text("status_code").notNull(),
    owner: text("owner"),
    borough: text("borough"),
    linkName: text("link_name"),
    linkPoints: text("link_points"),
    transcomId: text("transcom_id"),
    // Populated by geocode:traffic-speeds via lat/lng snap from link_points.
    physicalId: text("physical_id"),
    geocodeConfidence: text("geocode_confidence"),
  },
  (table) => [primaryKey({ columns: [table.linkId, table.sampledAt] })],
);

// NYC DOT Street Construction (tqtj-sjs8) + Street Opening (9jic-byiu) share a
// schema; permit_kind discriminates so they coexist in one table.
export const localDotStreetPermit = sqliteTable("local_dot_street_permit", {
  permitNumber: text("permit_number").primaryKey(),
  permitKind: text("permit_kind", { enum: ["construction", "opening"] }).notNull(),
  applicationTrackingId: text("application_tracking_id"),
  permitTypeId: text("permit_type_id"),
  permitTypeDesc: text("permit_type_desc"),
  permitStatusId: text("permit_status_id"),
  permitStatusDesc: text("permit_status_desc"),
  permitSeriesId: text("permit_series_id"),
  permitSeriesDesc: text("permit_series_desc"),
  applicationTypeShortDesc: text("application_type_short_desc"),
  equipmentTypeDesc: text("equipment_type_desc"),
  numberOfZones: integer("number_of_zones"),
  linearFeet: real("linear_feet"),
  totalSqFeet: real("total_sq_feet"),
  estimatedNumberOfCuts: integer("estimated_number_of_cuts"),
  permitIssueDate: text("permit_issue_date"),
  emergencyIssueDate: text("emergency_issue_date"),
  issuedWorkStartDate: text("issued_work_start_date"),
  issuedWorkEndDate: text("issued_work_end_date"),
  boroughName: text("borough_name"),
  // Street fields used for corridor mapping. on/from/to describe the permit's
  // street segment; house_number anchors point-style permits.
  houseNumber: text("house_number"),
  onStreetName: text("on_street_name"),
  fromStreetName: text("from_street_name"),
  toStreetName: text("to_street_name"),
  purposeComments: text("purpose_comments"),
  // Populated by geocode:permits; preserved on re-ingest via ON CONFLICT.
  physicalId: text("physical_id"),
  geocodeConfidence: text("geocode_confidence"),
});

export const localDotTrafficVolumeCount = sqliteTable(
  "local_dot_traffic_volume_count",
  {
    requestId: integer("request_id").notNull(),
    segmentId: integer("segment_id").notNull(),
    sampledAt: text("sampled_at").notNull(),
    borough: text("borough"),
    street: text("street"),
    fromStreet: text("from_street"),
    toStreet: text("to_street"),
    direction: text("direction"),
    volume: integer("volume").notNull(),
    wktGeom: text("wkt_geom"),
    // Populated by geocode:traffic-volumes via Geoclient intersection of
    // (street, from_street) / (street, to_street).
    physicalId: text("physical_id"),
    geocodeConfidence: text("geocode_confidence"),
  },
  (table) => [primaryKey({ columns: [table.requestId, table.segmentId, table.sampledAt] })],
);

// NOAA GHCN-Daily weather observations. Citywide daily summaries from 3 NYC
// stations (Central Park, LaGuardia, JFK). Detectors join by `date` to
// control for weather as a confounder when explaining bus reliability dips.
// Values use SI units: temps in °C, precipitation/snow in mm, wind in m/s.
export const localWeatherObservation = sqliteTable(
  "local_weather_observation",
  {
    stationId: text("station_id").notNull(),
    date: text("date").notNull(),
    stationName: text("station_name"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    elevationM: real("elevation_m"),
    prcpMm: real("prcp_mm"),
    snowMm: real("snow_mm"),
    snwdMm: real("snwd_mm"),
    tmaxC: real("tmax_c"),
    tminC: real("tmin_c"),
    tavgC: real("tavg_c"),
    awndMs: real("awnd_ms"),
    // Weather-type flags. Each is "1" when the day saw that condition.
    hasFog: integer("has_fog", { mode: "boolean" }),
    hasThunder: integer("has_thunder", { mode: "boolean" }),
    hasSleet: integer("has_sleet", { mode: "boolean" }),
    hasHail: integer("has_hail", { mode: "boolean" }),
    hasHighWind: integer("has_high_wind", { mode: "boolean" }),
    hasRain: integer("has_rain", { mode: "boolean" }),
    hasSnow: integer("has_snow", { mode: "boolean" }),
    ingestedAt: text("ingested_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.stationId, table.date] })],
);

export const localNypdCollision = sqliteTable("local_nypd_collision", {
  collisionId: text("collision_id").primaryKey(),
  crashDate: text("crash_date").notNull(),
  crashTime: text("crash_time"),
  borough: text("borough"),
  zipCode: text("zip_code"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  onStreetName: text("on_street_name"),
  offStreetName: text("off_street_name"),
  crossStreetName: text("cross_street_name"),
  personsInjured: integer("persons_injured"),
  personsKilled: integer("persons_killed"),
  pedestriansInjured: integer("pedestrians_injured"),
  pedestriansKilled: integer("pedestrians_killed"),
  cyclistInjured: integer("cyclist_injured"),
  cyclistKilled: integer("cyclist_killed"),
  motoristInjured: integer("motorist_injured"),
  motoristKilled: integer("motorist_killed"),
  contributingFactorVehicle1: text("contributing_factor_vehicle_1"),
  contributingFactorVehicle2: text("contributing_factor_vehicle_2"),
  physicalId: text("physical_id"),
  geocodeConfidence: text("geocode_confidence"),
});

// 311 Service Requests (current erm2-nwe9 + historical 76ig-c548). Two
// tables, identical schema, so 311 spans can be loaded into either without
// risk of merging eras. era discriminates ("current" vs "historical").
export const local311ServiceRequest = sqliteTable("local_311_service_request", {
  uniqueKey: text("unique_key").primaryKey(),
  era: text("era", { enum: ["current", "historical"] }).notNull(),
  createdDate: text("created_date").notNull(),
  closedDate: text("closed_date"),
  agency: text("agency"),
  agencyName: text("agency_name"),
  complaintType: text("complaint_type"),
  descriptor: text("descriptor"),
  locationType: text("location_type"),
  incidentZip: text("incident_zip"),
  incidentAddress: text("incident_address"),
  streetName: text("street_name"),
  crossStreet1: text("cross_street_1"),
  crossStreet2: text("cross_street_2"),
  city: text("city"),
  status: text("status"),
  resolutionDescription: text("resolution_description"),
  communityBoard: text("community_board"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  physicalId: text("physical_id"),
  geocodeConfidence: text("geocode_confidence"),
});

export const localParkingViolation = sqliteTable(
  "local_parking_violation",
  {
    summonsNumber: text("summons_number").primaryKey(),
    issueDate: text("issue_date").notNull(),
    violationCode: integer("violation_code").notNull(),
    violationDescription: text("violation_description"),
    plateId: text("plate_id"),
    registrationState: text("registration_state"),
    plateType: text("plate_type"),
    vehicleBodyType: text("vehicle_body_type"),
    vehicleMake: text("vehicle_make"),
    issuingAgency: text("issuing_agency"),
    streetCode1: text("street_code1"),
    streetCode2: text("street_code2"),
    streetCode3: text("street_code3"),
    violationLocation: text("violation_location"),
    violationPrecinct: integer("violation_precinct"),
    violationCounty: text("violation_county"),
    houseNumber: text("house_number"),
    streetName: text("street_name"),
    intersectingStreet: text("intersecting_street"),
    violationTime: text("violation_time"),
    physicalId: text("physical_id"),
    geocodeConfidence: text("geocode_confidence"),
    matchLocationKey: text("match_location_key"),
  },
  (table) => [
    index("local_parking_violation_pending_geocode_idx").on(
      table.issueDate,
      table.houseNumber,
      table.streetName,
      table.violationCounty,
      table.physicalId,
      table.geocodeConfidence,
    ),
    index("local_parking_violation_pending_geocode_address_idx").on(
      table.houseNumber,
      table.streetName,
      table.violationCounty,
      table.issueDate,
      table.physicalId,
      table.geocodeConfidence,
    ),
    index("local_parking_violation_match_location_idx").on(table.matchLocationKey),
    index("local_parking_violation_street_code_idx").on(
      table.violationCounty,
      table.streetCode1,
      table.houseNumber,
    ),
  ],
);

// Deliberately raw-only applied-research read model. Parking matching builds
// and reads weighted route candidates with raw SQL because the matching logic
// depends on custom fanout/evidence aggregation rather than CRUD-style rows.
export const localParkingViolationMatch = sqliteTable(
  "local_parking_violation_match",
  {
    locationKey: text("location_key").notNull(),
    matchRank: integer("match_rank").notNull(),
    matchKind: text("match_kind").notNull(),
    confidence: text("confidence").notNull(),
    violationCode: integer("violation_code").notNull(),
    violationCounty: text("violation_county"),
    streetName: text("street_name"),
    intersectingStreet: text("intersecting_street"),
    physicalId: text("physical_id").notNull(),
    routeId: text("route_id").notNull(),
    candidateCount: integer("candidate_count").notNull(),
    routeFanout: integer("route_fanout").notNull(),
    matchWeight: real("match_weight").notNull(),
    eventCount: integer("event_count").notNull(),
    matchedAt: text("matched_at").notNull(),
    evidenceJson: text("evidence_json").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.locationKey, table.matchRank] }),
    index("local_parking_violation_match_route_idx").on(table.routeId),
    index("local_parking_violation_match_physical_idx").on(table.physicalId),
    index("local_parking_violation_match_kind_idx").on(table.matchKind, table.confidence),
  ],
);

// NYC LION street-centerline segment metadata. DCP page, not Socrata — we
// store stable street segment IDs and basic geometry hash references that
// other DOT/311/parking sources can join through. Geometry kept as raw WKT.
export const localLionSegment = sqliteTable("local_lion_segment", {
  physicalId: text("physical_id").primaryKey(),
  streetCodeMaster: text("street_code_master"),
  streetName: text("street_name"),
  borough: text("borough"),
  boroughCode: text("borough_code"),
  leftLowHouseNumber: text("l_low_hn"),
  leftHighHouseNumber: text("l_high_hn"),
  rightLowHouseNumber: text("r_low_hn"),
  rightHighHouseNumber: text("r_high_hn"),
  l_zip: text("l_zip"),
  r_zip: text("r_zip"),
  segmentTypeCode: text("segment_type_code"),
  segmentTypeDesc: text("segment_type_desc"),
  rwTypeCode: text("rw_type_code"),
  rwTypeDesc: text("rw_type_desc"),
  fromNodeId: text("from_node_id"),
  toNodeId: text("to_node_id"),
  trafficDir: text("traffic_dir"),
  fromLevelCode: text("from_level_code"),
  toLevelCode: text("to_level_code"),
  shapeLength: real("shape_length"),
  wktGeom: text("wkt_geom"),
});

// Deliberately raw-only Spatialite-backed companion to local_lion_segment. The
// `geom` column is added at runtime via
// `AddGeometryColumn('local_lion_segment_geom','geom', 4326,'GEOMETRY','XY')`;
// drizzle only knows about the PK so the spatial column stays opaque to
// non-geo code paths.
export const localLionSegmentGeom = sqliteTable("local_lion_segment_geom", {
  physicalId: text("physical_id").primaryKey(),
  builtAt: text("built_at").notNull(),
});

// Deliberately raw-only Spatialite-backed route shape geometry. One row per
// (routeId, shapeId). Geometry column added via AddGeometryColumn at runtime.
export const localRouteShapeGeom = sqliteTable(
  "local_route_shape_geom",
  {
    routeId: text("route_id").notNull(),
    shapeId: text("shape_id").notNull(),
    directionId: integer("direction_id"),
    routeShortName: text("route_short_name"),
    builtAt: text("built_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.shapeId] })],
);

// Flat lookup linking each route to the LION segments its buffered shape
// crosses. Worker / D1 can consume this without ever loading spatialite.
export const localRouteLionLink = sqliteTable(
  "local_route_lion_link",
  {
    routeId: text("route_id").notNull(),
    physicalId: text("physical_id").notNull(),
    overlapMeters: real("overlap_meters").notNull(),
    bufferMeters: real("buffer_meters").notNull(),
    matchKind: text("match_kind").notNull(),
    streetName: text("street_name"),
    borough: text("borough"),
    computedAt: text("computed_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.routeId, table.physicalId] }),
    index("local_route_lion_link_physical_id_idx").on(table.physicalId),
  ],
);

// Shared address-geocode cache, dedup'd across context sources. Misses are
// stored as rows with physical_id IS NULL so re-runs do not re-hit the API.
export const localAddressGeocode = sqliteTable("local_address_geocode", {
  rawKey: text("raw_key").primaryKey(),
  sourceLabel: text("source_label").notNull(),
  inputKind: text("input_kind").notNull(),
  inputJson: text("input_json").notNull(),
  physicalId: text("physical_id"),
  lat: real("lat"),
  lng: real("lng"),
  confidence: text("confidence"),
  errorReason: text("error_reason"),
  geocodedAt: text("geocoded_at").notNull(),
  rawResponse: text("raw_response"),
});

// Normalized cross-source event row populated by build:context-events after
// geocoding. event_id is a stable hash of (sourceId, sourceRowId).
export const localContextEvent = sqliteTable(
  "local_context_event",
  {
    eventId: text("event_id").primaryKey(),
    sourceId: text("source_id").notNull(),
    sourceRowId: text("source_row_id").notNull(),
    eventKind: text("event_kind").notNull(),
    occurredAt: text("occurred_at").notNull(),
    endedAt: text("ended_at"),
    physicalId: text("physical_id"),
    lat: real("lat"),
    lng: real("lng"),
    routeId: text("route_id"),
    payloadJson: text("payload_json").notNull(),
    ingestedAt: text("ingested_at").notNull(),
  },
  (table) => [
    index("local_context_event_physical_time_idx").on(table.physicalId, table.occurredAt),
    index("local_context_event_route_time_idx").on(table.routeId, table.occurredAt),
  ],
);

// Detector-facing route touch bridge. This materializes the cheap answer to
// "which events touched which routes during this window?" without requiring
// every detector to re-join local_context_event through local_route_lion_link.
export const localContextEventRouteTouch = sqliteTable(
  "local_context_event_route_touch",
  {
    eventId: text("event_id").notNull(),
    routeId: text("route_id").notNull(),
    sourceId: text("source_id").notNull(),
    eventKind: text("event_kind").notNull(),
    occurredAt: text("occurred_at").notNull(),
    endedAt: text("ended_at"),
    physicalId: text("physical_id"),
    touchKind: text("touch_kind", {
      enum: ["direct_route", "route_lion_link", "parking_location_match"],
    }).notNull(),
    evidenceRole: text("evidence_role", { enum: ["primary", "context"] }).notNull(),
    overlapMeters: real("overlap_meters"),
    bufferMeters: real("buffer_meters"),
    routeFanout: integer("route_fanout").notNull(),
    matchWeight: real("match_weight").notNull(),
    computedAt: text("computed_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.routeId] }),
    index("local_context_event_route_touch_route_time_idx").on(table.routeId, table.occurredAt),
    index("local_context_event_route_touch_time_route_idx").on(table.occurredAt, table.routeId),
    index("local_context_event_route_touch_kind_time_idx").on(table.eventKind, table.occurredAt),
  ],
);

// Detector outputs — short, citable claims with severity and status.
// Hardened in 0027 to match the contract in
// knowledge/wiki/analysis/finding_coverage_and_corpus_expansion.md.
export const localFindingCandidate = sqliteTable(
  "local_finding_candidate",
  {
    candidateId: text("candidate_id").primaryKey(),
    detectorId: text("detector_id").notNull(),
    detectorRunId: text("detector_run_id").notNull(),
    month: text("month").notNull(),
    scopeKind: text("scope_kind", {
      enum: ["route", "segment", "corridor", "system"],
    }).notNull(),
    scopeId: text("scope_id").notNull(),
    routeId: text("route_id"),
    physicalId: text("physical_id"),
    category: text("category", {
      enum: ["reliability", "speed", "intervention", "data_quality", "context"],
    }).notNull(),
    severity: text("severity", { enum: ["info", "low", "medium", "high"] }).notNull(),
    confidence: text("confidence", {
      enum: ["insufficient", "low", "medium", "high"],
    }).notNull(),
    detectorScore: real("detector_score").notNull(),
    reasonCode: text("reason_code").notNull(),
    claimSafeLabel: text("claim_safe_label", {
      enum: [
        "no_issue_clean",
        "issue_clean",
        "issue_needs_review",
        "insufficient_evidence",
        "source_lag_expected",
      ],
    }).notNull(),
    claimText: text("claim_text").notNull(),
    status: text("status", {
      enum: ["open", "promoted", "dismissed", "superseded"],
    }).notNull(),
    reviewState: text("review_state", {
      enum: ["unreviewed", "needs_review", "approved", "rejected"],
    }).notNull(),
    windowStart: text("window_start"),
    windowEnd: text("window_end"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("local_finding_candidate_month_detector_route_idx").on(
      table.month,
      table.detectorId,
      table.routeId,
    ),
  ],
);

// Each candidate is backed by N evidence rows. Evidence kind now includes
// source_doc and coverage_audit so document-derived and audit-derived rows can
// link the same way as metric/source_row evidence.
export const localFindingEvidenceLink = sqliteTable("local_finding_evidence_link", {
  linkId: text("link_id").primaryKey(),
  candidateId: text("candidate_id")
    .notNull()
    .references(() => localFindingCandidate.candidateId, { onDelete: "cascade" }),
  evidenceKind: text("evidence_kind", {
    enum: ["metric", "context_event", "source_row", "missing_data", "source_doc", "coverage_audit"],
  }).notNull(),
  evidenceRole: text("evidence_role", {
    enum: [
      "primary",
      "context",
      "official_context",
      "counter_evidence",
      "caveat",
      "missing_data",
      "coverage_audit",
    ],
  }).notNull(),
  evidenceRef: text("evidence_ref").notNull(),
  evidenceWeight: real("evidence_weight"),
  note: text("note"),
});

// Per-detector-run accounting: how many routes/segments were considered,
// hit, skipped, and why. Drives "we looked, we just didn't find" UX. `month`
// is mandatory so per-month replacements stay safe; `reason_code` mirrors the
// candidate contract so coverage and candidates share a vocabulary.
export const localFindingCoverageAudit = sqliteTable(
  "local_finding_coverage_audit",
  {
    auditId: text("audit_id").primaryKey(),
    detectorRunId: text("detector_run_id").notNull(),
    detectorId: text("detector_id").notNull(),
    month: text("month").notNull(),
    scopeKind: text("scope_kind", {
      enum: ["route", "segment", "corridor", "system"],
    }).notNull(),
    scopeId: text("scope_id").notNull(),
    outcome: text("outcome", {
      enum: [
        "hit",
        "clean_no_hit",
        "skipped_missing_input",
        "skipped_failed_join",
        "source_lag",
        "deferred_not_in_scope",
      ],
    }).notNull(),
    reasonCode: text("reason_code"),
    reason: text("reason"),
    inputsSeenJson: text("inputs_seen_json"),
    inputsExpectedJson: text("inputs_expected_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("local_finding_coverage_audit_run_detector_outcome_idx").on(
      table.detectorRunId,
      table.detectorId,
      table.outcome,
    ),
  ],
);

export const localInterventionEvent = sqliteTable("local_intervention_event", {
  eventId: text("event_id").primaryKey(),
  routeId: text("route_id").notNull(),
  interventionType: text("intervention_type").notNull(),
  sourceId: text("source_id").notNull(),
  program: text("program").notNull(),
  implementationDate: text("implementation_date").notNull(),
  implementationMonth: text("implementation_month").notNull(),
  eventStatus: text("event_status").notNull(),
  description: text("description").notNull(),
});

export const localRouteInterventionComparison = sqliteTable(
  "local_route_intervention_comparison",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    eventId: text("event_id").notNull(),
    interventionType: text("intervention_type").notNull(),
    sourceId: text("source_id").notNull(),
    evaluationLevel: text("evaluation_level").notNull(),
    comparisonStatus: text("comparison_status").notNull(),
    preStartMonth: text("pre_start_month"),
    preEndMonth: text("pre_end_month"),
    postStartMonth: text("post_start_month"),
    postEndMonth: text("post_end_month"),
    requestedPreMonthCount: integer("requested_pre_month_count").notNull(),
    requestedPostMonthCount: integer("requested_post_month_count").notNull(),
    preSampleMonthCount: integer("pre_sample_month_count").notNull(),
    postSampleMonthCount: integer("post_sample_month_count").notNull(),
    preSpeedObservationCount: integer("pre_speed_observation_count").notNull(),
    postSpeedObservationCount: integer("post_speed_observation_count").notNull(),
    preAverageSpeedMph: real("pre_average_speed_mph"),
    postAverageSpeedMph: real("post_average_speed_mph"),
    speedDeltaMph: real("speed_delta_mph"),
    preAverageMonthlyRidership: real("pre_average_monthly_ridership"),
    postAverageMonthlyRidership: real("post_average_monthly_ridership"),
    ridershipDelta: real("ridership_delta"),
    comparisonRouteCount: integer("comparison_route_count").notNull().default(0),
    comparisonRouteIds: text("comparison_route_ids"),
    comparisonPreAverageSpeedMph: real("comparison_pre_average_speed_mph"),
    comparisonPostAverageSpeedMph: real("comparison_post_average_speed_mph"),
    comparisonSpeedDeltaMph: real("comparison_speed_delta_mph"),
    adjustedSpeedDeltaMph: real("adjusted_speed_delta_mph"),
    comparisonPreAverageMonthlyRidership: real("comparison_pre_average_monthly_ridership"),
    comparisonPostAverageMonthlyRidership: real("comparison_post_average_monthly_ridership"),
    comparisonRidershipDelta: real("comparison_ridership_delta"),
    adjustedRidershipDelta: real("adjusted_ridership_delta"),
    caveat: text("caveat").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.routeId, table.month, table.eventId] }),
    index("local_route_intervention_comparison_month_route_idx").on(table.month, table.routeId),
  ],
);

export const localCorridor = sqliteTable("local_corridor", {
  corridorId: text("corridor_id").primaryKey(),
  corridorName: text("corridor_name").notNull(),
  corridorKey: text("corridor_key").notNull(),
  derivationMethod: text("derivation_method").notNull(),
});

export const localCorridorRouteMember = sqliteTable(
  "local_corridor_route_member",
  {
    corridorId: text("corridor_id").notNull(),
    month: text("month").notNull(),
    routeId: text("route_id").notNull(),
    assignmentStatus: text("assignment_status").notNull(),
    assignmentReason: text("assignment_reason").notNull(),
    stopCount: integer("stop_count").notNull(),
    matchedStopCount: integer("matched_stop_count").notNull(),
    hotspotCount: integer("hotspot_count").notNull(),
    matchedSegmentCount: integer("matched_segment_count").notNull().default(0),
    segmentEvidenceScore: real("segment_evidence_score").notNull().default(0),
    totalRidership: real("total_ridership").notNull(),
    averageSpeedMph: real("average_speed_mph").notNull(),
  },
  (table) => [primaryKey({ columns: [table.corridorId, table.month, table.routeId] })],
);

export const localCorridorMonthSummary = sqliteTable(
  "local_corridor_month_summary",
  {
    corridorId: text("corridor_id").notNull(),
    month: text("month").notNull(),
    routeCount: integer("route_count").notNull(),
    assignedRouteCount: integer("assigned_route_count").notNull(),
    ambiguousRouteCount: integer("ambiguous_route_count").notNull(),
    unassignedRouteCount: integer("unassigned_route_count").notNull(),
    totalRidership: real("total_ridership").notNull(),
    totalTransfers: real("total_transfers").notNull(),
    weightedAverageSpeedMph: real("weighted_average_speed_mph"),
    hotspotCount: integer("hotspot_count").notNull(),
    observedReliabilityRouteCount: integer("observed_reliability_route_count").notNull(),
    insufficientReliabilityRouteCount: integer("insufficient_reliability_route_count").notNull(),
    interventionComparisonCount: integer("intervention_comparison_count").notNull(),
    evaluatedInterventionComparisonCount: integer(
      "evaluated_intervention_comparison_count",
    ).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.corridorId, table.month] }),
    index("local_corridor_month_summary_month_idx").on(table.month),
  ],
);

export const localCorridorInterventionContext = sqliteTable(
  "local_corridor_intervention_context",
  {
    corridorId: text("corridor_id").notNull(),
    month: text("month").notNull(),
    contextRank: integer("context_rank").notNull(),
    routeId: text("route_id").notNull(),
    eventId: text("event_id").notNull(),
    interventionType: text("intervention_type").notNull(),
    sourceId: text("source_id").notNull(),
    program: text("program").notNull(),
    implementationMonth: text("implementation_month").notNull(),
    eventStatus: text("event_status").notNull(),
    evaluationLevel: text("evaluation_level").notNull(),
    comparisonStatus: text("comparison_status").notNull(),
    speedDeltaMph: real("speed_delta_mph"),
    adjustedSpeedDeltaMph: real("adjusted_speed_delta_mph"),
    ridershipDelta: real("ridership_delta"),
    adjustedRidershipDelta: real("adjusted_ridership_delta"),
    comparisonRouteCount: integer("comparison_route_count").notNull().default(0),
    caveat: text("caveat").notNull(),
  },
  (table) => [primaryKey({ columns: [table.corridorId, table.month, table.contextRank] })],
);

export const localCorridorHotspot = sqliteTable(
  "local_corridor_hotspot",
  {
    corridorId: text("corridor_id").notNull(),
    month: text("month").notNull(),
    corridorHotspotRank: integer("corridor_hotspot_rank").notNull(),
    routeId: text("route_id").notNull(),
    routeHotspotRank: integer("route_hotspot_rank").notNull(),
    fromStopName: text("from_stop_name").notNull(),
    toStopName: text("to_stop_name").notNull(),
    weightedAverageSpeedMph: real("weighted_average_speed_mph").notNull(),
    hotspotScore: integer("hotspot_score").notNull(),
    riderImpactScore: integer("rider_impact_score"),
  },
  (table) => [primaryKey({ columns: [table.corridorId, table.month, table.corridorHotspotRank] })],
);

export const localCorridorArtifact = sqliteTable(
  "local_corridor_artifact",
  {
    corridorId: text("corridor_id").notNull(),
    month: text("month").notNull(),
    artifactName: text("artifact_name").notNull(),
    artifactKey: text("artifact_key").notNull(),
    contentType: text("content_type").notNull(),
    byteLength: integer("byte_length").notNull(),
    sha256: text("sha256").notNull(),
  },
  (table) => [primaryKey({ columns: [table.corridorId, table.month, table.artifactName] })],
);

export const localCensusTractEquityContext = sqliteTable(
  "local_census_tract_equity_context",
  {
    acsYear: integer("acs_year").notNull(),
    geoid: text("geoid").notNull(),
    stateFips: text("state_fips").notNull(),
    countyFips: text("county_fips").notNull(),
    tractCode: text("tract_code").notNull(),
    countyName: text("county_name").notNull(),
    tractName: text("tract_name").notNull(),
    totalPopulation: integer("total_population"),
    occupiedHousingUnits: integer("occupied_housing_units"),
    noVehicleHouseholds: integer("no_vehicle_households"),
    noVehicleHouseholdShare: real("no_vehicle_household_share"),
    medianHouseholdIncome: integer("median_household_income"),
    povertyRate: real("poverty_rate"),
    publicTransitCommuters: integer("public_transit_commuters"),
    publicTransitCommuterShare: real("public_transit_commuter_share"),
    hispanicShare: real("hispanic_share"),
    nonHispanicWhiteShare: real("non_hispanic_white_share"),
    nonHispanicBlackShare: real("non_hispanic_black_share"),
    nonHispanicAsianShare: real("non_hispanic_asian_share"),
  },
  (table) => [primaryKey({ columns: [table.acsYear, table.geoid] })],
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
  (table) => [
    primaryKey({ columns: [table.routeId, table.month] }),
    index("local_route_equity_context_month_idx").on(table.month),
  ],
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
  (table) => [
    primaryKey({ columns: [table.routeId, table.month] }),
    index("local_route_scorecard_month_idx").on(table.month),
  ],
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
  (table) => [
    primaryKey({ columns: [table.routeId, table.month] }),
    index("local_route_brief_summary_month_idx").on(table.month),
  ],
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

export const localRouteBatchStatus = sqliteTable("local_route_batch_status", {
  month: text("month").primaryKey(),
  generatedAt: text("generated_at").notNull(),
  status: text("status", { enum: ["running", "pass", "fail"] }).notNull(),
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

export const localTier2InterventionEvent = sqliteTable("local_tier2_intervention_event", {
  eventId: text("event_id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  sourceId: text("source_id").notNull(),
  sourceTitle: text("source_title"),
  sourceUrl: text("source_url"),
  interventionType: text("intervention_type").notNull(),
  implementationDate: text("implementation_date").notNull(),
  implementationMonth: text("implementation_month").notNull(),
  datePrecision: text("date_precision").notNull(),
  eventStatus: text("event_status").notNull(),
  validationState: text("validation_state").notNull(),
  duplicateReviewState: text("duplicate_review_state").notNull(),
  duplicateFingerprint: text("duplicate_fingerprint").notNull(),
  promotionState: text("promotion_state").notNull(),
});

export const localTier2InterventionEventRoute = sqliteTable(
  "local_tier2_intervention_event_route",
  {
    eventId: text("event_id").notNull(),
    routeId: text("route_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.routeId] })],
);

export const localTier2InterventionEventSourceSpan = sqliteTable(
  "local_tier2_intervention_event_source_span",
  {
    eventId: text("event_id").notNull(),
    chunkRank: integer("chunk_rank").notNull(),
    chunkId: text("chunk_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.chunkRank] })],
);
