export const ROUTE_SEGMENT_MONTH_FEATURE_GRAIN = "route_segment_month" as const;

export type RouteSegmentMonthFeature = {
  routeId: string;
  month: string;
  segmentId: string;
  direction: string;
  stopOrder: number;
  // First/last direction segment (stopOrder === 1 or stopOrder >= the per-direction max). Exposed so
  // segment-grain detectors can gate terminal/layover dwell instead of re-deriving it (S2.1).
  isTerminal: boolean;
  timepointStopName: string;
  nextTimepointStopName: string;
  observationCount: number;
  busTripCount: number;
  weightedAverageSpeedMph: number;
  weightedAverageTravelTimeMinutes: number | null;
  averageRoadDistanceMiles: number | null;
  slowWindowShare: number | null;
  speedSeverity: number | null;
  hotspotScore: number | null;
  riderImpactScore: number | null;
  ridershipExposure: number | null;
};
