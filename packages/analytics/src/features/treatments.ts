export const ROUTE_TREATMENT_SUMMARY_FEATURE_GRAIN = "route_treatment_summary" as const;
export const ROUTE_SEGMENT_TREATMENT_SUMMARY_FEATURE_GRAIN =
  "route_segment_treatment_summary" as const;
export const ROUTE_TREATMENT_SOURCE_GAP_FEATURE_GRAIN = "route_treatment_source_gap" as const;

export type RouteTreatmentSummaryFeature = {
  routeId: string;
  month: string;
  treatmentType: string;
  status: string;
  geographyScope: string;
  evidenceLabel: string;
  confidence: string;
  sourceRefs: readonly string[];
};

export type RouteSegmentTreatmentSummaryFeature = RouteTreatmentSummaryFeature & {
  segmentId: string;
  directionId: string | null;
  segmentOrder: number | null;
  matchMethod: string;
  overlapShare: number | null;
  // DOT bus-lane facility types overlapping this segment (e.g. "Curbside", "Enhanced Bus Stop"),
  // carried as a typed field so detectors classify the bus-lane vs Enhanced-Bus-Stop split here
  // instead of re-deriving it by string-parsing `sourceRefs` at each gate (S2.3).
  laneTypes: readonly string[];
};

/**
 * A segment is Enhanced-Bus-Stop-only when it has lane-type evidence and every facility is an
 * Enhanced Bus Stop — a stop-level treatment without running-lane geometry. Any other facility
 * (Curbside, Busway, Offset, Bus Only, Shoulder, …) means real bus-lane geometry is present. This is
 * the single authority for the split; detectors and resolvers must call it rather than re-deriving.
 */
export function isEnhancedBusStopOnlyLaneTypes(laneTypes: readonly string[]): boolean {
  return (
    laneTypes.length > 0 &&
    laneTypes.every((laneType) => laneType.toLowerCase() === "enhanced bus stop")
  );
}

export type RouteTreatmentSourceGapFeature = {
  routeId: string | null;
  month: string;
  treatmentType: string;
  gapKind: string;
  sourceRefs: readonly string[];
  publicStatement: string;
  blocksClaims: readonly string[];
};
