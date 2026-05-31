export const CONTEXT_SOURCE_FEATURE_GRAIN = "context_source_month" as const;

export type ContextSourceFeature = {
  routeId: string;
  month: string;
  sourceId: string;
  eventKind: string;
  touchedEventCount: number;
  touchCount: number;
  primaryTouchCount: number;
  contextTouchCount: number;
  highConfidenceTouchCount: number;
  matchWeightSum: number;
  averageMatchWeight: number;
  maxRouteFanout: number;
};
