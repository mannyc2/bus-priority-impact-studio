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
};

export type RouteTreatmentSourceGapFeature = {
  routeId: string | null;
  month: string;
  treatmentType: string;
  gapKind: string;
  sourceRefs: readonly string[];
  publicStatement: string;
  blocksClaims: readonly string[];
};

