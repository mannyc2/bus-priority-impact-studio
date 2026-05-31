export const ROUTE_SEGMENT_MONTH_FEATURE_GRAIN = "route_segment_month" as const;

export type RouteSegmentMonthFeature = {
  routeId: string;
  month: string;
  segmentId: string;
  direction: string;
  stopOrder: number;
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
