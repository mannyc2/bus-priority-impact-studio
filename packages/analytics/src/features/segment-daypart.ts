import type { FeatureQuality } from "./quality.js";

export const SEGMENT_DAYPART_FEATURE_GRAIN = "segment_daypart" as const;

export type SegmentDaypartFeature = {
  routeId: string;
  month: string;
  segmentId: string;
  direction: string;
  daypart: string;
  traversalCount: number;
  segmentLengthFeet: number | null;
  minSegmentLengthFeet: number | null;
  medianSpeedMph: number | null;
  medianPaceMinutesPerMile: number | null;
  freeFlowPaceMinutesPerMile: number | null;
  systematicDelayMinutesPerMile: number | null;
  stochasticDelayMinutesPerMile: number | null;
  spatialConfidence: number | null;
  quality: FeatureQuality;
};

export function segmentDaypartFeatureKey(feature: SegmentDaypartFeature): string {
  return [feature.routeId, feature.month, feature.direction, feature.segmentId, feature.daypart].join(
    ":",
  );
}
