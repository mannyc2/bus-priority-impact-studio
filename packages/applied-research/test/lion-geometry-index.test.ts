import { describe, expect, test } from "bun:test";
import { unwrapGeoJsonGeometry } from "../src/local-db";

describe("LION geometry index local DB builder", () => {
  test("unwraps GeoJSON Feature and FeatureCollection geometry payloads", () => {
    expect(
      unwrapGeoJsonGeometry(
        JSON.stringify({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [-73.9, 40.7],
              [-73.91, 40.71],
            ],
          },
          properties: { physicalId: "1" },
        }),
      ),
    ).toBe(
      JSON.stringify({
        type: "LineString",
        coordinates: [
          [-73.9, 40.7],
          [-73.91, 40.71],
        ],
      }),
    );

    expect(
      unwrapGeoJsonGeometry(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: [
                  [-73.8, 40.6],
                  [-73.81, 40.61],
                ],
              },
            },
          ],
        }),
      ),
    ).toBe(
      JSON.stringify({
        type: "LineString",
        coordinates: [
          [-73.8, 40.6],
          [-73.81, 40.61],
        ],
      }),
    );
  });

  test("keeps raw WKT and malformed JSON unchanged", () => {
    expect(unwrapGeoJsonGeometry("LINESTRING (-73.9 40.7, -73.91 40.71)")).toBe(
      "LINESTRING (-73.9 40.7, -73.91 40.71)",
    );
    expect(unwrapGeoJsonGeometry('{"type":"Feature"')).toBe('{"type":"Feature"');
  });
});
