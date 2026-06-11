import type { AnalyticsDetectorScopeKind } from "../core/detector.js";
import type { FeatureQuality } from "./quality.js";

export const FEED_HEALTH_FEATURE_GRAIN = "feed_health" as const;

export type FeedHealthFeature = {
  sourceId: string;
  scopeKind: AnalyticsDetectorScopeKind;
  scopeId: string;
  month: string;
  observedRecordCount: number;
  expectedRecordCount: number | null;
  freshnessLagMinutes: number | null;
  validatorIssueCounts: Readonly<Record<string, number>>;
  maintenanceWindow: boolean;
  quality: FeatureQuality;
};

export function feedHealthFeatureKey(feature: FeedHealthFeature): string {
  return [feature.sourceId, feature.scopeKind, feature.scopeId, feature.month].join(":");
}
