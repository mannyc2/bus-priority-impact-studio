import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mapArtifactSha256 } from "@bp/analytics/evaluation";
import { buildMapReleaseRegistrationSql } from "@bp/db/d1/seed";
import { decodeStrict } from "@bp/domain/decode";
import { ReleaseIdentitySchema, releaseIdFromPublishedAt } from "@bp/domain/studio/shared";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("publish completeness", () => {
  test("rejects legacy map manifests before publication", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-publish-completeness-"));
    roots.push(root);
    const artifactRoot = join(root, "artifacts");
    const month = "2026-03";
    await mkdir(join(artifactRoot, "map", month), { recursive: true });
    await mkdir(join(artifactRoot, "studio", "v1"), { recursive: true });
    await Bun.write(
      join(artifactRoot, "map", month, "manifest.json"),
      JSON.stringify({
        releaseProfile: "demo",
        buildStatus: "pass",
        verificationStatus: "not_run",
        analysisPeriod: month,
        routeFacts: { status: "unavailable", reason: "fixture" },
        artifacts: [],
      }),
    );
    await Bun.write(
      join(artifactRoot, "studio", "v1", "routes.json"),
      JSON.stringify({ coverage: { start: null, end: month } }),
    );
    const output = join(root, "report.json");
    const process = Bun.spawn(
      [
        "bun",
        "run",
        "tools/pipeline-v2/src/checks/check-publish-completeness.ts",
        "--month",
        month,
        "--artifact-root",
        artifactRoot,
        "--export-root",
        join(root, "exports"),
        "--output",
        output,
      ],
      { cwd: join(import.meta.dir, "../../../.."), stdout: "pipe", stderr: "pipe" },
    );
    expect(await process.exited).toBe(1);
    const stderr = await new Response(process.stderr).text();
    if (!(await Bun.file(output).exists())) throw new Error(stderr);
    const report = JSON.parse(await readFile(output, "utf8")) as { conflicts: string[] };
    expect(report.conflicts).toEqual(
      expect.arrayContaining([
        `Map manifest for ${month} is missing or invalid under the v2 release contract.`,
        "Verified D1 schema and seed exports are unavailable.",
        "Exact-route identity registration, strict receipt, or immutable v2 evidence index is missing.",
      ]),
    );
  });

  test("rejects registration SQL whose catalog metadata drifts from the final manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-publish-registration-drift-"));
    roots.push(root);
    const artifactRoot = join(root, "artifacts");
    const exportDir = join(root, "exports", "2026-03");
    const month = "2026-03";
    const publishedAt = "2026-07-19T18:00:00.000Z";
    const releaseIdentity = decodeStrict(ReleaseIdentitySchema)({
      releaseId: releaseIdFromPublishedAt(publishedAt),
      publishedAt,
      coverage: { start: null, end: month },
    });
    const networkKey = `map/${month}/network-simplified.geojson`;
    const networkBytes = new TextEncoder().encode("{}\n");
    await mkdir(join(artifactRoot, "map", month), { recursive: true });
    await mkdir(join(artifactRoot, "studio", "v1"), { recursive: true });
    await mkdir(exportDir, { recursive: true });
    await Bun.write(join(artifactRoot, networkKey), networkBytes);
    const manifest = {
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
        routeCount: 0,
        byteLength: 0,
        gzipByteLength: 0,
      },
      sources: [],
      layers: [],
      routeUniverse: {
        includedRouteTypes: ["Local", "Limited", "SBS"],
        excludedRouteTypes: ["Express", "School"],
        expectedRouteIds: [],
        geometryRouteIds: [],
        routeSegmentRouteIds: [],
        routeFactRouteIds: [],
      },
      status: "pass",
      artifactCount: 1,
      routeSegmentArtifactCount: 0,
      totalFeatureCount: 0,
      totalByteLength: networkBytes.byteLength,
      issueCount: 0,
      artifacts: [
        {
          artifactKind: "map_network_simplified_geojson",
          artifactKey: networkKey,
          contentType: "application/geo+json",
          byteLength: networkBytes.byteLength,
          gzipByteLength: networkBytes.byteLength,
          sha256: mapArtifactSha256(networkBytes),
          featureCount: 0,
          coordinateCount: 0,
          routeId: null,
        },
      ],
    };
    const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
    const manifestSha256 = mapArtifactSha256(manifestBytes);
    const manifestKey = `map/${month}/manifest.${manifestSha256}.json`;
    await Bun.write(join(artifactRoot, "map", month, "manifest.json"), manifestBytes);
    await Bun.write(join(artifactRoot, manifestKey), manifestBytes);
    await Bun.write(
      join(artifactRoot, "studio", "v1", "routes.json"),
      JSON.stringify({ coverage: { start: null, end: month } }),
    );
    const schemaPath = join(exportDir, "schema.sql");
    const seedPath = join(exportDir, "seed.sql");
    await Bun.write(
      schemaPath,
      `CREATE TABLE route_artifact (route_id TEXT, month TEXT, artifact_name TEXT, artifact_key TEXT, content_type TEXT, byte_length INTEGER, sha256 TEXT);
CREATE TABLE corridor_artifact (corridor_id TEXT, month TEXT, artifact_name TEXT, artifact_key TEXT, content_type TEXT, byte_length INTEGER, sha256 TEXT);\n`,
    );
    await Bun.write(seedPath, "SELECT 1;\n");
    await Bun.write(
      join(exportDir, "map-release-registration.sql"),
      buildMapReleaseRegistrationSql({
        ...releaseIdentity,
        manifestKey,
        manifestSha256,
        releaseProfile: "full",
        verificationStatus: "pass",
        routeCount: 1,
      }),
    );
    await Bun.write(join(exportDir, "exact-route-identity-registration.sql"), "SELECT 1;\n");
    await Bun.write(join(exportDir, "exact-route-identity-receipt.json"), '{"bad":true}\n');
    await mkdir(join(artifactRoot, "studio", "v2", "wiki"), { recursive: true });
    await Bun.write(join(artifactRoot, "studio", "v2", "wiki", "index.json"), '{"bad":true}\n');

    const output = join(root, "report.json");
    const process = Bun.spawn(
      [
        "bun",
        "run",
        "tools/pipeline-v2/src/checks/check-publish-completeness.ts",
        "--month",
        month,
        "--artifact-root",
        artifactRoot,
        "--schema",
        schemaPath,
        "--seed",
        seedPath,
        "--output",
        output,
      ],
      { cwd: join(import.meta.dir, "../../../.."), stdout: "pipe", stderr: "pipe" },
    );
    expect(await process.exited).toBe(1);
    const stderr = await new Response(process.stderr).text();
    if (!(await Bun.file(output).exists())) throw new Error(stderr);
    const report = JSON.parse(await readFile(output, "utf8")) as { conflicts: string[] };
    expect(report.conflicts).toContain(
      "Map release registration SQL does not match the final catalog metadata.",
    );
    expect(
      report.conflicts.some((conflict) =>
        conflict.startsWith("Exact-route identity verification failed:"),
      ),
    ).toBe(true);
  });
});
