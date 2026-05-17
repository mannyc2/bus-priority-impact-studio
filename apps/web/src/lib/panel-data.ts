import { type RouteData, routes } from "../fixtures/routes.js";
import {
  bunchingPercent,
  fetchHotspots,
  fetchRouteCompare,
  fetchRouteList,
  fetchRouteProfile,
  gradeFromScore,
  routeDisplayName,
} from "./api-client.js";
import { type HotspotFilter, routeFromName, routeFromUrlId } from "./route-url.js";

export type HotspotsData = {
  filter: HotspotFilter;
  routes: readonly RouteData[];
};

export type RouteProfileData = RouteData;

export type CompareData = {
  routeA: RouteData;
  routeB: RouteData;
};

export type DigestMiniRoute = {
  name: string;
  trend: number;
};

export type DigestData = {
  miniRoutes: readonly DigestMiniRoute[];
};

const MY_ROUTES = new Set(["B46", "Q58", "B44"]);

const DIGEST_MINI_ROUTES: readonly DigestMiniRoute[] = [
  { name: "B46", trend: 5 },
  { name: "Q58", trend: -2 },
  { name: "B44", trend: 8 },
];

export async function loadHotspotsData(filter: HotspotFilter): Promise<HotspotsData> {
  try {
    const [hotspots, routeList] = await Promise.all([fetchHotspots(75), fetchRouteList(250)]);
    const routeCardsById = new Map(routeList.routes.map((route) => [route.routeId, route]));
    const seen = new Set<string>();
    const apiRoutes = hotspots.hotspots.flatMap((hotspot) => {
      if (seen.has(hotspot.routeId)) return [];
      seen.add(hotspot.routeId);
      const card = routeCardsById.get(hotspot.routeId);
      if (card === undefined) return [];
      return [
        toRouteData({
          routeId: card.routeId,
          routeScore: card.routeScore,
          averageSpeedMph: hotspot.averageSpeedMph,
          corridor: hotspot.corridorName,
          bunching: bunchingPercent(card),
          totalRidership: card.totalRidership,
          hotspotCount: card.hotspotCount,
          busLaneMatchedLaneCount: card.busLaneMatchedLaneCount,
        }),
      ];
    });
    return {
      filter,
      routes: filterApiRoutes(
        filter,
        apiRoutes.length > 0 ? apiRoutes : routeList.routes.map(toRouteData),
      ),
    };
  } catch {
    return {
      filter,
      routes: filterRoutes(filter),
    };
  }
}

export async function loadRouteProfileData(routeId: string): Promise<RouteProfileData> {
  try {
    const profile = await fetchRouteProfile(routeId);
    return toRouteData({
      routeId: profile.route.routeId,
      routeScore: profile.route.routeScore,
      averageSpeedMph: profile.route.averageSpeedMph,
      corridor: profile.peakRidership?.dayOfWeek ?? "Generated route profile",
      bunching: bunchingPercent(profile.route),
      totalRidership: profile.route.totalRidership,
      hotspotCount: profile.route.hotspotCount,
      busLaneMatchedLaneCount: profile.route.busLaneMatchedLaneCount,
    });
  } catch {
    const route = routeFromUrlId(routeId);
    if (route === null) {
      throw new Error(`Route ${routeId} was not found.`);
    }

    return route;
  }
}

export async function loadCompareData(a: string, b: string): Promise<CompareData> {
  try {
    const comparison = await fetchRouteCompare(a, b);
    return {
      routeA: toRouteData(comparison.routes[0]),
      routeB: toRouteData(comparison.routes[1]),
    };
  } catch {
    const routeA = routeFromName(a);
    const routeB = routeFromName(b);

    if (routeA === null || routeB === null) {
      throw new Error("One or more comparison routes were not found.");
    }

    return { routeA, routeB };
  }
}

export function loadDigestData(): DigestData {
  return {
    miniRoutes: DIGEST_MINI_ROUTES,
  };
}

function filterRoutes(filter: HotspotFilter): readonly RouteData[] {
  switch (filter) {
    case "slow":
      return routes.filter((route) => route.speed < 6);
    case "bunching":
      return routes.filter((route) => route.bunching > 20);
    case "my":
      return routes.filter((route) => MY_ROUTES.has(route.name));
    default:
      return routes;
  }
}

function filterApiRoutes(filter: HotspotFilter, input: readonly RouteData[]): readonly RouteData[] {
  switch (filter) {
    case "slow":
      return input.filter((route) => route.speed < 6);
    case "bunching":
      return input.filter((route) => route.bunching > 20);
    case "my":
      return input.filter((route) => MY_ROUTES.has(route.name.replace(" SBS", "")));
    default:
      return input;
  }
}

function toRouteData(input: {
  routeId: string;
  routeScore: number;
  averageSpeedMph: number;
  corridor?: string;
  observedBunchingShare?: number | null;
  bunching?: number;
  totalRidership: number;
  hotspotCount: number;
  busLaneMatchedLaneCount: number;
}): RouteData {
  return {
    name: routeDisplayName(input.routeId),
    corridor: input.corridor ?? "NYC bus route",
    borough: "NYC",
    type: input.routeId.includes("SBS") || input.routeId.includes("+") ? "SBS" : "Route",
    grade: gradeFromScore(input.routeScore),
    speed: Number(input.averageSpeedMph.toFixed(1)),
    cityAvg: 7.8,
    bunching: input.bunching ?? Math.round((input.observedBunchingShare ?? 0) * 100),
    trend: 0,
    followers: Math.round(input.totalRidership),
    reports: input.hotspotCount + input.busLaneMatchedLaneCount,
  };
}
