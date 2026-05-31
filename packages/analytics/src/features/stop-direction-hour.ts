import type { FeatureQuality } from "./quality.js";

export const STOP_DIRECTION_HOUR_FEATURE_GRAIN = "stop_direction_hour" as const;

export type StopDirectionHourFeature = {
  routeId: string;
  stopId: string;
  stopName: string;
  direction: string;
  serviceDate: string;
  localHour: number;
  timezone: string;
  scheduledHeadwayMinutes: number | null;
  scheduledBusesPerHour: number | null;
  observedHeadwaysMinutes: readonly number[];
  observedPairCount: number;
  bunchingPairCount: number;
  gapPairCount: number;
  quality: FeatureQuality;
};

export function stopDirectionHourFeatureKey(feature: StopDirectionHourFeature): string {
  return [
    feature.routeId,
    feature.direction,
    feature.stopId,
    feature.serviceDate,
    String(feature.localHour).padStart(2, "0"),
  ].join(":");
}
