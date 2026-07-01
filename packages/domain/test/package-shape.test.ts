import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DocumentDiscoveryExtractionSchema } from "@bp/domain/documents/discovery";
import { FindingCandidateSchema } from "@bp/domain/findings";
import { toProjectJsonSchema } from "@bp/domain/json-schema";
import { MapManifestResponseSchema } from "@bp/domain/maps";
import { RouteIdCodec } from "@bp/domain/primitives";
import { RouteScorecardSchema } from "@bp/domain/routes";
import { StudioRouteSchema } from "@bp/domain/studio/routes";
import * as z from "zod";

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
        "./documents/derived-surfaces",
        "./documents/discovery",
        "./documents/intervention-records",
        "./documents/operational-date",
        "./documents/research-surfaces",
        "./documents/structured-extraction",
        "./findings",
        "./json-schema",
        "./maps",
        "./primitives",
        "./routes",
        "./schema-registry",
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
      ]),
    );
    expect(packageJson.scripts["typecheck:test"]).toContain("tsconfig.test.json");
  });

  test("resolves public subpaths through package imports", () => {
    const normalizedRouteId: string = z.decode(RouteIdCodec, " m1 ");

    expect(normalizedRouteId).toBe("M1");
    expect(
      RouteScorecardSchema.safeParse({
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
      }).success,
    ).toBe(true);
    expect(
      MapManifestResponseSchema.safeParse({
        schemaVersion: 1,
        generatedAt: "2026-03-01T00:00:00.000Z",
        baselineMonth: "2026-03",
        status: "pass",
        artifactCount: 0,
        routeSegmentArtifactCount: 0,
        totalFeatureCount: 0,
        totalByteLength: 0,
        issueCount: 0,
        artifacts: [],
        quality: {
          releaseLayer: "baseline_release",
          completenessStatus: "complete",
          confidence: "high",
          caveats: [],
        },
      }).success,
    ).toBe(true);
    expect(typeof FindingCandidateSchema.safeParse).toBe("function");
    expect(typeof DocumentDiscoveryExtractionSchema.safeParse).toBe("function");
    expect(typeof StudioRouteSchema.safeParse).toBe("function");
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
