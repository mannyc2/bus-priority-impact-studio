import { percentile } from "../concentration.js";
import { clamp, round } from "../core/numbers.js";
import type { FeatureQuality } from "../features/quality.js";
import {
  featureQualityHasCoverage,
  featureQualityHasFreshness,
  featureQualityHasSampleSupport,
} from "../features/quality.js";
import type { StopDirectionHourFeature } from "../features/stop-direction-hour.js";

export type HeadwayQualitySkip = {
  reasonCode: string;
  reason: string;
};

export type HeadwayDistributionSummary = {
  min: number | null;
  p50: number | null;
  p90: number | null;
  max: number | null;
};

export function validHeadwaysMinutes(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value) && value >= 0);
}

export function effectiveScheduledHeadwayMinutes(feature: StopDirectionHourFeature): number | null {
  if (
    feature.scheduledHeadwayMinutes !== null &&
    Number.isFinite(feature.scheduledHeadwayMinutes) &&
    feature.scheduledHeadwayMinutes > 0
  ) {
    return feature.scheduledHeadwayMinutes;
  }
  if (
    feature.scheduledBusesPerHour !== null &&
    Number.isFinite(feature.scheduledBusesPerHour) &&
    feature.scheduledBusesPerHour > 0
  ) {
    return 60 / feature.scheduledBusesPerHour;
  }
  return null;
}

export function summarizeHeadwaysMinutes(values: readonly number[]): HeadwayDistributionSummary {
  const headways = validHeadwaysMinutes(values);
  if (headways.length === 0) {
    return { min: null, p50: null, p90: null, max: null };
  }

  return {
    min: round(Math.min(...headways), 2),
    p50: round(percentile(headways, 0.5), 2),
    p90: round(percentile(headways, 0.9), 2),
    max: round(Math.max(...headways), 2),
  };
}

export function featureQualitySkipReason(
  quality: FeatureQuality,
  sampleReasonCode: string,
): HeadwayQualitySkip | null {
  if (!featureQualityHasCoverage(quality)) {
    return {
      reasonCode: "low_coverage",
      reason: "Feature coverage is too low to score this stop-direction-hour cell.",
    };
  }
  if (!featureQualityHasFreshness(quality)) {
    return {
      reasonCode: "feed_stale",
      reason: "Feature source freshness is too stale to score this stop-direction-hour cell.",
    };
  }
  if (!featureQualityHasSampleSupport(quality)) {
    return {
      reasonCode: sampleReasonCode,
      reason: "Feature sample support is below the detector minimum.",
    };
  }
  return null;
}

// Observation-sufficiency signal for ranking stop-direction-hour candidates. Thin-sample cells are
// usually feed-gap artifacts (each missing arrival fabricates a long "headway"), so equal raw
// severity must rank below well-observed cells. Blends absolute sample depth against the detector's
// high-confidence sample count with the schedule-implied coverage share when the feature carries one
// (expectedCount only spans observed service dates, so neither factor alone is sufficient).
export function observationSufficiencySignal(
  quality: FeatureQuality,
  sampleCount: number,
  highSampleCount: number,
): number {
  const sampleSufficiency = clamp(sampleCount / Math.max(highSampleCount, 1), 0, 1);
  const coverageSufficiency =
    quality.coverageShare === null ? 1 : clamp(quality.coverageShare, 0, 1);
  return sampleSufficiency * coverageSufficiency;
}

export function confidenceFromHeadwayQuality(
  quality: FeatureQuality,
  sampleCount: number,
  highSampleCount: number,
): "low" | "medium" | "high" {
  if (sampleCount >= highSampleCount && (quality.coverageShare ?? 0) >= 0.95) return "high";
  if (quality.coverageStatus === "partial" || (quality.coverageShare ?? 1) < 0.8) return "low";
  return "medium";
}
