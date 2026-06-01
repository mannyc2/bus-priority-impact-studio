export type FeatureMaterializationKind = "sqlite_table" | "artifact" | "embedded_quality_gate";

export type FeatureContract = {
  featureGrain: string;
  resolverId: string;
  materializationKind: FeatureMaterializationKind;
  featureType: string;
  grainKeys: string[];
  retainedAxes: string[];
  collapsedAxes: string[];
  requiredFields: string[];
  qualityFields: string[];
  sourceTables: string[];
  routeMonthUsage: "not_route_month" | "route_level_only" | "screening_only";
};

const FEATURE_CONTRACTS: FeatureContract[] = [
  {
    featureGrain: "segment_daypart",
    resolverId: "sqlite.local_route_segment_speed.segment_daypart.v1",
    materializationKind: "sqlite_table",
    featureType: "SegmentDaypartFeature",
    grainKeys: ["routeId", "month", "direction", "segmentId", "daypart"],
    retainedAxes: ["route", "month", "direction", "segment", "daypart"],
    collapsedAxes: ["source timestamp", "hour", "day of week", "individual trip traversal"],
    requiredFields: [
      "routeId",
      "month",
      "segmentId",
      "direction",
      "daypart",
      "traversalCount",
      "medianPaceMinutesPerMile",
      "freeFlowPaceMinutesPerMile",
      "spatialConfidence",
      "quality",
    ],
    qualityFields: [
      "quality.coverageStatus",
      "quality.freshnessStatus",
      "quality.sampleStatus",
      "quality.sampleCount",
    ],
    sourceTables: ["local_route_segment_speed"],
    routeMonthUsage: "not_route_month",
  },
  {
    featureGrain: "feed_health",
    resolverId: "embedded.feature_quality.v1",
    materializationKind: "embedded_quality_gate",
    featureType: "FeedHealthFeature | embedded FeatureQuality",
    grainKeys: ["sourceId", "scopeKind", "scopeId", "month"],
    retainedAxes: ["source", "scope", "month", "freshness", "coverage", "validator issue counts"],
    collapsedAxes: ["raw feed records"],
    requiredFields: ["quality.coverageStatus", "quality.freshnessStatus"],
    qualityFields: ["quality.coverageStatus", "quality.freshnessStatus"],
    sourceTables: ["local_finding_coverage_audit"],
    routeMonthUsage: "not_route_month",
  },
  {
    featureGrain: "route_segment_month",
    resolverId: "sqlite.local_route_segment_speed.route_segment_month.v1",
    materializationKind: "sqlite_table",
    featureType: "RouteSegmentMonthFeature",
    grainKeys: ["routeId", "month", "direction", "segmentId"],
    retainedAxes: ["route", "month", "direction", "timepoint segment", "stop order"],
    collapsedAxes: ["hour", "day of week", "trip traversal distribution"],
    requiredFields: ["routeId", "month", "segmentId", "medianSpeedMph", "sampleCount"],
    qualityFields: ["quality.coverageStatus", "quality.sampleStatus"],
    sourceTables: ["local_route_segment_speed"],
    routeMonthUsage: "not_route_month",
  },
  {
    featureGrain: "route_month",
    resolverId: "artifact.signal_features.route_month.v1",
    materializationKind: "artifact",
    featureType: "RouteMonthFeature",
    grainKeys: ["routeId", "month"],
    retainedAxes: ["route", "month", "route-level coverage"],
    collapsedAxes: ["segment", "direction", "stop", "hour", "day of week", "event timestamp"],
    requiredFields: ["routeId", "month", "coverage", "signals"],
    qualityFields: ["quality.coverageStatus"],
    sourceTables: ["local_route_month_trend", "signal-features.json"],
    routeMonthUsage: "screening_only",
  },
  {
    featureGrain: "route_reliability_month",
    resolverId: "sqlite.local_route_observed_reliability_summary.v1",
    materializationKind: "sqlite_table",
    featureType: "RouteReliabilityFeature",
    grainKeys: ["routeId", "month"],
    retainedAxes: ["route", "month", "observed run", "sample support"],
    collapsedAxes: ["stop", "direction", "hour", "headway pairs"],
    requiredFields: ["routeId", "month", "observedSampleCount", "quality"],
    qualityFields: ["quality.coverageStatus", "quality.sampleStatus"],
    sourceTables: ["local_route_observed_reliability_summary"],
    routeMonthUsage: "route_level_only",
  },
  {
    featureGrain: "stop_direction_hour",
    resolverId: "artifact.stop_direction_hour_ewt_features.v1",
    materializationKind: "artifact",
    featureType: "StopDirectionHourFeature",
    grainKeys: ["routeId", "stopId", "direction", "serviceDate", "hour"],
    retainedAxes: ["route", "stop", "direction", "service date", "hour"],
    collapsedAxes: ["vehicle trace rows after headway extraction"],
    requiredFields: ["observedHeadwayMinutes", "scheduledHeadwayMinutes", "quality"],
    qualityFields: ["quality.coverageStatus", "quality.sampleStatus"],
    sourceTables: ["local_observed_headway_sample", "local_route_schedule_timepoint"],
    routeMonthUsage: "not_route_month",
  },
  {
    featureGrain: "rider_weighted_excess_wait",
    resolverId: "artifact.rider_weighted_excess_wait.v1",
    materializationKind: "artifact",
    featureType: "RiderWeightedExcessWaitFeature",
    grainKeys: ["routeId", "stopId", "direction", "serviceDate", "hour"],
    retainedAxes: ["route", "stop", "direction", "service date", "hour", "ridership source"],
    collapsedAxes: ["individual riders"],
    requiredFields: ["excessWaitMinutes", "riderWeight", "quality"],
    qualityFields: ["quality.coverageStatus", "quality.sampleStatus"],
    sourceTables: ["local_observed_headway_sample", "local_route_hourly_ridership"],
    routeMonthUsage: "not_route_month",
  },
  {
    featureGrain: "route_direction_daypart",
    resolverId: "sqlite.route_direction_daypart.v1",
    materializationKind: "sqlite_table",
    featureType: "RouteDirectionDaypartFeature",
    grainKeys: ["routeId", "month", "direction", "daypart"],
    retainedAxes: ["route", "month", "direction", "daypart"],
    collapsedAxes: ["individual trips", "stop sequence", "raw hour"],
    requiredFields: ["observedRuntimeMinutes", "scheduledRuntimeMinutes", "quality"],
    qualityFields: ["quality.coverageStatus", "quality.sampleStatus"],
    sourceTables: ["local_route_schedule_timepoint", "local_observed_headway_sample"],
    routeMonthUsage: "not_route_month",
  },
  {
    featureGrain: "route_metric_history",
    resolverId: "sqlite.local_route_month_trend.history.v1",
    materializationKind: "sqlite_table",
    featureType: "RouteMetricHistoryFeature",
    grainKeys: ["scopeId", "metric", "month"],
    retainedAxes: ["scope", "metric", "month sequence", "coverage state"],
    collapsedAxes: ["within-month segment", "within-month stop", "within-month hour"],
    requiredFields: ["points", "quality"],
    qualityFields: ["quality.coverageStatus", "quality.sampleStatus"],
    sourceTables: ["local_route_month_trend"],
    routeMonthUsage: "route_level_only",
  },
  {
    featureGrain: "intervention_window",
    resolverId: "sqlite.local_route_intervention_comparison.window.v1",
    materializationKind: "sqlite_table",
    featureType: "InterventionWindowFeature",
    grainKeys: ["routeId", "eventId", "window"],
    retainedAxes: ["route", "month", "intervention event", "window"],
    collapsedAxes: ["within-window segment", "within-window daypart"],
    requiredFields: ["treatedMetric", "comparisonMetric", "quality"],
    qualityFields: ["quality.coverageStatus", "quality.sampleStatus"],
    sourceTables: ["local_route_intervention_comparison"],
    routeMonthUsage: "not_route_month",
  },
  {
    featureGrain: "intervention_panel",
    resolverId: "artifact.intervention_panel.v1",
    materializationKind: "artifact",
    featureType: "InterventionPanelFeature",
    grainKeys: ["eventId", "treatedScope", "controlScope", "period"],
    retainedAxes: ["event", "treated scope", "control scopes", "pre/post windows", "gate statuses"],
    collapsedAxes: ["raw observations inside each modeled window"],
    requiredFields: ["eventId", "treatedScope", "controlScopes", "prePostWindows", "quality"],
    qualityFields: ["quality.coverageStatus", "quality.sampleStatus"],
    sourceTables: ["local_route_intervention_comparison", "local_intervention_event"],
    routeMonthUsage: "not_route_month",
  },
  {
    featureGrain: "context_source_month",
    resolverId: "sqlite.local_context_event_route_touch.month.v1",
    materializationKind: "sqlite_table",
    featureType: "ContextSourceFeature",
    grainKeys: ["routeId", "month", "sourceId", "eventKind"],
    retainedAxes: ["route", "month", "source", "event kind", "join confidence"],
    collapsedAxes: ["event timestamp when only monthly aggregate is consumed"],
    requiredFields: ["eventCount", "matchWeight", "quality"],
    qualityFields: ["quality.coverageStatus"],
    sourceTables: ["local_context_event_route_touch"],
    routeMonthUsage: "not_route_month",
  },
  {
    featureGrain: "source_coverage",
    resolverId: "sqlite.source_coverage.v1",
    materializationKind: "sqlite_table",
    featureType: "SourceCoverageFeature",
    grainKeys: ["sourceId", "scopeKind", "scopeId", "month"],
    retainedAxes: ["source", "scope kind", "scope id", "month", "freshness", "join rate"],
    collapsedAxes: ["raw source rows"],
    requiredFields: ["observedCount", "expectedCount", "quality"],
    qualityFields: ["quality.coverageStatus", "quality.freshnessStatus"],
    sourceTables: ["local_route_month_coverage_release"],
    routeMonthUsage: "not_route_month",
  },
  {
    featureGrain: "positive_deviance",
    resolverId: "artifact.positive_deviance.v1",
    materializationKind: "artifact",
    featureType: "PositiveDevianceFeature",
    grainKeys: ["scopeId", "metric", "peerGroup", "period"],
    retainedAxes: ["scope", "metric", "peer group", "period", "covariates"],
    collapsedAxes: ["raw peer observations", "within-period detail"],
    requiredFields: ["metric", "peerGroup", "residual", "quality"],
    qualityFields: ["quality.coverageStatus", "quality.sampleStatus"],
    sourceTables: ["local_route_month_trend", "route_hourly_profile_artifact"],
    routeMonthUsage: "not_route_month",
  },
];

export function listFeatureContracts(): FeatureContract[] {
  return FEATURE_CONTRACTS.map((contract) => ({
    ...contract,
    grainKeys: [...contract.grainKeys],
    retainedAxes: [...contract.retainedAxes],
    collapsedAxes: [...contract.collapsedAxes],
    requiredFields: [...contract.requiredFields],
    qualityFields: [...contract.qualityFields],
    sourceTables: [...contract.sourceTables],
  }));
}

export function getFeatureContract(featureGrain: string): FeatureContract | null {
  return listFeatureContracts().find((contract) => contract.featureGrain === featureGrain) ?? null;
}

export function featureContractsForGrains(featureGrains: readonly string[]): FeatureContract[] {
  return featureGrains.map((featureGrain) => {
    const contract = getFeatureContract(featureGrain);
    if (contract === null) throw new Error(`Missing feature contract for ${featureGrain}`);
    return contract;
  });
}
