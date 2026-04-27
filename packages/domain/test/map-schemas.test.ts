import { describe, expect, test } from "bun:test";
import {
  MapRouteSegmentFeatureCollectionSchema,
  MapRouteSegmentFeatureSchema,
} from "../src/index.js";

describe("map route segment schemas", () => {
  test("accepts a strict route-segment feature collection", () => {
    const parsed = MapRouteSegmentFeatureCollectionSchema.parse({
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
  });

  test("rejects out-of-range coordinates", () => {
    const result = MapRouteSegmentFeatureSchema.safeParse({
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

    expect(result.success).toBe(false);
  });
});
