import type { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  buildRouteShapeMultiLineString,
  extractRouteShapeLineStrings,
  runBuildRouteShapeGeometryIndexFromShapes,
} from "../src/local-db";

describe("route shape geometry index local DB builder", () => {
  test("extracts line strings and builds filtered multiline GeoJSON", () => {
    expect(
      extractRouteShapeLineStrings({
        type: "LineString",
        coordinates: [
          [-73.99, 40.7],
          [-73.98, 40.71],
          ["bad", 40.72],
        ],
      }),
    ).toEqual([
      [
        [-73.99, 40.7],
        [-73.98, 40.71],
      ],
    ]);

    expect(
      extractRouteShapeLineStrings(
        JSON.stringify({
          type: "MultiLineString",
          coordinates: [
            [
              [-73.99, 40.7],
              [-73.98, 40.71],
            ],
            [[-73.97, 40.72]],
          ],
        }),
      ),
    ).toEqual([
      [
        [-73.99, 40.7],
        [-73.98, 40.71],
      ],
      [[-73.97, 40.72]],
    ]);

    expect(
      buildRouteShapeMultiLineString([
        [
          [-73.99, 40.7],
          [-73.98, 40.71],
        ],
        [[-73.97, 40.72]],
      ]),
    ).toBe(
      JSON.stringify({
        type: "MultiLineString",
        coordinates: [
          [
            [-73.99, 40.7],
            [-73.98, 40.71],
          ],
        ],
      }),
    );
  });

  test("groups normalized shapes and records skipped insert failures", () => {
    const insertedArgs: unknown[][] = [];
    const sqlite = {
      query() {
        return {
          get: () => ({ n: 1 }),
          all: () => [],
        };
      },
      exec() {
        throw new Error("geometry metadata should already be present");
      },
      prepare() {
        return {
          run: (...args: unknown[]) => {
            if (args[0] === "B2") throw new Error("insert failed");
            insertedArgs.push(args);
          },
        };
      },
    } as unknown as Database;

    const result = runBuildRouteShapeGeometryIndexFromShapes({
      local: { sqlite },
      builtAt: "2026-06-06T00:00:00.000Z",
      shapes: [
        {
          routeId: "B1",
          shapeId: "shape-a",
          directionId: "0",
          routeShortName: "B1",
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
        {
          routeId: "B1",
          shapeId: "shape-a",
          directionId: "0",
          routeShortName: "B1",
          geometry: {
            type: "LineString",
            coordinates: [
              [2, 2],
              [3, 3],
            ],
          },
        },
        {
          routeId: "B2",
          shapeId: "shape-b",
          directionId: "not-a-number",
          routeShortName: "B2",
          geometry: {
            type: "LineString",
            coordinates: [
              [4, 4],
              [5, 5],
            ],
          },
        },
        {
          routeId: "B3",
          shapeId: "shape-c",
          directionId: "1",
          routeShortName: "B3",
          geometry: "not json",
        },
      ],
    });

    expect(result).toEqual({ shapesRead: 4, inserted: 1, skipped: 1 });
    expect(insertedArgs).toHaveLength(1);
    expect(insertedArgs[0]?.slice(0, 5)).toEqual([
      "B1",
      "shape-a",
      0,
      "B1",
      "2026-06-06T00:00:00.000Z",
    ]);
    expect(JSON.parse(insertedArgs[0]?.[5] as string)).toEqual({
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
        [
          [2, 2],
          [3, 3],
        ],
      ],
    });
  });
});
