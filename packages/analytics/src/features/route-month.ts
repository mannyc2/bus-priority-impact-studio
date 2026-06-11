import type { RouteMonthSignalFeature } from "@bp/domain/findings";

export type RouteMonthFeature = RouteMonthSignalFeature;

export const ROUTE_MONTH_FEATURE_GRAIN = "route_month" as const;

export function routeMonthFeatureKey(
  feature: Pick<RouteMonthFeature, "routeId" | "month" | "window" | "direction">,
): string {
  return [feature.routeId, feature.month, feature.window, feature.direction ?? "all"].join(":");
}
