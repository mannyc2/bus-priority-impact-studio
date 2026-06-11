export type FeatureCoverageStatus = "complete" | "partial" | "low_coverage" | "missing";

export type FeatureFreshnessStatus = "fresh" | "stale" | "missing" | "not_expected";

export type FeatureSampleStatus = "supported" | "insufficient_samples" | "missing_samples";

export type FeatureQuality = {
  coverageStatus: FeatureCoverageStatus;
  observedCount: number;
  expectedCount: number | null;
  coverageShare: number | null;
  freshnessStatus: FeatureFreshnessStatus;
  sampleCount: number;
  minSampleCount: number | null;
  sampleStatus: FeatureSampleStatus;
};

export function hasFeatureQuality(value: {
  quality?: FeatureQuality;
}): value is { quality: FeatureQuality } {
  return value.quality !== undefined;
}

export function featureQualityHasCoverage(quality: FeatureQuality): boolean {
  return quality.coverageStatus !== "low_coverage" && quality.coverageStatus !== "missing";
}

export function featureQualityHasFreshness(quality: FeatureQuality): boolean {
  return quality.freshnessStatus !== "stale" && quality.freshnessStatus !== "missing";
}

export function featureQualityHasSampleSupport(quality: FeatureQuality): boolean {
  return quality.sampleStatus === "supported";
}
