import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import { MapContextFeatureCollectionSchema } from "@bp/domain/maps";
import { servedBoroughsByRoute } from "../src/commands/map/artifacts";
import { pointInPolygon, runMapContext } from "../src/commands/map/context";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("map borough context", () => {
  test("pins the source revision and places the label outside polygon holes", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-map-context-"));
    tempRoots.push(root);
    const sourcePath = join(root, "boroughs.csv");
    const artifactRoot = join(root, "artifacts");
    const csv = [
      "BoroName,the_geom",
      'Queens,"MULTIPOLYGON (((0 0, 8 0, 8 2, 3 2, 3 8, 0 8, 0 0), (1 1, 2 1, 2 2, 1 2, 1 1)), ((10 10, 11 10, 11 11, 10 11, 10 10)))"',
    ].join("\n");
    await Bun.write(sourcePath, csv);

    const result = await runMapContext({
      sourcePath,
      artifactRoot,
      toleranceDegrees: 0,
      minRingArea: 0,
    });
    const context = decodeStrict(MapContextFeatureCollectionSchema)(
      JSON.parse(await readFile(result.artifactPath, "utf8")),
    );
    const feature = context.features[0];
    expect(feature?.properties.boroName).toBe("Queens");
    expect(context.sourceRevision.sha256).toBe(result.sourceSha256);
    expect(
      pointInPolygon(
        feature?.properties.labelPoint ?? [0, 0],
        feature?.geometry.coordinates[0] ?? [],
      ),
    ).toBe(true);

    const changedSourcePath = join(root, "boroughs-changed.csv");
    await Bun.write(changedSourcePath, `${csv}\n`);
    const changed = await runMapContext({
      sourcePath: changedSourcePath,
      artifactRoot: join(root, "changed-artifacts"),
      toleranceDegrees: 0,
      minRingArea: 0,
    });
    expect(changed.sourceSha256).not.toBe(result.sourceSha256);
  });

  test("assigns a cross-borough route from current stop coordinates", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-map-borough-membership-"));
    tempRoots.push(root);
    const contextPath = join(root, "context.json");
    await Bun.write(
      contextPath,
      JSON.stringify({
        type: "FeatureCollection",
        sourceRevision: {
          sourceId: "nyc_borough_boundaries",
          sha256: "a".repeat(64),
          currencyPolicy: "revision_pinned",
        },
        features: [
          {
            type: "Feature",
            properties: { boroName: "Manhattan", labelPoint: [-73.98, 40.76] },
            geometry: {
              type: "MultiPolygon",
              coordinates: [
                [
                  [
                    [-74.02, 40.7],
                    [-73.96, 40.7],
                    [-73.96, 40.82],
                    [-74.02, 40.7],
                  ],
                ],
              ],
            },
          },
          {
            type: "Feature",
            properties: { boroName: "Queens", labelPoint: [-73.9, 40.76] },
            geometry: {
              type: "MultiPolygon",
              coordinates: [
                [
                  [
                    [-73.95, 40.7],
                    [-73.85, 40.7],
                    [-73.85, 40.82],
                    [-73.95, 40.7],
                  ],
                ],
              ],
            },
          },
        ],
      }),
    );
    const stop = (longitude: number, stopId: string) => ({
      schemaVersion: 1 as const,
      routeId: "M60+",
      routeShortName: "M60 SBS",
      stopId,
      stopName: stopId,
      inEffect: true,
      directionId: "0",
      direction: "E",
      timepoint: true,
      latitude: 40.72,
      longitude,
    });
    const memberships = await servedBoroughsByRoute({
      contextPath,
      stops: [stop(-73.99, "manhattan"), stop(-73.9, "queens")],
    });
    expect(memberships?.get("M60+")).toEqual(["Manhattan", "Queens"]);
  });
});
