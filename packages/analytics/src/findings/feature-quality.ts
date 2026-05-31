import type { FeatureQuality } from "../features/quality.js";
import {
  featureQualityHasCoverage,
  featureQualityHasFreshness,
  featureQualityHasSampleSupport,
} from "../features/quality.js";

export type FeatureQualitySkip = {
  reasonCode: string;
  reason: string;
  coverageOutcome: "skipped_missing_input" | "skipped_failed_join";
};

export function featureQualitySkipReason(
  quality: FeatureQuality,
  sampleReasonCode: string,
): FeatureQualitySkip | null {
  if (!featureQualityHasCoverage(quality)) {
    return {
      reasonCode: "low_coverage",
      reason: "Feature coverage is too low to score this scope.",
      coverageOutcome: "skipped_missing_input",
    };
  }
  if (!featureQualityHasFreshness(quality)) {
    return {
      reasonCode: "feed_stale",
      reason: "Feature source freshness is too stale to score this scope.",
      coverageOutcome: "skipped_missing_input",
    };
  }
  if (!featureQualityHasSampleSupport(quality)) {
    return {
      reasonCode: sampleReasonCode,
      reason: "Feature sample support is below the detector minimum.",
      coverageOutcome: "skipped_missing_input",
    };
  }
  return null;
}

export function confidenceFromFeatureQuality(
  quality: FeatureQuality,
  sampleCount: number,
  highSampleCount: number,
): "low" | "medium" | "high" {
  if (sampleCount >= highSampleCount && (quality.coverageShare ?? 0) >= 0.95) return "high";
  if (quality.coverageStatus === "partial" || (quality.coverageShare ?? 1) < 0.8) return "low";
  return "medium";
}
