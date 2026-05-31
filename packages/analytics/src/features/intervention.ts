export const INTERVENTION_WINDOW_FEATURE_GRAIN = "intervention_window" as const;

export type InterventionWindowFeature = {
  routeId: string;
  month: string;
  eventId: string;
  interventionType: string;
  comparisonStatus: string;
  adjustedSpeedDeltaMph: number | null;
  comparisonRouteCount: number;
  windowStart: string | null;
  windowEnd: string | null;
};
