import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  buildMapArtifactManifest,
  buildMapJsonArtifact,
  MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
  MAP_ARTIFACT_JSON_CONTENT_TYPE,
} from "@bp/analytics/evaluation";
import { decodeStrict } from "@bp/domain/decode";
import {
  MapLayerStatusSchema,
  MapRouteUniverseSchema,
  MapSourceStatusSchema,
} from "@bp/domain/maps";
import {
  runPublishR2Artifacts,
  type S3Driver,
} from "../../../src/commands/publish/r2-artifacts.ts";

type DriverCall = {
  kind: "stat" | "put";
  key: string;
};

function recordingDriver(remoteIndex: Map<string, { size: number; etag: string }>): {
  driver: S3Driver;
  calls: DriverCall[];
} {
  const calls: DriverCall[] = [];
  const driver: S3Driver = {
    tracksRemoteCosts: true,
    async stat(key) {
      calls.push({ kind: "stat", key });
      return remoteIndex.get(key) ?? null;
    },
    async put(key) {
      calls.push({ kind: "put", key });
    },
  };
  return { driver, calls };
}

async function seedArtifacts(root: string, month: string): Promise<void> {
  await mkdir(join(root, "map", month), { recursive: true });
  await mkdir(join(root, "studio"), { recursive: true });
  await writeFile(
    join(root, "map", month, "tiles.geojson"),
    '{"type":"FeatureCollection","features":[]}',
  );
  await writeFile(join(root, "studio", "index.json"), '{"v":1}');
}

async function seedStudioSpeedHistoryArtifact(root: string): Promise<void> {
  const dir = join(root, "studio", "v2", "routes", "m15-sbs");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "speed-history.json"), '{"artifactKind":"studio_route_speed_history"}');
}

async function seedStudioRouteEvidenceArtifacts(root: string): Promise<void> {
  const dir = join(root, "studio", "v2", "wiki", "routes");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(root, "studio", "v2", "wiki", "index.json"),
    '{"artifactKind":"bp.studio.route_evidence_index.v1"}',
  );
  await writeFile(join(dir, "m15-sbs.json"), '{"routeId":"M15+","routeSlug":"m15-sbs"}');
}

async function seedStudioDetectorReadinessManifest(root: string): Promise<void> {
  const dir = join(root, "studio", "v2", "detectors");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "route-detector-readiness-manifest.json"),
    '{"artifactKind":"detector_readiness_serving_manifest","schemaVersion":1}',
  );
}

