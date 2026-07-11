import { describe, expect, test } from "bun:test";
import { decodeEitherStrict, decodeStrict } from "@bp/domain/decode";
import {
  MapRouteSegmentFeatureCollectionSchema,
  MapRouteSegmentFeatureSchema,
} from "@bp/domain/maps";
import { Result } from "effect";

describe("map route segment schemas", () => {
  test("accepts a strict route-segment feature collection", () => {
    const parsed = decodeStrict(MapRouteSegmentFeatureCollectionSchema)({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "M1-0-2026-01-01",
          geometry: {
            type: "LineString",
            coordinates: [
              [-73.9903, 40.7527],
              [-73.9738, 40.7616],
            ],
          },
          properties: {
            segmentId: "M1-0-2026-01-01",
            sourceSegmentId: "N:10:401001:401002",
            studioSegmentId: "M1:2026-01:N:10:401001:401002",
            spineSegmentId: "m1-n-node-001-node-002",
            spineJoinStatus: "matched",
            routeId: "M1",
            directionId: "0",
            month: "2026-01",
            hourOfDay: 8,
            averageSpeedMph: 5.8,
            hotspotScore: 88,
            rankOnRoute: 1,
            startStopName: "W 34 St / 5 Av",
            endStopName: "E 42 St / Madison Av",
          },
        },
      ],
    });

    expect(parsed.features).toHaveLength(1);
    expect(parsed.features[0]?.properties).toMatchObject({
      sourceSegmentId: "N:10:401001:401002",
      studioSegmentId: "M1:2026-01:N:10:401001:401002",
      spineSegmentId: "m1-n-node-001-node-002",
      spineJoinStatus: "matched",
    });
  });

  test("rejects out-of-range coordinates", () => {
    const result = decodeEitherStrict(MapRouteSegmentFeatureSchema)({
      type: "Feature",
      id: "bad-coordinate",
      geometry: {
        type: "LineString",
        coordinates: [
          [-73.9903, 40.7527],
          [-181, 40.7616],
        ],
      },
      properties: {
        segmentId: "bad-coordinate",
        sourceSegmentId: "N:10:401001:401002",
        studioSegmentId: "M1:2026-01:N:10:401001:401002",
        routeId: "M1",
        directionId: "0",
        month: "2026-01",
        hourOfDay: 8,
        averageSpeedMph: 5.8,
        hotspotScore: 88,
        rankOnRoute: 1,
        startStopName: "W 34 St / 5 Av",
        endStopName: "E 42 St / Madison Av",
      },
    });

    expect(Result.isFailure(result)).toBe(true);
  });
});
