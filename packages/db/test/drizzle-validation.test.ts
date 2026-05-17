import { describe, expect, test } from "bun:test";
import {
  CorridorArtifactSelectSchema,
  CorridorInterventionContextSelectSchema,
  RouteArtifactSelectSchema,
  RouteBriefSummarySelectSchema,
  RouteScorecardCitationSelectSchema,
  RouteScorecardSelectSchema,
} from "../src/d1/validation.js";

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
      RouteArtifactSelectSchema.parse({
        routeId: "M1",
        month: "2026-03",
        artifactName: "brief.json",
        artifactKey: "briefs/routes/m1/2026-03/brief.json",
        contentType: "application/json",
        byteLength: 100,
        sha256: "a".repeat(64),
      }),
    ).toEqual(
      expect.objectContaining({
        artifactName: "brief.json",
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

    expect(
      CorridorArtifactSelectSchema.parse({
        corridorId: "street:broadway",
        month: "2026-03",
        artifactName: "brief.md",
        artifactKey: "briefs/corridors/street-broadway/2026-03/brief.md",
        contentType: "text/markdown; charset=utf-8",
        byteLength: 100,
        sha256: "b".repeat(64),
      }),
    ).toEqual(
      expect.objectContaining({
        corridorId: "street:broadway",
      }),
    );

    expect(
      CorridorInterventionContextSelectSchema.parse({
        corridorId: "street:broadway",
        month: "2026-03",
        contextRank: 1,
        routeId: "M1",
        eventId: "ace:M1:ACE:2026-01-15",
        interventionType: "automated_bus_lane_enforcement",
        sourceId: "mta_ace_routes",
        program: "ACE",
        implementationMonth: "2026-01",
        eventStatus: "implemented",
        evaluationLevel: "peer_adjusted_before_after",
        comparisonStatus: "evaluated",
        speedDeltaMph: 2,
        adjustedSpeedDeltaMph: 1.5,
        ridershipDelta: 400,
        adjustedRidershipDelta: 300,
        comparisonRouteCount: 1,
        caveat: "Peer-adjusted before/after using one comparison route.",
      }),
    ).toEqual(
      expect.objectContaining({
        eventId: "ace:M1:ACE:2026-01-15",
      }),
    );
  });
});
