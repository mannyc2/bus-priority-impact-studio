import { describe, expect, test } from "bun:test";
import { geoSpeedColor, routeGeoMapModel } from "@/components/route/route-geo-map";

const BOX = { width: 1040, height: 420, padding: 44 };

function feature({
  id,
  directionId = "0" as const,
  coordinates,
  speed,
  start,
  end,
}: {
  id: string;
  directionId?: "0" | "1";
  coordinates: [number, number][];
  speed: number | null;
  start: string;
  end: string;
}) {
  return {
    type: "Feature" as const,
    id,
    geometry: { type: "LineString" as const, coordinates },
    properties: {
      segmentId: id,
      routeId: "M15+",
      directionId,
      month: "2026-03",
      hourOfDay: null,
      averageSpeedMph: speed,
      hotspotScore: 0,
      rankOnRoute: null,
      startStopName: start,
      endStopName: end,
    },
  };
}

// A simple two-segment north-south chain: A → B → C.
const chain = [
  feature({
    id: "seg-a",
    coordinates: [
      [-73.99, 40.7],
      [-73.99, 40.72],
    ],
    speed: 4.2,
    start: "A ST",
    end: "B ST",
  }),
  feature({
    id: "seg-b",
    coordinates: [
      [-73.99, 40.72],
      [-73.99, 40.74],
    ],
    speed: 7.5,
    start: "B ST",
    end: "C ST",
  }),
];

describe("routeGeoMapModel", () => {
  test("projects all segments into the padded viewBox and marks the slowest", () => {
    const model = routeGeoMapModel({ features: chain }, BOX);
    expect(model).not.toBeNull();
    expect(model?.segments).toHaveLength(2);
    expect(model?.segments.find((s) => s.id === "seg-a")?.slowest).toBe(true);
    expect(model?.segments.find((s) => s.id === "seg-b")?.slowest).toBe(false);
    expect(model?.slowest?.speedMph).toBe(4.2);

    for (const segment of model?.segments ?? []) {
      for (const [, x, y] of segment.d.matchAll(/[ML]([\d.]+),([\d.]+)/g)) {
        expect(Number(x)).toBeGreaterThanOrEqual(BOX.padding);
        expect(Number(x)).toBeLessThanOrEqual(BOX.width - BOX.padding);
        expect(Number(y)).toBeGreaterThanOrEqual(BOX.padding);
        expect(Number(y)).toBeLessThanOrEqual(BOX.height - BOX.padding);
      }
    }
  });

  test("finds the chain termini and labels them with stop names", () => {
    const model = routeGeoMapModel({ features: chain }, BOX);
    const labels = (model?.termini ?? []).map((t) => t.label).sort();
    expect(labels).toEqual(["A ST", "C ST"]);
  });

  test("prefers the direction with more segments", () => {
    const features = [
      ...chain,
      feature({
        id: "seg-rev",
        directionId: "1",
        coordinates: [
          [-73.99, 40.74],
          [-73.99, 40.7],
        ],
        speed: 6,
        start: "C ST",
        end: "A ST",
      }),
    ];
    const model = routeGeoMapModel({ features }, BOX);
    expect(model?.segments.map((s) => s.id)).toEqual(["seg-a", "seg-b"]);
  });

  test("returns null for an empty collection", () => {
    expect(routeGeoMapModel({ features: [] }, BOX)).toBeNull();
  });
});

describe("geoSpeedColor", () => {
  test("bands speeds and treats missing speed as neutral", () => {
    expect(geoSpeedColor(4.9)).toBe("var(--bp-color-bad)");
    expect(geoSpeedColor(5.5)).toBe("var(--bp-color-warn)");
    expect(geoSpeedColor(8)).toBe("var(--bp-color-good)");
    expect(geoSpeedColor(null)).toBe("var(--bp-color-ink-20)");
  });
});
