import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type MapReleaseDependencies, runMapRelease } from "../../../src/commands/map/release.ts";
import type { OpenLocalPipelineDb } from "../../../src/lib/local-db.ts";

describe("runMapRelease", () => {
  test("uses one custom root and orders D1 before Studio before map", async () => {
    const root = mkdtempSync(join(tmpdir(), "map-release-"));
    try {
      const artifactRoot = join(root, "artifacts");
      const exportRoot = join(root, "exports");
      const localDbPath = join(root, "local", "pipeline.sqlite");
      const contextSourcePath = join(root, "sources", "boroughs.csv");
      const routeShapeSnapshotPath = join(root, "sources", "routes.json");
      const stopSnapshotPath = join(root, "sources", "stops.json");
      const busLaneSnapshotPath = join(root, "sources", "lanes.json");
      const schemaPath = join(exportRoot, "d1", "2026-04", "schema.sql");
      const seedPath = join(exportRoot, "d1", "2026-04", "seed.sql");
      const contextPath = join(artifactRoot, "map", "context", "nyc-boroughs.min.geojson");
      const mapRouteFactsPath = join(artifactRoot, "studio", "v1", "map-route-facts.json");
      const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
      const record = (name: string, input: unknown) => {
        calls.push({ name, input: input as Record<string, unknown> });
      };
      const dependencies = {
        async routeBrief(input: unknown) {
          record("routeBrief", input);
          return { isoMonth: "2026-04" };
        },
        async speedSpines(input: unknown) {
          record("speedSpines", input);
          return { manifestPath: join(artifactRoot, "route-speed-spines", "manifest.json") };
        },
        async verifyD1(input: unknown) {
          record("verifyD1", input);
          return { schemaPath, seedPath, status: "pass" };
        },
        async context(input: unknown) {
          record("context", input);
          return { artifactPath: contextPath, sourcePath: contextSourcePath };
        },
        async studio(input: unknown) {
          record("studio", input);
          return {
            mapRouteFactsPath,
            outputPath: join(artifactRoot, "studio", "v1", "release.json"),
          };
        },
        async map(input: unknown) {
          record("map", input);
          return { manifestPath: join(artifactRoot, "map", "2026-04", "manifest.json") };
        },
        async audit(input: unknown) {
          record("audit", input);
          return { status: "pass", issueCount: 0, issues: [] };
        },
      } as unknown as MapReleaseDependencies;

      const result = await runMapRelease(
        {
          local: { path: localDbPath } as OpenLocalPipelineDb,
          year: 2026,
          month: 4,
          contextSourcePath,
          artifactRoot,
          exportRoot,
          spineStartMonth: "2025-01",
          routeShapeSnapshotPath,
          stopSnapshotPath,
          busLaneSnapshotPath,
          routeSliceRawRoot: join(root, "sources", "route-slices"),
          tspSourcePath: join(root, "sources", "tsp.json"),
          documentChunksPath: join(root, "sources", "documents.jsonl"),
          manualInterventionsPath: join(root, "sources", "manual.json"),
        },
        dependencies,
      );

      expect(calls.map((call) => call.name)).toEqual([
        "routeBrief",
        "speedSpines",
        "verifyD1",
        "context",
        "studio",
        "map",
        "audit",
      ]);
      const d1 = calls.find((call) => call.name === "verifyD1")?.input;
      const studio = calls.find((call) => call.name === "studio")?.input;
      const map = calls.find((call) => call.name === "map")?.input;
      expect(d1).toMatchObject({ artifactRoot, exportRoot });
      expect(studio).toMatchObject({
        schemaPath,
        seedPath,
        localDbPath,
        routeSliceArtifactsRoot: join(artifactRoot, "route-slices"),
        speedSpineRoot: artifactRoot,
        routeShapeSnapshotPath,
        stopSnapshotPath,
        profile: "full",
      });
      expect(map).toMatchObject({
        artifactRoot,
        speedSpineRoot: artifactRoot,
        routeShapeSnapshotPath,
        stopSnapshotPath,
        busLaneSnapshotPath,
        contextPath,
        contextSourcePath,
        routeFactsPath: mapRouteFactsPath,
        releaseProfile: "full",
      });
      expect(result.d1.schemaPath).toBe(schemaPath);
      expect(result.studio.mapRouteFactsPath).toBe(mapRouteFactsPath);
      expect(calls.filter((call) => call.name === "verifyD1")).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
