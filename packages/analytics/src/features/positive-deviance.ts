import type { AnalyticsDetectorScopeKind } from "../core/detector.js";
import type { FeatureCoverageStatus, FeatureQuality } from "./quality.js";

export const POSITIVE_DEVIANCE_FEATURE_GRAIN = "positive_deviance" as const;

export type PositiveDeviancePeriodEvidence = {
  period: string;
  value: number | null;
  performancePercentile: number | null;
  adjustedResidual: number | null;
  reciprocalMetricWarnings: readonly string[];
  coverageStatus: FeatureCoverageStatus;
};

export type PositiveDevianceFeature = {
  scopeKind: AnalyticsDetectorScopeKind;
  scopeId: string;
  routeId: string | null;
  metricName: string;
  peerGroupId: string;
  peerGroupLabel: string;
  peerCount: number;
  minPeerCount: number;
  covariates: Record<string, string | number | boolean | null>;
  periods: readonly PositiveDeviancePeriodEvidence[];
  quality: FeatureQuality;
};

export function positiveDevianceFeatureKey(feature: PositiveDevianceFeature): string {
  return [
    feature.scopeKind,
    feature.scopeId,
    feature.metricName,
    feature.peerGroupId,
    feature.periods.length,
  ].join(":");
}
