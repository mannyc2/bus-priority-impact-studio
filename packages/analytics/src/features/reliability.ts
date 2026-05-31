export const ROUTE_RELIABILITY_FEATURE_GRAIN = "route_reliability_month" as const;

export type RouteReliabilityFeature = {
  routeId: string;
  month: string;
  reliabilityStatus: "observed" | "insufficient_gtfs_rt_samples" | "missing";
  sampleCount: number;
  observedLongGapShare: number | null;
  waitReliabilityRatio: number | null;
  excessWaitMinutes: number | null;
  scheduledBaselineHeadwaySampleCount: number;
  busWaitAssessmentTripCount: number;
  busWaitAssessment: number | null;
};
