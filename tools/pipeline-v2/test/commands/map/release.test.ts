import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import { type MapReleaseDependencies, runMapRelease } from "../../../src/commands/map/release.ts";
import type { OpenLocalPipelineDb } from "../../../src/lib/local-db.ts";

describe("runMapRelease", () => {
  test("resolves an explicit local database path from the repository root", async () => {
    const source = await Bun.file(
      new URL("../../../src/commands/map/release.ts", import.meta.url),
    ).text();

    expect(source).toContain("dbPath: path(input.options.db)");
    expect(source).not.toContain("dbPath: input.options.db");
  });

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
          return {
            manifestPath: join(artifactRoot, "route-speed-spines", "manifest.json"),
            coverageStart: "2025-02",
          };
        },
        async verifyD1(input: unknown) {
          record("verifyD1", input);
          const releaseIdentity = (
            input as {
              releaseIdentity: {
                releaseId: string;
                publishedAt: string;
                coverage: { start: string | null; end: string };
              };
            }
          ).releaseIdentity;
          return {
            schemaPath,
            seedPath,
            status: "pass",
            ...releaseIdentity,
            coverage: { start: "2024-11", end: releaseIdentity.coverage.end },
          };
        },
        async context(input: unknown) {
          record("context", input);
          return { artifactPath: contextPath, sourcePath: contextSourcePath };
        },
        async studio(input: unknown) {
          record("studio", input);
          const releaseIdentity = (
            input as {
              releaseIdentity: {
                releaseId: string;
                publishedAt: string;
                coverage: { start: string | null; end: string };
              };
            }
          ).releaseIdentity;
          return {
            mapRouteFactsPath,
            outputPath: join(artifactRoot, "studio", "v1", "release.json"),
            releaseIdentity: {
              ...releaseIdentity,
              coverage: { start: "2025-01", end: releaseIdentity.coverage.end },
            },
          };
        },
        async map(input: unknown) {
          record("map", input);
          const releaseIdentity = (input as { releaseIdentity: Record<string, unknown> })
            .releaseIdentity;
          const manifestPath = join(artifactRoot, "map", "2026-04", "manifest.json");
          mkdirSync(join(artifactRoot, "map", "2026-04"), { recursive: true });
          await Bun.write(
            manifestPath,
            `${JSON.stringify(
              {
                schemaVersion: 2,
                artifactKind: "map_artifact_manifest",
                ...releaseIdentity,
                releaseProfile: "full",
                buildStatus: "pass",
                verificationStatus: "pass",
                routeFacts: {
                  status: "available",
                  artifactKey: "studio/v1/map-route-facts.json",
                  sha256: "a".repeat(64),
                  schemaVersion: 2,
                  ...releaseIdentity,
                  routeCount: 1,
                  byteLength: 1,
                  gzipByteLength: 1,
                },
                sources: [],
                layers: [],
                routeUniverse: {
                  includedRouteTypes: ["Local", "Limited", "SBS"],
                  excludedRouteTypes: ["Express", "School"],
                  expectedRouteIds: ["M1"],
                  geometryRouteIds: ["M1"],
                  routeSegmentRouteIds: ["M1"],
                  routeFactRouteIds: ["M1"],
                },
                status: "pass",
                artifactCount: 0,
                routeSegmentArtifactCount: 0,
                totalFeatureCount: 0,
                totalByteLength: 0,
                issueCount: 0,
                artifacts: [],
              },
              null,
              2,
            )}\n`,
          );
          return {
            manifestPath,
          };
        },
        async audit(input: unknown) {
          record("audit", input);
          expect(
            readdirSync(join(artifactRoot, "map", "2026-04")).filter(
              (name) => name.startsWith("manifest.") && name !== "manifest.json",
            ),
          ).toEqual([]);
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
      const mapReleaseIdentity = map?.["releaseIdentity"] as
        | { publishedAt: string; coverage: { start: string | null; end: string } }
        | undefined;
      expect(d1?.["releaseIdentity"]).toEqual(studio?.["releaseIdentity"]);
      expect(studio?.["releaseIdentity"]).toEqual(mapReleaseIdentity);
      expect(mapReleaseIdentity?.coverage).toEqual({ start: "2025-02", end: "2026-04" });
      expect(calls.find((call) => call.name === "speedSpines")?.input["generatedAt"]).toBe(
        mapReleaseIdentity?.publishedAt,
      );
      expect(result.d1.schemaPath).toBe(schemaPath);
      expect(result.d1.coverage.start as string | null).toBe("2024-11");
      expect(result.d1.coverage.end as string).toBe("2026-04");
      expect(result.studio.mapRouteFactsPath).toBe(mapRouteFactsPath);
      const studioResultIdentity = (
        result.studio as typeof result.studio & {
          releaseIdentity: { coverage: { start: string | null; end: string } };
        }
      ).releaseIdentity;
      expect(studioResultIdentity.coverage).toEqual({
        start: "2025-01",
        end: "2026-04",
      });
      expect(result.finalManifestKey).toMatch(/^map\/2026-04\/manifest\.[a-f0-9]{64}\.json$/);
      expect(existsSync(result.finalManifestPath)).toBe(true);
      expect(await Bun.file(result.registrationPath).text()).toContain(result.finalManifestKey);
      expect(await Bun.file(result.registrationPath).text()).toContain(
        result.releaseIdentity.releaseId,
      );
      expect(await Bun.file(result.registrationPath).text()).toContain(
        result.releaseIdentity.publishedAt,
      );
      expect(await Bun.file(result.registrationPath).text()).toContain("'2025-02'");
      expect(calls.filter((call) => call.name === "verifyD1")).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("keeps coverage start null when the built speed-spine evidence is empty", async () => {
    const observedIdentities: Array<{ coverage: { start: string | null; end: string } }> = [];
    const dependencies = {
      async routeBrief() {
        return { isoMonth: "2026-04" };
      },
      async speedSpines() {
        return { manifestPath: "unused.json", coverageStart: null };
      },
      async verifyD1(input: unknown) {
        observedIdentities.push(
          (input as { releaseIdentity: { coverage: { start: string | null; end: string } } })
            .releaseIdentity,
        );
        throw new Error("stop after identity capture");
      },
    } as unknown as MapReleaseDependencies;

    await expect(
      runMapRelease(
        {
          local: { path: "unused.sqlite" } as OpenLocalPipelineDb,
          year: 2026,
          month: 4,
          contextSourcePath: "unused.csv",
        },
        dependencies,
      ),
    ).rejects.toThrow("stop after identity capture");
    expect(observedIdentities[0]?.coverage).toEqual({ start: null, end: "2026-04" });
  });

  test("rejects a one-millisecond D1 publication identity skew", async () => {
    const dependencies = {
      async routeBrief() {
        return { isoMonth: "2026-04" };
      },
      async speedSpines() {
        return { manifestPath: "unused.json", coverageStart: null };
      },
      async verifyD1(input: unknown) {
        const releaseIdentity = (
          input as {
            releaseIdentity: {
              publishedAt: string;
              coverage: { start: string | null; end: string };
            };
          }
        ).releaseIdentity;
        const skewedPublishedAt = new Date(
          Date.parse(releaseIdentity.publishedAt) + 1,
        ).toISOString();
        return {
          schemaPath: "unused-schema.sql",
          seedPath: "unused-seed.sql",
          status: "pass",
          releaseId: releaseIdFromPublishedAt(skewedPublishedAt),
          publishedAt: skewedPublishedAt,
          coverage: releaseIdentity.coverage,
        };
      },
    } as unknown as MapReleaseDependencies;

    await expect(
      runMapRelease(
        {
          local: { path: "unused.sqlite" } as OpenLocalPipelineDb,
          year: 2026,
          month: 4,
          contextSourcePath: "unused.csv",
        },
        dependencies,
      ),
    ).rejects.toThrow("D1 export publication identity does not match the map release boundary");
  });
});
