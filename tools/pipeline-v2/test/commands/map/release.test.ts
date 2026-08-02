import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plan097FreshnessMatrix } from "@bp/db/recovery/plan097";
import { releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import {
  buildVerifiedMapRouteBatchProjection,
  exactServingRouteIdsFromD1,
  type MapReleaseDependencies,
  runMapRelease,
} from "../../../src/commands/map/release.ts";
import type { OpenLocalPipelineDb } from "../../../src/lib/local-db.ts";

function readyFreshnessMatrix(month: string): Plan097FreshnessMatrix {
  const sources = [
    ["bus_segment_speeds_2025", "month", "source_complete_probe", month],
    ["bus_hourly_ridership_2025", "month", "latest_closed_upstream_month", month],
    ["bus_wait_assessment", "month", "latest_closed_upstream_month", month],
    ["ace_violations", "month", "latest_closed_upstream_month", month],
    ["ace_routes", "snapshot", "atomic_snapshot", `snapshot:${"1".repeat(64)}`],
    [
      "nyc_dot_bus_lanes_local_streets",
      "snapshot",
      "atomic_snapshot",
      `snapshot:${"2".repeat(64)}`,
    ],
    ["bus_time_gtfsrt_vehicle_positions", "realtime", "preserved_current_signal", "2026-04-30"],
  ] as const;
  return {
    artifactKind: "bp.ops.plan097.freshness-matrix.v1",
    schemaVersion: 1,
    checkedAt: "2026-07-22T12:00:00.000Z",
    status: "ready",
    candidateCompatibilityCoverageEnd: month,
    datasets: sources.map(([sourceId, grain, selectionBasis, partition]) => ({
      sourceId,
      grain,
      selectionBasis,
      upstreamLatest: grain === "month" ? month : null,
      selectedCompletePartition: partition,
      ingestedLatest: partition,
      evidence: {
        sourceId,
        partition,
        rowCount: 1,
        routeCount: grain === "month" ? 1 : null,
        rowsSha256: "a".repeat(64),
        sourceSnapshotSha256: grain === "snapshot" ? "b".repeat(64) : null,
      },
      status: "ready",
      reasons: [],
    })),
  };
}

describe("runMapRelease", () => {
  test("derives the exact serving universe from trip-type rows", async () => {
    const root = mkdtempSync(join(tmpdir(), "map-release-exact-routes-"));
    try {
      const schemaPath = join(root, "schema.sql");
      const seedPath = join(root, "seed.sql");
      await Promise.all([
        Bun.write(
          schemaPath,
          "CREATE TABLE route_catalog_trip_type (route_id TEXT, trip_type_rank INTEGER, trip_type TEXT);",
        ),
        Bun.write(
          seedPath,
          "INSERT INTO route_catalog_trip_type VALUES ('M2', 1, '1'); INSERT INTO route_catalog_trip_type VALUES ('M1', 1, '1');",
        ),
      ]);

      await expect(
        exactServingRouteIdsFromD1({ schemaPath, seedPath, expectedCount: 2 }),
      ).resolves.toEqual(["M1", "M2"]);
      await expect(
        exactServingRouteIdsFromD1({ schemaPath, seedPath, expectedCount: 3 }),
      ).rejects.toThrow("has 2 routes; expected 3");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("derives deterministic pass rows only from a verified non-empty universe", () => {
    const projection = buildVerifiedMapRouteBatchProjection({
      month: "2026-04",
      generatedAt: "2026-07-22T12:00:00.000Z",
      routeIds: ["M2", "M1"],
      artifactEntries: [{ bytes: 20 }, { bytes: 30 }],
    });

    expect(projection.routeBatchStatus).toMatchObject({
      status: "pass",
      routeCount: 2,
      artifactCount: 2,
      totalByteLength: 50,
      issueCount: 0,
    });
    expect(projection.routeBatchBuiltRoutes.map((route) => route.routeId)).toEqual(["M1", "M2"]);
    expect(projection.routeBatchIssues).toEqual([]);
  });

  test("refuses to mint a pass from duplicate routes or an empty inventory", () => {
    expect(() =>
      buildVerifiedMapRouteBatchProjection({
        month: "2026-04",
        generatedAt: "2026-07-22T12:00:00.000Z",
        routeIds: ["M1", "M1"],
        artifactEntries: [{ bytes: 1 }],
      }),
    ).toThrow("non-empty, unique route universe");
    expect(() =>
      buildVerifiedMapRouteBatchProjection({
        month: "2026-04",
        generatedAt: "2026-07-22T12:00:00.000Z",
        routeIds: ["M1"],
        artifactEntries: [],
      }),
    ).toThrow("non-empty artifact inventory");
  });

  test("resolves an explicit local database path from the repository root", async () => {
    const source = await Bun.file(
      new URL("../../../src/commands/map/release.ts", import.meta.url),
    ).text();

    expect(source).toContain("dbPath: path(input.options.db)");
    expect(source).not.toContain("dbPath: input.options.db");
  });

  test("verifies artifacts before injecting and committing the route-batch pass", async () => {
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
      const plan097RecoverySeedPath = join(
        exportRoot,
        "d1",
        "2026-04",
        "seed.plan097-recovery.sql",
      );
      const exactRegistrationPath = join(exportRoot, "d1", "2026-04", "exact-registration.sql");
      const contextPath = join(artifactRoot, "map", "context", "nyc-boroughs.min.geojson");
      const mapRouteFactsPath = join(artifactRoot, "studio", "v1", "map-route-facts.json");
      type RecordedInput = Record<string, unknown> & {
        releaseIdentity?: unknown;
        generatedAt?: unknown;
      };
      const calls: Array<{ name: string; input: RecordedInput }> = [];
      const record = (name: string, input: unknown) => {
        calls.push({ name, input: input as RecordedInput });
      };
      const writeD1Output = async (input: unknown) => {
        const releaseIdentity = (
          input as {
            releaseIdentity: {
              releaseId: string;
              publishedAt: string;
              coverage: { start: string | null; end: string };
            };
          }
        ).releaseIdentity;
        const schemaSql = `
          CREATE TABLE route_catalog (route_id TEXT PRIMARY KEY, route_short_name TEXT NOT NULL);
          CREATE TABLE route_batch_status (month TEXT PRIMARY KEY, generated_at TEXT NOT NULL, status TEXT NOT NULL);
          CREATE TABLE exact_route_identity_release (release_id TEXT PRIMARY KEY);
          CREATE TABLE map_release_catalog (
            release_id TEXT PRIMARY KEY,
            published_at TEXT NOT NULL,
            coverage_start TEXT,
            coverage_end TEXT NOT NULL,
            manifest_key TEXT NOT NULL UNIQUE,
            manifest_sha256 TEXT NOT NULL,
            release_profile TEXT NOT NULL,
            verification_status TEXT NOT NULL,
            route_count INTEGER NOT NULL
          );
        `;
        const recoverySeedSql = `
          DELETE FROM "route_catalog";
          DELETE FROM "route_batch_status" WHERE "month" = '2026-04';
          INSERT INTO "route_catalog" VALUES ('M1', 'M1');
          INSERT INTO "route_batch_status" VALUES ('2026-04', '${releaseIdentity.publishedAt}', 'pass');
        `;
        const exactRegistrationSql = `INSERT INTO exact_route_identity_release (release_id) VALUES ('${releaseIdentity.releaseId}');\n`;
        mkdirSync(join(exportRoot, "d1", "2026-04"), { recursive: true });
        await Promise.all([
          Bun.write(schemaPath, schemaSql),
          Bun.write(plan097RecoverySeedPath, recoverySeedSql),
          Bun.write(exactRegistrationPath, exactRegistrationSql),
        ]);
        const exactRegistrationBytes = new TextEncoder().encode(exactRegistrationSql);
        return {
          schemaPath,
          seedPath,
          plan097RecoverySeedPath,
          status: "pass",
          ...releaseIdentity,
          exactRouteIdentity: {
            registrationFile: {
              path: exactRegistrationPath,
              byteLength: exactRegistrationBytes.byteLength,
              sha256: createHash("sha256").update(exactRegistrationBytes).digest("hex"),
            },
            receiptFile: {
              path: join(exportRoot, "d1", "2026-04", "exact-receipt.json"),
              byteLength: 1,
              sha256: "2".repeat(64),
            },
            exactRouteCount: 1,
            routeTypeCount: 1,
            tripTypeCount: 1,
            catalogSnapshotSha256: "3".repeat(64),
            projectionSha256: "4".repeat(64),
            sourceIndexSha256: "5".repeat(64),
          },
        };
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
        async exportD1(input: unknown) {
          record("exportD1", input);
          return writeD1Output(input);
        },
        async exactRouteIds() {
          return ["M1"];
        },
        async readD1Inputs(_db: unknown, _month: string, options: unknown) {
          record("readD1Inputs", options);
          return {
            routeBatchStatus: null,
            routeBatchBuiltRoutes: [],
            routeBatchIssues: [],
          };
        },
        async verifyD1(input: unknown) {
          record("verifyD1", input);
          return writeD1Output(input);
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
            },
            scheduleEvidence: {
              analysisPeriod: "2026-04",
              sourceCoverage: {
                sourceId: "bus_schedules_2026",
                datasetId: "4fnn-qsea",
                scheduleDateStart: "2026-01-01T00:00:00.000",
                scheduleDateEnd: "2026-04-11T00:00:00.000",
                rowCount: 22_703_125,
                routeCount: 375,
              },
              selectedRouteCount: 1,
              completeRouteCount: 1,
              excludedRouteCount: 0,
              missingSegmentCount: 0,
              excludedRoutes: [],
            },
          };
        },
        async map(input: unknown) {
          record("map", input);
          const releaseIdentity = (input as { releaseIdentity: Record<string, unknown> })
            .releaseIdentity;
          const manifestPath = join(artifactRoot, "map", "2026-04", "manifest.json");
          mkdirSync(join(artifactRoot, "map", "2026-04"), { recursive: true });
          mkdirSync(join(artifactRoot, "studio", "v1"), { recursive: true });
          await Promise.all([
            Bun.write(
              mapRouteFactsPath,
              `${JSON.stringify({ artifactKind: "bp.studio.map_route_facts.v2" })}\n`,
            ),
            Bun.write(
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
            ),
          ]);
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
        async commitBatch(_local: unknown, projection: unknown) {
          record("commitBatch", projection);
        },
      } as unknown as MapReleaseDependencies;

      const result = await runMapRelease(
        {
          local: { path: localDbPath } as OpenLocalPipelineDb,
          year: 2026,
          month: 4,
          contextSourcePath,
          freshnessMatrix: readyFreshnessMatrix("2026-04"),
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
        "exportD1",
        "context",
        "studio",
        "map",
        "audit",
        "readD1Inputs",
        "verifyD1",
        "commitBatch",
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
        routeIds: ["M1"],
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
        routeIds: ["M1"],
      });
      const mapReleaseIdentity = map?.releaseIdentity as
        | { publishedAt: string; coverage: { start: string | null; end: string } }
        | undefined;
      expect(d1?.releaseIdentity).toEqual(studio?.releaseIdentity);
      expect(studio?.releaseIdentity).toEqual(mapReleaseIdentity);
      expect(mapReleaseIdentity?.coverage).toEqual({ start: "2025-02", end: "2026-04" });
      expect(calls.find((call) => call.name === "speedSpines")?.input.generatedAt).toBe(
        mapReleaseIdentity?.publishedAt,
      );
      expect(result.d1.schemaPath).toBe(schemaPath);
      expect(result.d1.coverage.start as string | null).toBe("2025-02");
      expect(result.d1.coverage.end as string).toBe("2026-04");
      expect(result.d1.exactRouteIdentity?.exactRouteCount).toBe(1);
      expect(result.studio.mapRouteFactsPath).toBe(mapRouteFactsPath);
      expect(result.studio.releaseIdentity.coverage.start as string | null).toBe("2025-02");
      expect(result.studio.releaseIdentity.coverage.end as string).toBe("2026-04");
      expect(result.finalManifestKey).toMatch(/^map\/2026-04\/manifest\.[a-f0-9]{64}\.json$/);
      expect(existsSync(result.finalManifestPath)).toBe(true);
      expect(await Bun.file(result.registrationPath).text()).toContain(
        "operations/plan097/blobs/sha256/",
      );
      expect(await Bun.file(result.registrationPath).text()).toContain(
        result.releaseIdentity.releaseId,
      );
      expect(await Bun.file(result.registrationPath).text()).toContain(
        result.releaseIdentity.publishedAt,
      );
      expect(await Bun.file(result.registrationPath).text()).toContain("'2025-02'");
      expect(existsSync(result.recoveryArtifactManifestPath)).toBe(true);
      expect(
        result.recoveryArtifacts.manifest.entries.some(
          (entry) => entry.logicalKey === result.finalManifestKey,
        ),
      ).toBe(true);
      expect(existsSync(result.activationBundlePath)).toBe(true);
      expect(existsSync(result.activationBundleReceiptPath)).toBe(true);
      const activationBundle = JSON.parse(await Bun.file(result.activationBundlePath).text()) as {
        operationId: string;
        freshnessMatrix: { candidateCompatibilityCoverageEnd: string };
        studioScheduleEvidence: {
          completeRouteCount: number;
          sourceCoverage: { datasetId: string };
        };
        batch: { statements: Array<{ kind: string; table: string }> };
      };
      expect(activationBundle.operationId).toBe(`plan097:${result.releaseIdentity.releaseId}`);
      expect(activationBundle.freshnessMatrix.candidateCompatibilityCoverageEnd).toBe("2026-04");
      expect(activationBundle.studioScheduleEvidence).toMatchObject({
        completeRouteCount: 1,
        sourceCoverage: { datasetId: "4fnn-qsea" },
      });
      expect(activationBundle.batch.statements.at(-1)).toEqual(
        expect.objectContaining({ kind: "activation", table: "route_batch_status" }),
      );
      expect(result.activationBundleKey).toContain(result.activationBundleSha256);
      expect(calls.filter((call) => call.name === "verifyD1")).toHaveLength(1);
      const verifyInput = calls.find((call) => call.name === "verifyD1")?.input as {
        inputs?: {
          routeBatchStatus?: { status: string; routeCount: number; artifactCount: number };
          routeBatchBuiltRoutes?: Array<{ routeId: string; status: string }>;
          routeBatchIssues?: unknown[];
        };
      };
      expect(verifyInput.inputs?.routeBatchStatus).toMatchObject({
        status: "pass",
        routeCount: 1,
        artifactCount: result.recoveryArtifacts.manifest.entries.length,
      });
      expect(verifyInput.inputs?.routeBatchBuiltRoutes).toEqual([
        expect.objectContaining({ routeId: "M1", status: "pass" }),
      ]);
      expect(verifyInput.inputs?.routeBatchIssues).toEqual([]);
      expect(calls.find((call) => call.name === "commitBatch")?.input).toEqual(
        result.routeBatchProjection,
      );
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
      async exportD1(input: unknown) {
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
          freshnessMatrix: readyFreshnessMatrix("2026-04"),
        },
        dependencies,
      ),
    ).rejects.toThrow("stop after identity capture");
    expect(observedIdentities[0]?.coverage).toEqual({ start: null, end: "2026-04" });
  });

  test("rejects a candidate whose D1 export lacks exact-route identity", async () => {
    const dependencies = {
      async routeBrief() {
        return { isoMonth: "2026-04" };
      },
      async speedSpines() {
        return { manifestPath: "unused.json", coverageStart: null };
      },
      async exportD1(input: unknown) {
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
          schemaPath: "unused-schema.sql",
          seedPath: "unused-seed.sql",
          status: "pass",
          ...releaseIdentity,
          exactRouteIdentity: null,
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
          freshnessMatrix: readyFreshnessMatrix("2026-04"),
        },
        dependencies,
      ),
    ).rejects.toThrow("did not emit the candidate exact-route identity");
  });

  test("rejects a one-millisecond D1 publication identity skew", async () => {
    const dependencies = {
      async routeBrief() {
        return { isoMonth: "2026-04" };
      },
      async speedSpines() {
        return { manifestPath: "unused.json", coverageStart: null };
      },
      async exportD1(input: unknown) {
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
          freshnessMatrix: readyFreshnessMatrix("2026-04"),
        },
        dependencies,
      ),
    ).rejects.toThrow(
      "Preliminary D1 export publication identity does not match the map release boundary",
    );
  });
});
