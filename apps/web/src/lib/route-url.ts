import { type RouteData, routes } from "../fixtures/routes.js";

export type HotspotFilter = "all" | "slow" | "bunching" | "my";
export type RouteProfileTab = "overview" | "segments" | "reports";

export const DEFAULT_HOTSPOT_FILTER: HotspotFilter = "all";
export const DEFAULT_ROUTE_PROFILE_TAB: RouteProfileTab = "overview";
export const DEFAULT_COMPARE_ROUTES = ["B46+", "M15+"] as const;

const HOTSPOT_FILTERS = new Set<HotspotFilter>(["all", "slow", "bunching", "my"]);
const ROUTE_PROFILE_TABS = new Set<RouteProfileTab>(["overview", "segments", "reports"]);

function routeToUrlId(routeName: string): string {
  return routeName.toLowerCase().replace(/\s+/g, "-");
}

const routesByUrlId = new Map(routes.map((route) => [routeToUrlId(route.name), route]));
const routesByName = new Map(routes.map((route) => [route.name.toUpperCase(), route]));

export function routeToPathParams(routeName: string): { routeId: string } {
  return { routeId: routeToUrlId(routeName) };
}

export function routeFromUrlId(routeId: string): RouteData | null {
  return routesByUrlId.get(routeId.toLowerCase()) ?? null;
}

export function routeFromName(routeName: string): RouteData | null {
  return routesByName.get(routeName.toUpperCase()) ?? null;
}

export function asHotspotFilter(value: unknown): HotspotFilter {
  return typeof value === "string" && HOTSPOT_FILTERS.has(value as HotspotFilter)
    ? (value as HotspotFilter)
    : DEFAULT_HOTSPOT_FILTER;
}

export function asRouteProfileTab(value: unknown): RouteProfileTab {
  return typeof value === "string" && ROUTE_PROFILE_TABS.has(value as RouteProfileTab)
    ? (value as RouteProfileTab)
    : DEFAULT_ROUTE_PROFILE_TAB;
}

export function asCompareRouteName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const knownRoute = routeFromName(value)?.name;
  if (knownRoute !== undefined) return knownRoute;
  return value.trim().toUpperCase().replace(/\s+/g, "-") || fallback;
}
