import { describe, expect, test } from "bun:test";
import type { MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import { Color, validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import {
  boundsOf,
  MAP_COLORS,
  mapBaseStyle,
  NYC_MAP_BOUNDS,
  routeAverageSpeedAtHour,
  scaledMapColor,
  segmentSpeedAtHour,
  speedToColor,
} from "../../src/components/route/maplibre-style";
import type { StudioRoute, StudioSegment } from "../../src/studio/api-contract";

function segment(input: Partial<StudioSegment> & Pick<StudioSegment, "id">): StudioSegment {
  const { id, spineJoinStatus = "not_built", spineSegmentId = null, ...rest } = input;
  return {
    id,
    routeSlug: "b48",
    direction: "NB",
    from: "A",
    to: "B",
    speedMph: 6.4,
    scheduledMph: 10,
    riderHours: 100,
    lane: "none",
    ace: false,
    tsp: false,
    hours: [],
    ...rest,
    spineSegmentId,
    spineJoinStatus,
  };
}

function hourlySeverity(hour: number, severity: number): number[] {
  const hours = Array.from({ length: 24 }, () => 0);
  hours[hour] = severity;
  return hours;
}

const route = {
  slug: "b48",
  routeId: "B48",
  label: "B48",
  corridor: "Lorimer / Franklin",
  corridorFull: "Lorimer Street / Franklin Avenue",
  borough: "Brooklyn",
  sbs: false,
  speedMph: 7.1,
  scheduledMph: 8.2,
  weightedAvgSpeed: 7.1,
  speedPercentile: 42,
  dailyRiders: 9800,
  ridersYoyPct: 1.2,
  riderHoursLost: 64,
  laneCoverage: 0,
  aceStatus: "none",
  aceSince: null,
  tspCoverage: "none",
  reliability: "Building",
  observedReliability: null,
  diagnosis: "B48 has a focused route dossier.",
  spark: [7.0, 7.1],
  termini: { north: "Greenpoint", south: "Prospect Park" },
  miles: 6.1,
  stops: 32,
  flags: [],
  peerSlug: null,
  interventions: [],
  movement6mPct: null,
  context12mPct: null,
} satisfies StudioRoute;

describe("maplibre route style helpers", () => {
  test("maps segment speed through the six-anchor sRGB ramp", () => {
    expect(speedToColor(3.3)).toBe("#ae2e2a");
    expect(speedToColor(5.1)).toBe("#bd5c24");
    expect(speedToColor(9.5)).toBe("#3a946d");
    expect(speedToColor(null)).toBe("rgba(16, 20, 24, 0.2)");
  });

  test("uses MapLibre-valid colors and a valid shared base style", () => {
    const generatedColors = [
      ...[3.3, 4.6, 5.6, 6.6, 7.8, 9.5].map(speedToColor),
      ...(["lanes", "riders"] as const).flatMap((scale) =>
        [0, 50, 100].map((value) => scaledMapColor(value, 0, 100, scale)),
      ),
    ];

    for (const color of [...Object.values(MAP_COLORS), ...generatedColors]) {
      expect(Color.parse(color)).toBeDefined();
    }
    expect(validateStyleMin(mapBaseStyle())).toEqual([]);
    expect(scaledMapColor(50, 0, 100, "lanes")).toBe("#4c9f71");
    expect(scaledMapColor(50, 0, 100, "riders")).toBe("#5790c8");
  });

  test("exports a pan fence much wider than the route network", () => {
    expect(NYC_MAP_BOUNDS).toEqual([
      [-74.8, 40.15],
      [-73.15, 41.2],
    ]);
    // MapLibre constrains the whole viewport inside maxBounds, so a fence
    // close to the network extent (-74.25..-73.70, 40.50..40.93) locks
    // panning at citywide zooms.
    const [[west, south], [east, north]] = NYC_MAP_BOUNDS;
    expect(east - west).toBeGreaterThan(1.5);
    expect(north - south).toBeGreaterThan(1);
  });

  test("derives hourly speeds and weighted route averages from segment severity", () => {
    const slow = segment({ id: "slow", hours: hourlySeverity(17, 0.75), riderHours: 300 });
    const steady = segment({
      id: "steady",
      scheduledMph: 8,
      hours: hourlySeverity(17, 0.25),
      riderHours: 100,
    });

    expect(segmentSpeedAtHour(slow, 17)).toBeCloseTo(6.85);
    expect(segmentSpeedAtHour(steady, 17)).toBeCloseTo(6.95);
    expect(routeAverageSpeedAtHour(route, [slow, steady], 17)).toBeCloseTo(6.875);
    expect(segmentSpeedAtHour({ ...slow, scheduledMph: null }, 17)).toBeNull();
    expect(
      routeAverageSpeedAtHour({ ...route, scheduledMph: null }, [slow, steady], 17),
    ).toBeNull();
  });

  test("computes lon-lat bounds across route segment features", () => {
    const collection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "one",
          geometry: {
            type: "LineString",
            coordinates: [
              [-73.99, 40.7],
              [-73.95, 40.72],
            ],
          },
          properties: {
            segmentId: "one",
            routeId: "B48",
            directionId: "0",
            month: "2026-03",
            hourOfDay: null,
            averageSpeedMph: 6,
            hotspotScore: 50,
            rankOnRoute: 1,
            startStopName: "A",
            endStopName: "B",
          },
        },
      ],
    } as unknown as MapRouteSegmentFeatureCollection;

    expect(boundsOf(collection)).toEqual([
      [-73.99, 40.7],
      [-73.95, 40.72],
    ]);
  });
});
