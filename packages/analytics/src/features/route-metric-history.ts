import type { FeatureCoverageStatus, FeatureQuality } from "./quality.js";

type AnalyticsDetectorScopeKind = "route" | "segment" | "corridor" | "system";

export const ROUTE_METRIC_HISTORY_FEATURE_GRAIN = "route_metric_history" as const;

export type RouteMetricHistoryPoint = {
  month: string;
  value: number | null;
  coverageStatus: FeatureCoverageStatus;
  routeVersion: string | null;
};

export type RouteMetricHistoryFeature = {
  scopeKind: AnalyticsDetectorScopeKind;
  scopeId: string;
  metricName: string;
  historyWindowMonths: number;
  points: readonly RouteMetricHistoryPoint[];
  routeVersionBreaks: readonly string[];
  quality: FeatureQuality;
};

export function routeMetricHistoryFeatureKey(feature: RouteMetricHistoryFeature): string {
  return [feature.scopeKind, feature.scopeId, feature.metricName, feature.historyWindowMonths].join(
    ":",
  );
}
