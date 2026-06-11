import type { FeatureQuality } from "./quality.js";

export const ROUTE_DIRECTION_DAYPART_FEATURE_GRAIN = "route_direction_daypart" as const;

export type RouteDirectionDaypartFeature = {
  routeId: string;
  month: string;
  direction: string;
  daypart: string;
  servicePatternVersion: string;
  scheduledRuntimeMinutes: number | null;
  observedRuntimeP50Minutes: number | null;
  observedRuntimeP95Minutes: number | null;
  observedTripCount: number;
  quality: FeatureQuality;
};

export function routeDirectionDaypartFeatureKey(feature: RouteDirectionDaypartFeature): string {
  return [feature.routeId, feature.month, feature.direction, feature.daypart].join(":");
}
