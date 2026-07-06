import { describe, expect, test } from "bun:test";
import type { MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import {
  boundsOf,
  formatMapHour,
  hourTag,
  routeAverageSpeedAtHour,
  segmentSpeedAtHour,
  speedToColor,
} from "../../src/components/route/maplibre-style";
import type { StudioRoute, StudioSegment } from "../../src/studio/api-contract";

function segment(input: Partial<StudioSegment> & Pick<StudioSegment, "id">): StudioSegment {
  const { id, ...rest } = input;
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
  test("maps segment speed through the six-anchor oklch ramp", () => {
    expect(speedToColor(3.3)).toBe("oklch(0.500 0.165 27.0)");
    expect(speedToColor(5.1)).toBe("oklch(0.585 0.143 48.0)");
    expect(speedToColor(9.5)).toBe("oklch(0.600 0.105 162.0)");
    expect(speedToColor(null)).toBe("rgba(16, 20, 24, 0.2)");
  });

  test("formats map hours and commute periods", () => {
    expect(formatMapHour(5)).toBe("5:00 AM");
    expect(formatMapHour(12)).toBe("12:00 PM");
    expect(formatMapHour(17)).toBe("5:00 PM");
    expect(hourTag(8)).toBe("AM peak");
    expect(hourTag(14)).toBe("Midday");
    expect(hourTag(17)).toBe("PM peak");
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
