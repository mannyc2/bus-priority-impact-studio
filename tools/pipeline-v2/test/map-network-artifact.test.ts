import { describe, expect, test } from "bun:test";
import type { LocalRouteBriefSummary, LocalRouteSegmentSpeed } from "@bp/db/local";
import { decodeStrict } from "@bp/domain/decode";
import {
  type MapRouteSegmentFeatureCollection,
  MapRouteSegmentFeatureCollectionSchema,
} from "@bp/domain/maps";
import { ReleaseIdentitySchema, releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import { buildNetworkMapFeatureCollection } from "../src/commands/map/artifacts";

const summary = {
  routeId: "M15+",
  month: "2026-03",
  routeScore: 42,
  publicVisible: true,
  publicVisibilityReason: "fixture",
  averageSpeedMph: 6.2,
  hotspotCount: 3,
  totalRidership: 90_000,
  totalTransfers: 0,
  aceActive: true,
  aceViolationCount: 0,
  busLaneMatchedLaneCount: 1,
  scheduleMatchRate: 1,
} satisfies LocalRouteBriefSummary;

function speedRow(input: Partial<LocalRouteSegmentSpeed> = {}): LocalRouteSegmentSpeed {
  return {
    routeId: "M15+",
    isoMonth: "2026-03",
    timestamp: "2026-03-01T08:00:00.000Z",
    dayOfWeek: "weekday",
    hourOfDay: 8,
    direction: "N",
    borough: "Manhattan",
    routeType: "SBS",
    stopOrder: 1,
    timepointStopId: "100",
    timepointStopName: "A",
    timepointStopLatitude: 40.7,
    timepointStopLongitude: -73.99,
    nextTimepointStopId: "200",
    nextTimepointStopName: "B",
    nextTimepointStopLatitude: 40.72,
    nextTimepointStopLongitude: -73.98,
    roadDistanceMiles: 1,
    averageTravelTimeMinutes: 10,
    averageRoadSpeedMph: 6,
    busTripCount: 1,
    ...input,
  };
}

function segmentPayload(): MapRouteSegmentFeatureCollection {
  const coordinates = Array.from({ length: 22 }, (_, index) => [
    -73.99 + index * 0.001,
    40.7 + index * 0.001,
  ]) as [number, number][];
  return decodeStrict(MapRouteSegmentFeatureCollectionSchema)({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "route-segment:M15+:2026-03:N:1:100:200",
        geometry: { type: "LineString", coordinates },
        properties: {
          segmentId: "N:1:100:200",
          sourceSegmentId: "N:1:100:200",
          studioSegmentId: "M15+:2026-03:N:1:100:200",
          spineSegmentId: null,
          spineJoinStatus: "not_built",
          routeId: "M15+",
          directionId: "0",
          month: "2026-03",
          hourOfDay: null,
          averageSpeedMph: 6,
          hotspotScore: 70,
          rankOnRoute: 1,
          startStopName: "A",
          endStopName: "B",
        },
      },
    ],
  });
}

describe("buildNetworkMapFeatureCollection", () => {
  test("builds one simplified citywide network feature per route", () => {
    const publishedAt = "2026-04-01T00:00:00.000Z";
    const releaseIdentity = decodeStrict(ReleaseIdentitySchema)({
      releaseId: releaseIdFromPublishedAt(publishedAt),
      publishedAt,
      coverage: { start: "2026-03", end: "2026-03" },
    });
    const collection = buildNetworkMapFeatureCollection({
      releaseIdentity,
      routes: [
        {
          routeId: "M15+",
          summary,
          speedRows: [
            speedRow({ averageRoadSpeedMph: 4, busTripCount: 1 }),
            speedRow({ averageRoadSpeedMph: 8, busTripCount: 3 }),
          ],
          segmentPayload: segmentPayload(),
        },
      ],
    });

    expect(collection.features).toHaveLength(1);
    expect(collection).toMatchObject({ schemaVersion: 2, ...releaseIdentity });
    const feature = collection.features[0];
    expect(feature?.properties).toMatchObject({
      routeId: "M15+",
      month: "2026-03",
      servedBoroughs: [],
      servedBoroughsStatus: "unavailable",
    });
    expect(feature?.properties.hourlySpeedMph).toHaveLength(24);
    expect(feature?.properties.hourlyTraversalCount).toHaveLength(24);
    expect(feature?.properties.hourlySpeedMph[8]).toBe(7);
    expect(feature?.properties.hourlyTraversalCount[8]).toBe(4);
    expect(feature?.properties.hourlySpeedMph[0]).toBeNull();
    expect(feature?.properties.hourlyTraversalCount[0]).toBe(0);
    expect(feature?.geometry.coordinates[0]?.[0]).toEqual([-73.99, 40.7]);
    expect(feature?.geometry.coordinates[0]?.at(-1)).toEqual([-73.969, 40.721]);
    expect(feature?.geometry.coordinates[0]?.length).toBeLessThan(22);
  });
});