async function seedPublishableFullMap(
  root: string,
  input?: { staleLane?: boolean },
): Promise<void> {
  const generatedAt = "2026-04-01T00:00:00.000Z";
  const definitions = [
    {
      artifactKey: "map/sources/source-snapshot.json",
      artifactKind: "map_source_snapshot" as const,
      contentType: MAP_ARTIFACT_JSON_CONTENT_TYPE,
      routeId: null,
      payload: { sources: [] },
      featureCount: 0,
    },
    {
      artifactKey: "map/routes/current-local-limited-sbs.min.geojson",
      artifactKind: "map_route_shapes_geojson" as const,
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
      routeId: null,
      payload: { type: "FeatureCollection", features: [] },
      featureCount: 0,
    },
    {
      artifactKey: "map/stops/current-timepoints.min.geojson",
      artifactKind: "map_timepoint_stops_geojson" as const,
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
      routeId: null,
      payload: { type: "FeatureCollection", features: [] },
      featureCount: 0,
    },
    {
      artifactKey: "map/context/nyc-boroughs.min.geojson",
      artifactKind: "map_borough_context_geojson" as const,
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
      routeId: null,
      payload: {
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
      },
      featureCount: 1,
    },
    {
      artifactKey: `map/${MONTH}/network-simplified.geojson`,
      artifactKind: "map_network_simplified_geojson" as const,
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
      routeId: null,
      payload: { type: "FeatureCollection", features: [] },
      featureCount: 0,
    },
    ...(input?.staleLane
      ? [
          {
            artifactKey: "map/bus-lanes/stale.geojson",
            artifactKind: "map_bus_lanes_geojson" as const,
            contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
            routeId: null,
            payload: { type: "FeatureCollection", features: [] },
            featureCount: 0,
          },
        ]
      : []),
  ];
  const artifacts = definitions.map((definition) => buildMapJsonArtifact(definition));
  for (const artifact of artifacts) {
    const path = join(root, artifact.entry.artifactKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, artifact.bytes);
  }
  const routeFactsKey = "studio/v1/map-route-facts.json";
  const routeFactsBytes = new TextEncoder().encode(
    `${JSON.stringify({ schemaVersion: 1, baselineMonth: MONTH, generatedAt, routes: [] }, null, 2)}\n`,
  );
  await mkdir(join(root, "studio", "v1"), { recursive: true });
  await writeFile(join(root, routeFactsKey), routeFactsBytes);
  const source = (value: unknown) => decodeStrict(MapSourceStatusSchema)(value);
  const sources = [
    source({
      sourceId: "fixture_snapshot",
      priority: "p0",
      requiredForFull: true,
      readiness: "available",
      currencyStatus: "current",
      currency: {
        policy: "max_age_snapshot",
        fetchedAt: generatedAt,
        evaluatedAt: generatedAt,
        ageDays: 0,
        maxAgeDays: 45,
      },
      reason: "Current fixture snapshot.",
    }),
  ];
  const layer = (value: unknown) => decodeStrict(MapLayerStatusSchema)(value);
  const layers = [
    ["route_shapes", "p0", true, "current", "map/routes/current-local-limited-sbs.min.geojson"],
    ["timepoint_stops", "p0", true, "current", "map/stops/current-timepoints.min.geojson"],
    ["network_simplified", "p0", true, "period_aligned", `map/${MONTH}/network-simplified.geojson`],
    ["route_segments", "p0", true, "period_aligned", null],
    ["borough_context", "p0", true, "revision_pinned", "map/context/nyc-boroughs.min.geojson"],
    ["route_facts", "p0", true, "period_aligned", routeFactsKey],
    [
      "bus_lanes",
      "p1",
      false,
      input?.staleLane ? "stale" : "current",
      input?.staleLane ? "map/bus-lanes/stale.geojson" : null,
    ],
  ].map(([layerId, priority, requiredForFull, currencyStatus, artifactKey]) =>
    layer({
      layerId,
      priority,
      requiredForFull,
      readiness:
        layerId === "bus_lanes" ? (input?.staleLane ? "available" : "missing") : "available",
      currencyStatus,
      currency:
        layerId === "borough_context"
          ? {
              policy: "revision_pinned",
              sourceId: "nyc_borough_boundaries",
              embeddedSha256: "a".repeat(64),
              sourceSha256: "a".repeat(64),
            }
          : layerId === "network_simplified" ||
              layerId === "route_segments" ||
              layerId === "route_facts"
            ? { policy: "analysis_period", baselineMonth: MONTH, coveragePassed: true }
            : {
                policy: "max_age_snapshot",
                fetchedAt:
                  input?.staleLane && layerId === "bus_lanes"
                    ? "2026-02-14T00:00:00.000Z"
                    : generatedAt,
                evaluatedAt: generatedAt,
                ageDays: input?.staleLane && layerId === "bus_lanes" ? 46 : 0,
                maxAgeDays: 45,
              },
      sourceIds: ["fixture_snapshot"],
      artifactKey,
      featureCount: layerId === "borough_context" ? 1 : 0,
      routeCount: 0,
      reason: "Fixture layer posture.",
    }),
  );
  const routeUniverse = decodeStrict(MapRouteUniverseSchema)({
    includedRouteTypes: ["Local", "Limited", "SBS"],
    excludedRouteTypes: ["Express", "School"],
    expectedRouteIds: [],
    geometryRouteIds: [],
    routeSegmentRouteIds: [],
    routeFactRouteIds: [],
  });
  const manifest = buildMapArtifactManifest({
    month: MONTH,
    generatedAt,
    artifacts: artifacts.map((artifact) => artifact.entry),
    releaseProfile: "full",
    routeFacts: {
      status: "available",
      artifactKey: routeFactsKey,
      sha256: createHash("sha256").update(routeFactsBytes).digest("hex"),
      schemaVersion: 1,
      baselineMonth: MONTH,
      routeCount: 0,
      byteLength: routeFactsBytes.byteLength,
      gzipByteLength: gzipSync(routeFactsBytes, { level: 9 }).byteLength,
    },
    sources,
    layers,
    routeUniverse,
  });
  const path = join(root, "map", MONTH, "manifest.json");
  await mkdir(join(root, "map", MONTH), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ ...manifest, verificationStatus: "pass", status: "pass" }, null, 2)}\n`,
  );
}

const MONTH = "2026-03";
const publishArtifactKeysPath = join(
  import.meta.dir,
  "../../../src/commands/publish/publish-artifact-keys.ts",
);

function baseOptions(input: {
  artifactRoot: string;
  outputPath: string;
  driver: S3Driver;
  dryRun?: boolean;
  force?: boolean;
}) {
  return {
    month: MONTH,
    bucket: "bus-priority-test",
    endpoint: "",
    accessKeyId: "",
    secretAccessKey: "",
    concurrency: 4,
    maxAttempts: 1,
    backoffMsBase: 1,
    prefixes: ["map", "studio"] as const,
    manifestDirs: [] as const,
    d1SchemaPath: join(input.artifactRoot, "missing-schema.sql"),
    d1SeedPath: join(input.artifactRoot, "missing-seed.sql"),
    artifactRoot: input.artifactRoot,
    outputPath: input.outputPath,
    dryRun: input.dryRun ?? false,
    force: input.force ?? false,
    driver: input.driver,
  };
}

describe("runPublishR2Artifacts", () => {
  it("collects D1 artifact keys through the Effect D1 replay boundary", () => {
    const source = readFileSync(publishArtifactKeysPath, "utf8");

    expect(source).toContain("runD1ReplayBoundary({");
    expect(source).toContain("runPipelineFileSystemBoundary({");
    expect(source).not.toContain('from "node:fs/promises"');
    expect(source).not.toContain('from "bun:sqlite"');
    expect(source).not.toContain("new Database");
    expect(source).not.toContain("createBunSqliteServingDb");
  });

  it("uploads every candidate when remote is empty", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);

      const { driver, calls } = recordingDriver(new Map());
      const report = await runPublishR2Artifacts(baseOptions({ artifactRoot, outputPath, driver }));

      expect(report.status).toBe("pass");
      expect(report.candidateCount).toBe(2);
      expect(report.uploadedCount).toBe(2);
      expect(report.skippedCount).toBe(0);
      expect(report.failedCount).toBe(0);
      expect(report.r2ClassBOperationCount).toBe(2);
      const statKeys = calls
        .filter((c) => c.kind === "stat")
        .map((c) => c.key)
        .sort();
      const putKeys = calls
        .filter((c) => c.kind === "put")
        .map((c) => c.key)
        .sort();
      expect(statKeys).toEqual([`map/${MONTH}/tiles.geojson`, "studio/index.json"]);
      expect(putKeys).toEqual([`map/${MONTH}/tiles.geojson`, "studio/index.json"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects a demo map manifest before remote HEAD or PUT calls", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-demo-manifest-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);
      await writeFile(
        join(artifactRoot, "map", MONTH, "manifest.json"),
        JSON.stringify({
          releaseProfile: "demo",
          buildStatus: "pass",
          verificationStatus: "not_run",
          analysisPeriod: MONTH,
          routeFacts: { status: "unavailable", reason: "fixture" },
          artifacts: [],
        }),
      );
      const { driver, calls } = recordingDriver(new Map());
      await expect(
        runPublishR2Artifacts({
          ...baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
          manifestDirs: ["map"],
        }),
      ).rejects.toThrow("Map manifest is not publishable");
      expect(calls).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("publishes a verified full P0 map release with typed unavailable lanes", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-full-no-lanes-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedPublishableFullMap(artifactRoot);
      const { driver, calls } = recordingDriver(new Map());
      const report = await runPublishR2Artifacts({
        ...baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
        manifestDirs: ["map"],
      });
      expect(report.status).toBe("pass");
      expect(report.candidateCount).toBe(7);
      expect(calls.every((call) => call.kind === "stat")).toBe(true);
      expect(calls.some((call) => call.key.includes("bus-lanes"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects a stale optional lane key before remote HEAD or PUT calls", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-stale-lanes-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedPublishableFullMap(artifactRoot, { staleLane: true });
      const { driver, calls } = recordingDriver(new Map());
      await expect(
        runPublishR2Artifacts({
          ...baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
          manifestDirs: ["map"],
        }),
      ).rejects.toThrow("map_optional_lane_reference_unpublishable");
      expect(calls).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects a content-addressed filename whose token does not match the body", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-hash-mismatch-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      const directory = join(artifactRoot, "map", MONTH);
      await mkdir(directory, { recursive: true });
      const key = `map/${MONTH}/network.${"a".repeat(64)}.geojson`;
      await writeFile(join(artifactRoot, key), '{"type":"FeatureCollection","features":[]}');
      const { driver, calls } = recordingDriver(new Map());
      const report = await runPublishR2Artifacts(
        baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
      );

      expect(report.status).toBe("fail");
      expect(report.failed[0]?.error).toContain("content-addressed filename hash mismatch");
      expect(calls).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("includes nested Studio v2 route speed-history artifacts under the default studio prefix", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-studio-v2-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);
      await seedStudioSpeedHistoryArtifact(artifactRoot);

      const { driver, calls } = recordingDriver(new Map());
      const report = await runPublishR2Artifacts(
        baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
      );

      expect(report.status).toBe("pass");
      expect(report.candidateCount).toBe(3);
      expect(calls.map((c) => c.key)).toContain("studio/v2/routes/m15-sbs/speed-history.json");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("includes split Studio wiki route-evidence artifacts under the default studio prefix", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-studio-wiki-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);
      await seedStudioRouteEvidenceArtifacts(artifactRoot);

      const { driver, calls } = recordingDriver(new Map());
      const report = await runPublishR2Artifacts(
        baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
      );

      expect(report.status).toBe("pass");
      expect(calls.map((c) => c.key)).toEqual(
        expect.arrayContaining(["studio/v2/wiki/index.json", "studio/v2/wiki/routes/m15-sbs.json"]),
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("includes the staged Studio v2 detector readiness manifest under the default studio prefix", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-studio-v2-detectors-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);
      await seedStudioDetectorReadinessManifest(artifactRoot);

      const { driver, calls } = recordingDriver(new Map());
      const report = await runPublishR2Artifacts(
        baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
      );

      expect(report.status).toBe("pass");
      expect(calls.map((c) => c.key)).toContain(
        "studio/v2/detectors/route-detector-readiness-manifest.json",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("skips uploads when remote etag matches local md5 and size", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-skip-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);

      const studioBody = '{"v":1}';
      const studioMd5 = await Bun.MD5.hash(studioBody, "hex");
      const remote = new Map<string, { size: number; etag: string }>([
        ["studio/index.json", { size: studioBody.length, etag: studioMd5 }],
      ]);

      const { driver } = recordingDriver(remote);
      const report = await runPublishR2Artifacts(baseOptions({ artifactRoot, outputPath, driver }));

      expect(report.uploadedCount).toBe(1);
      expect(report.skippedCount).toBe(1);
      expect(report.candidateCount).toBe(2);
      expect(report.status).toBe("pass");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports would-uploads in dry-run mode without calling put", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-dry-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);

      const { driver, calls } = recordingDriver(new Map());
      const report = await runPublishR2Artifacts(
        baseOptions({ artifactRoot, outputPath, driver, dryRun: true }),
      );

      expect(report.dryRunCount).toBe(2);
      expect(report.uploadedCount).toBe(0);
      expect(report.status).toBe("pass");
      expect(calls.some((c) => c.kind === "put")).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("force mode skips HEAD and re-uploads every candidate", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "publish-r2-force-"));
    try {
      const artifactRoot = join(tmp, "artifacts");
      const outputPath = join(tmp, "report.json");
      await seedArtifacts(artifactRoot, MONTH);

      const remote = new Map<string, { size: number; etag: string }>([
        ["studio/index.json", { size: 7, etag: "0".repeat(32) }],
      ]);
      const { driver, calls } = recordingDriver(remote);
      const report = await runPublishR2Artifacts(
        baseOptions({ artifactRoot, outputPath, driver, force: true }),
      );

      expect(report.uploadedCount).toBe(2);
      expect(report.skippedCount).toBe(0);
      expect(report.r2ClassBOperationCount).toBe(0);
      expect(calls.some((c) => c.kind === "stat")).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
