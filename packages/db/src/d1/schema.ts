import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const routeArtifact = sqliteTable(
  "route_artifact",
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

export const mapReleaseCatalog = sqliteTable(
  "map_release_catalog",
  {
    releaseId: text("release_id").primaryKey(),
    publishedAt: text("published_at").notNull(),
    coverageStart: text("coverage_start"),
    coverageEnd: text("coverage_end").notNull(),
    manifestKey: text("manifest_key").notNull(),
    manifestSha256: text("manifest_sha256").notNull(),
    releaseProfile: text("release_profile").notNull(),
    verificationStatus: text("verification_status").notNull(),
    routeCount: integer("route_count").notNull(),
  },
  (table) => [uniqueIndex("map_release_catalog_manifest_key_idx").on(table.manifestKey)],
);

export const routeScorecard = sqliteTable(
  "route_scorecard",
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

export const routeScorecardCitation = sqliteTable(
  "route_scorecard_citation",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    citationRank: integer("citation_rank").notNull(),
    sourceId: text("source_id").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    verifiedAt: text("verified_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month, table.citationRank] })],
);

export const routeCatalog = sqliteTable("route_catalog", {
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

export const routeCatalogType = sqliteTable(
  "route_catalog_type",
  {
    routeId: text("route_id").notNull(),
    typeRank: integer("type_rank").notNull(),
    routeType: text("route_type").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.typeRank] })],
);

export const routeCatalogTripType = sqliteTable(
  "route_catalog_trip_type",
  {
    routeId: text("route_id").notNull(),
    tripTypeRank: integer("trip_type_rank").notNull(),
    tripType: text("trip_type").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.tripTypeRank] })],
);

export const exactRouteIdentityRelease = sqliteTable("exact_route_identity_release", {
  releaseId: text("release_id").primaryKey(),
  publishedAt: text("published_at").notNull(),
  coverageStart: text("coverage_start"),
  coverageEnd: text("coverage_end").notNull(),
  sourceWikiRelease: text("source_wiki_release").notNull(),
  sourceManifestSha256: text("source_manifest_sha256").notNull(),
  sourceRouteIdentitySha256: text("source_route_identity_sha256").notNull(),
  sourceCurrentBusRoutesSha256: text("source_current_bus_routes_sha256").notNull(),
  sourceIndexSha256: text("source_index_sha256").notNull(),
  catalogSnapshotSha256: text("catalog_snapshot_sha256").notNull(),
  projectionSha256: text("projection_sha256").notNull(),
  exactRouteCount: integer("exact_route_count").notNull(),
  routeTypeCount: integer("route_type_count").notNull(),
  tripTypeCount: integer("trip_type_count").notNull(),
});

export const routeDirection = sqliteTable(
  "route_direction",
  {
    routeId: text("route_id").notNull(),
    directionId: integer("direction_id").notNull(),
    directionName: text("direction_name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.directionId] })],
);

export const routeMonthCoverage = sqliteTable(
  "route_month_coverage",
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

export const routeReadiness = sqliteTable(
  "route_readiness",
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

export const routeReadinessMissingInput = sqliteTable(
  "route_readiness_missing_input",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    inputRank: integer("input_rank").notNull(),
    inputName: text("input_name").notNull(),
    severity: text("severity").notNull(),
    note: text("note"),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month, table.inputRank] })],
);

export const routeBuildPlan = sqliteTable(
  "route_build_plan",
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
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month] })],
);

