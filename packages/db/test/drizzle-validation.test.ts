import { describe, expect, test } from "bun:test";
import {
  RouteBriefSummarySelectSchema,
  RouteScorecardCitationSelectSchema,
  RouteScorecardSelectSchema,
} from "../src/validation/d1.js";

describe("Drizzle D1 validation schemas", () => {
  test("validate Drizzle row shapes for compact serving tables", () => {
    expect(
      RouteScorecardSelectSchema.parse({
        routeId: "M1",
        month: "2026-03",
        routeScore: 16,
        coverageStatus: "full",
        averageSpeedMph: 6.7,
        hotspotCount: 10,
      }),
    ).toEqual(
      expect.objectContaining({
        routeId: "M1",
        routeScore: 16,
      }),
    );

    expect(
      RouteScorecardCitationSelectSchema.parse({
        routeId: "M1",
        month: "2026-03",
        citationRank: 1,
        sourceId: "mta_bus_route_segment_speeds",
        title: "MTA Bus Route Segment Speeds",
        url: "https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds/kufs-yh3x",
        verifiedAt: "2026-04-27T00:00:00.000Z",
      }),
    ).toEqual(
      expect.objectContaining({
        sourceId: "mta_bus_route_segment_speeds",
      }),
    );

    expect(
      RouteBriefSummarySelectSchema.parse({
        routeId: "M1",
        month: "2026-03",
        routeScore: 16,
        publicVisible: true,
        publicVisibilityReason: "standard_route",
        averageSpeedMph: 6.7,
        hotspotCount: 10,
        totalRidership: 1000,
        totalTransfers: 100,
        aceActive: false,
        aceViolationCount: 0,
        busLaneMatchedLaneCount: 2,
        scheduleMatchRate: 1,
      }),
    ).toEqual(
      expect.objectContaining({
        publicVisible: true,
      }),
    );
  });
});
