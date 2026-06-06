import { type RouteScorecard, RouteScorecardSchema } from "@bp/domain/routes";

export const routeScorecardFixtures: readonly RouteScorecard[] = [
  RouteScorecardSchema.parse({
    schemaVersion: 1,
    routeId: "B46-SBS",
    month: "2026-03",
    routeScore: 38,
    coverageStatus: "full",
    averageSpeedMph: 6.4,
    hotspotCount: 9,
    citations: [
      {
        sourceId: "mta_bus_route_segment_speeds",
        title: "MTA Bus Route Segment Speeds",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds/",
        verifiedAt: "2026-04-27T00:00:00.000Z",
      },
    ],
  }),
  RouteScorecardSchema.parse({
    schemaVersion: 1,
    routeId: "M15-SBS",
    month: "2026-03",
    routeScore: 54,
    coverageStatus: "full",
    averageSpeedMph: 7.8,
    hotspotCount: 6,
    citations: [
      {
        sourceId: "mta_ace_routes",
        title: "MTA Bus Automated Camera Enforced Routes",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Automated-Camera-Enforced-Routes-Beginning/",
        verifiedAt: "2026-04-27T00:00:00.000Z",
      },
    ],
  }),
];
