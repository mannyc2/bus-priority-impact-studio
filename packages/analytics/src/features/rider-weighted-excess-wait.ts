import type { FeatureQuality } from "./quality.js";

export const RIDER_WEIGHTED_EXCESS_WAIT_FEATURE_GRAIN = "rider_weighted_excess_wait" as const;

export type RiderWeightedExcessWaitFeature = {
  routeId: string;
  stopId: string;
  stopName: string;
  direction: string;
  serviceDate: string;
  localHour: number;
  timezone: string;
  excessWaitTimeMinutes: number | null;
  boardings: number | null;
  boardingsSource: string | null;
  ridershipSnapshotId: string | null;
  ewtDetectorVersion: string | null;
  quality: FeatureQuality;
  ridershipQuality: FeatureQuality;
};

export function riderWeightedExcessWaitFeatureKey(
  feature: RiderWeightedExcessWaitFeature,
): string {
  return [
    feature.routeId,
    feature.direction,
    feature.stopId,
    feature.serviceDate,
    String(feature.localHour).padStart(2, "0"),
  ].join(":");
}
