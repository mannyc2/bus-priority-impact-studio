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
      "isTerminal",
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
