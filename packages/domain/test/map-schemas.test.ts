import { describe, expect, test } from "bun:test";
import { decodeEitherStrict, decodeStrict } from "@bp/domain/decode";
import {
  MapBusLaneFeatureCollectionSchema,
  MapContextFeatureCollectionSchema,
  MapLayerStatusSchema,
  MapNetworkFeatureCollectionSchema,
  MapRouteFactsResponseSchema,
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

describe("truthful network map schemas", () => {
  const emptyHours = Array.from({ length: 24 }, () => null);
  const emptyTraversals = Array.from({ length: 24 }, () => 0);

  test("accepts null hourly evidence and verified multi-borough membership", () => {
    const parsed = decodeStrict(MapNetworkFeatureCollectionSchema)({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [
                [-73.99, 40.75],
                [-73.95, 40.77],
              ],
            ],
          },
          properties: {
            routeId: "M60+",
            month: "2026-03",
            hourlySpeedMph: emptyHours,
            hourlyTraversalCount: emptyTraversals,
            servedBoroughs: ["Manhattan", "Queens"],
            servedBoroughsStatus: "verified",
          },
        },
      ],
    });

    expect(parsed.features[0]?.properties.servedBoroughs).toEqual(["Manhattan", "Queens"]);
  });

  test("rejects wrong hour lengths, duplicate boroughs, and speed without traversals", () => {
    const base = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [
                [-73.99, 40.75],
                [-73.95, 40.77],
              ],
            ],
          },
          properties: {
            routeId: "M60+",
            month: "2026-03",
            hourlySpeedMph: [...emptyHours],
            hourlyTraversalCount: [...emptyTraversals],
            servedBoroughs: ["Queens"],
            servedBoroughsStatus: "verified",
          },
        },
      ],
    };
    expect(
      Result.isFailure(
        decodeEitherStrict(MapNetworkFeatureCollectionSchema)({
          ...base,
          features: [
            {
              ...base.features[0],
              properties: { ...base.features[0]?.properties, hourlySpeedMph: [null] },
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      Result.isFailure(
        decodeEitherStrict(MapNetworkFeatureCollectionSchema)({
          ...base,
          features: [
            {
              ...base.features[0],
              properties: {
                ...base.features[0]?.properties,
                servedBoroughs: ["Queens", "Queens"],
              },
            },
          ],
        }),
      ),
    ).toBe(true);
    const speeds: Array<number | null> = [...emptyHours];
    speeds[8] = 7;
    expect(
      Result.isFailure(
        decodeEitherStrict(MapNetworkFeatureCollectionSchema)({
          ...base,
          features: [
            {
              ...base.features[0],
              properties: { ...base.features[0]?.properties, hourlySpeedMph: speeds },
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  test("rejects context without a borough label and malformed lane geometry", () => {
    expect(
      Result.isFailure(
        decodeEitherStrict(MapContextFeatureCollectionSchema)({
          type: "FeatureCollection",
          sourceRevision: {
            sourceId: "nyc_borough_boundaries",
            sha256: "a".repeat(64),
            currencyPolicy: "revision_pinned",
          },
          features: [
            {
              type: "Feature",
              properties: { labelPoint: [-73.9, 40.7] },
              geometry: {
                type: "MultiPolygon",
                coordinates: [
                  [
                    [
                      [-74, 40.7],
                      [-73.9, 40.7],
                      [-73.9, 40.8],
                      [-74, 40.7],
                    ],
                  ],
                ],
              },
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      Result.isFailure(
        decodeEitherStrict(MapBusLaneFeatureCollectionSchema)({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [-73.9, 40.7] },
              properties: {
                segmentId: "lane-1",
                street: "1 Av",
                borough: "Manhattan",
                facility: "Curbside",
                laneType: null,
                openDate: null,
              },
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  test("rejects attempts to downgrade a fixed P0 map layer", () => {
    expect(
      Result.isFailure(
        decodeEitherStrict(MapLayerStatusSchema)({
          layerId: "network_simplified",
          priority: "p1",
          requiredForFull: false,
          readiness: "available",
          currencyStatus: "period_aligned",
          currency: {
            policy: "analysis_period",
            baselineMonth: "2026-03",
            coveragePassed: true,
          },
          sourceIds: ["mta_bus_segment_speeds"],
          artifactKey: "map/2026-03/network-simplified.geojson",
          featureCount: 1,
          routeCount: 1,
          reason: "Invalid downgrade fixture.",
        }),
      ),
    ).toBe(true);
  });

  test("rejects contradictory route-fact evidence", () => {
    const result = decodeEitherStrict(MapRouteFactsResponseSchema)({
      schemaVersion: 1,
      baselineMonth: "2026-03",
      generatedAt: "2026-04-01T00:00:00Z",
      routes: [
        {
          route: {
            routeId: "M1",
            slug: "m1",
            label: "M1",
            corridor: "Fifth Avenue",
            borough: "Manhattan",
            sbs: false,
            speedMph: 7.2,
            dailyRiders: 10000,
            reliability: "Mixed",
            movement6mPct: null,
          },
          delayExposure: {
            valueRiderHours: 100,
            status: "unavailable",
            analysisPeriod: null,
            grain: null,
            source: null,
            segmentCount: 0,
            ridershipDenominator: null,
            serviceDayRidershipCoverage: "not_available",
            hourlyPassengerDelayCoverage: "not_available",
            unavailableReason: "Missing hourly ridership.",
          },
          provenance: {
            lane: {
              status: "unavailable",
              valuePct: null,
              method: null,
              sourceId: null,
              unavailableReason: "Lane snapshot unavailable.",
            },
            ace: {
              status: "unknown",
              grain: "route_month",
              sourceId: null,
              sourceAsOf: null,
              sourceStatus: "unavailable",
              unavailableReason: "ACE source unavailable.",
            },
            tsp: {
              status: "unknown",
              grain: "route_or_corridor",
              sourceId: null,
              sourceDate: null,
              corridor: null,
              matchMethod: "unavailable",
            },
          },
        },
      ],
    });
    expect(Result.isFailure(result)).toBe(true);
  });
});
