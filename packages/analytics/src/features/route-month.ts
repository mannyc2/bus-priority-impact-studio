import type { RouteMonthSignalFeature } from "@bp/domain";

export type RouteMonthFeature = RouteMonthSignalFeature;

export const ROUTE_MONTH_FEATURE_GRAIN = "route_month" as const;

export function routeMonthFeatureKey(feature: RouteMonthFeature): string {
  return [feature.routeId, feature.month, feature.window, feature.direction ?? "all"].join(":");
}
