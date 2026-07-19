import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeEitherStrict, decodeStrict } from "@bp/domain/decode";
import { DocumentEvidenceCandidateSchema } from "@bp/domain/documents/candidates";
import { FindingCandidateSchema } from "@bp/domain/findings";
import { toProjectJsonSchema } from "@bp/domain/json-schema";
import { MapManifestResponseSchema } from "@bp/domain/maps";
import { RouteIdCodec } from "@bp/domain/primitives";
import { RouteScorecardSchema } from "@bp/domain/routes";
import { StudioRouteSchema } from "@bp/domain/studio/routes";
import { Result, Schema } from "effect";

type DomainPackageJson = {
  exports: Record<string, unknown>;
  scripts: Record<string, string>;
};

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = join(packageRoot, "../..");
const srcRoot = join(packageRoot, "src");
const packageJsonPath = join(packageRoot, "package.json");

async function collectIndexFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectIndexFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name === "index.ts") {
      files.push(entryPath);
    }
  }

  return files;
}

async function readPackageJson(): Promise<DomainPackageJson> {
  return JSON.parse(await readFile(packageJsonPath, "utf8")) as DomainPackageJson;
}

describe("domain package shape", () => {
  test("exposes explicit contract subpaths and no root entrypoint", async () => {
    const packageJson = await readPackageJson();
    const exportKeys = Object.keys(packageJson.exports);

    expect(exportKeys).not.toContain(".");
    expect(exportKeys).toEqual(
      expect.arrayContaining([
        "./documents",
        "./documents/candidates",
        "./documents/intervention-records",
        "./documents/operational-date",
        "./findings",
        "./json-schema",
        "./maps",
        "./primitives",
        "./routes",
        "./studio",
        "./studio/docs",
        "./studio/identity",
        "./studio/interventions",
        "./studio/release",
        "./studio/routes",
        "./studio/rum",
        "./studio/segment-evidence",
        "./studio/shared",
        "./studio/snapshots",
        "./studio/study",
      ]),
    );
    expect(packageJson.scripts["typecheck:test"]).toContain("tsconfig.test.json");
  });

  test("resolves public subpaths through package imports", () => {
    const normalizedRouteId: string = decodeStrict(RouteIdCodec)(" m1 ");

    expect(normalizedRouteId).toBe("M1");
    expect(
      Result.isSuccess(
        decodeEitherStrict(RouteScorecardSchema)({
          schemaVersion: 1,
          routeId: "M1",
          month: "2026-03",
          routeScore: 82,
          coverageStatus: "full",
          averageSpeedMph: 7.5,
          hotspotCount: 3,
          citations: [
            {
              sourceId: "fixture",
              title: "Fixture",
              url: "https://example.com/source",
              verifiedAt: "2026-03-01T00:00:00.000Z",
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      Result.isSuccess(
        decodeEitherStrict(MapManifestResponseSchema)({
          schemaVersion: 2,
          releaseId: "pub_20260301T000000000Z",
          publishedAt: "2026-03-01T00:00:00.000Z",
          coverage: { start: null, end: "2026-03" },
          releaseProfile: "demo",
          buildStatus: "pass",
          verificationStatus: "not_run",
          routeFacts: { status: "unavailable", reason: "Fixture omits route facts." },
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
          artifactCount: 0,
          routeSegmentArtifactCount: 0,
          totalFeatureCount: 0,
          totalByteLength: 0,
          issueCount: 0,
          artifacts: [],
          quality: {
            releaseLayer: "published_release",
            completenessStatus: "complete",
            confidence: "high",
            caveats: [],
          },
        }),
      ),
    ).toBe(true);
    expect(Schema.isSchema(FindingCandidateSchema)).toBe(true);
    expect(Schema.isSchema(DocumentEvidenceCandidateSchema)).toBe(true);
    expect(Schema.isSchema(StudioRouteSchema)).toBe(true);
    expect(toProjectJsonSchema(RouteScorecardSchema)).toEqual(
      expect.objectContaining({
        $schema: "https://json-schema.org/draft/2020-12/schema",
      }),
    );
  });

  test("keeps package barrels explicit", async () => {
    const indexFiles = await collectIndexFiles(srcRoot);

    expect(indexFiles.length).toBeGreaterThan(0);

    for (const indexFile of indexFiles) {
      const relativePath = relative(packageRoot, indexFile);
      const text = await readFile(indexFile, "utf8");

      expect(text, `${relativePath} must not use wildcard re-exports`).not.toMatch(
        /export\s+\*\s*(as|from)/,
      );
    }
  });

  test("external TypeScript code does not import the removed root entrypoint", async () => {
    const files = await collectTypeScriptFiles(repoRoot);

    for (const file of files) {
      if (file.startsWith(packageRoot)) {
        continue;
      }

      const relativePath = relative(repoRoot, file);
      const text = await readFile(file, "utf8");

      expect(text, `${relativePath} must import explicit @bp/domain/* subpaths`).not.toMatch(
        /from\s+["']@bp\/domain["']|import\(["']@bp\/domain["']\)/,
      );
    }
  }, 15_000);
});

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".claude") {
      continue;
    }

    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}
