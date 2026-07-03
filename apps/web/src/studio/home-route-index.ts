import type { StudioRoute } from "./api-contract.js";

export const ROUTE_INDEX_ALL_BOROUGHS = "All boroughs";

export const ROUTE_INDEX_BOROUGHS = [
  "Manhattan",
  "Brooklyn",
  "Bronx",
  "Queens",
  "Staten Island",
] as const;

export type RouteIndexBorough = (typeof ROUTE_INDEX_BOROUGHS)[number];

export type RouteIndexFilters = {
  borough: typeof ROUTE_INDEX_ALL_BOROUGHS | RouteIndexBorough;
  query: string;
};

export type RouteIndexGroup = {
  borough: RouteIndexBorough | "Other";
  routes: StudioRoute[];
};

export function orderRoutesForIndex(routes: readonly StudioRoute[]): StudioRoute[] {
  return [...routes].sort((left, right) => {
    const riderDelta = right.dailyRiders - left.dailyRiders;
    if (riderDelta !== 0) return riderDelta;

    const labelDelta = left.label.localeCompare(right.label, "en-US", { numeric: true });
    if (labelDelta !== 0) return labelDelta;

    return left.slug.localeCompare(right.slug, "en-US", { numeric: true });
  });
}

export function filterRoutesForIndex(
  routes: readonly StudioRoute[],
  filters: RouteIndexFilters,
): StudioRoute[] {
  const tokens = filters.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  return routes.filter((route) => {
    if (filters.borough !== ROUTE_INDEX_ALL_BOROUGHS && !route.borough.includes(filters.borough)) {
      return false;
    }

    if (tokens.length === 0) return true;

    const haystack = [route.label, route.routeId, route.corridor, route.corridorFull, route.borough]
      .join(" ")
      .toLowerCase();

    return tokens.every((token) => haystack.includes(token));
  });
}

export function groupRoutesForIndex(routes: readonly StudioRoute[]): RouteIndexGroup[] {
  const groups = new Map<RouteIndexBorough | "Other", StudioRoute[]>();
  for (const borough of ROUTE_INDEX_BOROUGHS) {
    groups.set(borough, []);
  }
  groups.set("Other", []);

  for (const route of routes) {
    const borough =
      ROUTE_INDEX_BOROUGHS.find((candidate) => route.borough.includes(candidate)) ?? "Other";
    groups.get(borough)?.push(route);
  }

  return [...groups.entries()]
    .filter(([, groupRoutes]) => groupRoutes.length > 0)
    .map(([borough, groupRoutes]) => ({ borough, routes: groupRoutes }));
}