export const routeReliabilityBaseline = sqliteTable(
  "route_reliability_baseline",
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

export const routeReliabilityGapWindow = sqliteTable(
  "route_reliability_gap_window",
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

export const routeObservedReliabilitySummary = sqliteTable(
  "route_observed_reliability_summary",
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
  (table) => [primaryKey({ columns: [table.routeId, table.month, table.runId] })],
);

// Current-signal rows are intentionally outside serving-candidate namespaces. They use a
// separate table name so pointer-scoped reads cannot accidentally mix post-coverage observations
// into an immutable release.
export const routeObservedReliabilityCurrentSignal = sqliteTable(
  "route_observed_reliability_current_signal",
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
  (table) => [primaryKey({ columns: [table.routeId, table.month, table.runId] })],
);

export const interventionEvent = sqliteTable("intervention_event", {
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

export const routeInterventionComparison = sqliteTable(
  "route_intervention_comparison",
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
  (table) => [primaryKey({ columns: [table.routeId, table.month, table.eventId] })],
);

export const corridor = sqliteTable("corridor", {
  corridorId: text("corridor_id").primaryKey(),
  corridorName: text("corridor_name").notNull(),
  corridorKey: text("corridor_key").notNull(),
  derivationMethod: text("derivation_method").notNull(),
});

export const corridorRouteMember = sqliteTable(
  "corridor_route_member",
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

export const corridorMonthSummary = sqliteTable(
  "corridor_month_summary",
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
  (table) => [primaryKey({ columns: [table.corridorId, table.month] })],
);

export const corridorInterventionContext = sqliteTable(
  "corridor_intervention_context",
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

export const corridorHotspot = sqliteTable(
  "corridor_hotspot",
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

export const corridorArtifact = sqliteTable(
  "corridor_artifact",
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

export const routeMonthSourceStatus = sqliteTable(
  "route_month_source_status",
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

export const routeMonthSourceStatusCurrentSignal = sqliteTable(
  "route_month_source_status_current_signal",
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

export const routeMonthTrend = sqliteTable(
  "route_month_trend",
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

export const routeWaitAssessment = sqliteTable(
  "route_wait_assessment",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    assessmentRowCount: integer("assessment_row_count").notNull(),
    tripsPassingWait: real("trips_passing_wait").notNull(),
    scheduledTrips: real("scheduled_trips").notNull(),
    waitAssessment: real("wait_assessment"),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.month] })],
);

export const routeTimelineIndex = sqliteTable(
  "route_timeline_index",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    supportLevel: text("support_level", {
      enum: ["timeline_ready", "timeline_sparse", "timeline_review_only", "invalid"],
    }).notNull(),
    qualityFlagsJson: text("quality_flags_json").notNull(),
    defaultEventCount: integer("default_event_count").notNull(),
    secondaryEventCount: integer("secondary_event_count").notNull(),
    reviewOnlyEventCount: integer("review_only_event_count").notNull(),
    eventCount: integer("event_count").notNull(),
    sourceBackedEventCount: integer("source_backed_event_count").notNull(),
    dateAssertionBackedEventCount: integer("date_assertion_backed_event_count").notNull(),
    unresolvedDateEventCount: integer("unresolved_date_event_count").notNull(),
    lowConfidenceEventCount: integer("low_confidence_event_count").notNull(),
    unaccountedCandidateCount: integer("unaccounted_candidate_count").notNull(),
    validationErrorCount: integer("validation_error_count").notNull(),
    validationWarningCount: integer("validation_warning_count").notNull(),
    totalTokens: integer("total_tokens"),
    defaultEventsJson: text("default_events_json").notNull(),
    bundleArtifactKey: text("bundle_artifact_key").notNull(),
    bundleArtifactSha256: text("bundle_artifact_sha256").notNull(),
    bundleArtifactByteLength: integer("bundle_artifact_byte_length").notNull(),
    sourceBundlePath: text("source_bundle_path").notNull(),
    generatedAt: text("generated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.routeId, table.month] }),
    index("route_timeline_index_month_support_idx").on(table.month, table.supportLevel),
  ],
);

export const routeSpeedHistoryCoverage = sqliteTable(
  "route_speed_history_coverage",
  {
    routeId: text("route_id").notNull(),
    month: text("month").notNull(),
    routeSlug: text("route_slug").notNull(),
    historyStartMonth: text("history_start_month").notNull(),
    historyEndMonth: text("history_end_month").notNull(),
    artifactPath: text("artifact_path").notNull(),
    artifactStatus: text("artifact_status").notNull(),
    spineReadiness: text("spine_readiness").notNull(),
    spineReasonJson: text("spine_reason_json").notNull(),
    matchedCurrentSegmentCount: integer("matched_current_segment_count"),
    unmatchedCurrentSegmentCount: integer("unmatched_current_segment_count"),
    monthCount: integer("month_count").notNull(),
    segmentCount: integer("segment_count").notNull(),
    cellCount: integer("cell_count").notNull(),
    availableCellCount: integer("available_cell_count").notNull(),
    missingCellCount: integer("missing_cell_count").notNull(),
    generatedAt: text("generated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.routeId, table.month] }),
    index("route_speed_history_coverage_month_idx").on(table.month),
  ],
);

export const sourceMonthCoverage = sqliteTable(
  "source_month_coverage",
  {
    sourceId: text("source_id").notNull(),
    month: text("month").notNull(),
    label: text("label").notNull(),
    sourceKind: text("source_kind").notNull(),
    grain: text("grain").notNull(),
    status: text("status").notNull(),
    rowCount: integer("row_count"),
    routeCount: integer("route_count"),
    note: text("note"),
    generatedAt: text("generated_at").notNull(),
    artifactPath: text("artifact_path"),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.month] }),
    index("source_month_coverage_month_idx").on(table.month),
  ],
);

export const routeEquityContext = sqliteTable(
  "route_equity_context",
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

export const routeBriefSummary = sqliteTable(
  "route_brief_summary",
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

export const routeBriefPeakWindow = sqliteTable(
  "route_brief_peak_window",
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

export const routeBriefSlowestWindow = sqliteTable(
  "route_brief_slowest_window",
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

export const routeComparisonRank = sqliteTable(
  "route_comparison_rank",
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

export const routeBatchStatus = sqliteTable("route_batch_status", {
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

export const routeBatchBuiltRoute = sqliteTable(
  "route_batch_built_route",
  {
    month: text("month").notNull(),
    routeRank: integer("route_rank").notNull(),
    routeId: text("route_id").notNull(),
    artifactCount: integer("artifact_count"),
    status: text("status").notNull(),
  },
  (table) => [primaryKey({ columns: [table.month, table.routeRank] })],
);

export const routeBatchIssue = sqliteTable(
  "route_batch_issue",
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

export const studioActor = sqliteTable("studio_actor", {
  actorId: text("actor_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  workspaceId: text("workspace_id").notNull(),
  scopesJson: text("scopes_json").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const studioActorToken = sqliteTable(
  "studio_actor_token",
  {
    tokenId: text("token_id").primaryKey(),
    actorId: text("actor_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
  },
  (table) => [index("studio_actor_token_hash_idx").on(table.tokenHash)],
);

export const identity = sqliteTable(
  "identity",
  {
    identityId: text("identity_id").primaryKey(),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    displayName: text("display_name"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("identity_email_normalized_idx").on(table.emailNormalized)],
);

export const identitySession = sqliteTable(
  "identity_session",
  {
    sessionId: text("session_id").primaryKey(),
    identityId: text("identity_id").notNull(),
    kind: text("kind").notNull(),
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    expiresAt: text("expires_at"),
    consumedAt: text("consumed_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
  },
  (table) => [
    uniqueIndex("identity_session_token_hash_idx").on(table.tokenHash),
    index("identity_session_identity_kind_idx").on(table.identityId, table.kind),
  ],
);

export const studioActorRole = sqliteTable(
  "studio_actor_role",
  {
    roleId: text("role_id").primaryKey(),
    identityId: text("identity_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    scopesJson: text("scopes_json").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("studio_actor_role_identity_workspace_idx").on(table.identityId, table.workspaceId),
  ],
);

export const alert = sqliteTable(
  "alert",
  {
    alertId: text("alert_id").primaryKey(),
    identityId: text("identity_id").notNull(),
    kind: text("kind").notNull(),
    payloadJson: text("payload_json").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("alert_identity_idx").on(table.identityId)],
);

export const savedSearch = sqliteTable(
  "saved_search",
  {
    savedSearchId: text("saved_search_id").primaryKey(),
    identityId: text("identity_id").notNull(),
    label: text("label").notNull(),
    queryJson: text("query_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("saved_search_identity_idx").on(table.identityId)],
);

export const publicComment = sqliteTable(
  "public_comment",
  {
    commentId: text("comment_id").primaryKey(),
    briefId: text("brief_id").notNull(),
    identityId: text("identity_id").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("public_comment_brief_idx").on(table.briefId, table.createdAt),
    index("public_comment_identity_idx").on(table.identityId),
  ],
);
