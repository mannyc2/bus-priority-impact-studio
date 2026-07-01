import { join } from "node:path";
import { listCorridorArtifacts, listRouteArtifacts } from "@bp/db";
import { Effect } from "effect";
import { runD1ReplayBoundary } from "../../effect/d1-replay.ts";
import { runPipelineFileSystemBoundary } from "../../effect/file-system.ts";

type ManifestFile = {
  artifacts?: Array<{ artifactKey?: unknown }>;
};

function isManifestArtifactEntry(entry: unknown): entry is { artifactKey?: unknown } {
  return typeof entry === "object" && entry !== null;
}

function manifestFileFromJson(raw: unknown): ManifestFile {
  if (typeof raw !== "object" || raw === null || !("artifacts" in raw)) {
    return {};
  }
  const artifacts = raw.artifacts;
  return Array.isArray(artifacts) ? { artifacts: artifacts.filter(isManifestArtifactEntry) } : {};
}

export type ManifestArtifactKeyResult = {
  keys: string[];
  manifestCount: number;
};

export type D1ArtifactKeyResult = {
  keys: string[];
  exportUsed: boolean;
};

export async function collectManifestArtifactKeys(input: {
  artifactRoot: string;
  manifestDirs: readonly string[];
  month: string;
}): Promise<ManifestArtifactKeyResult> {
  return runPipelineFileSystemBoundary({
    command: "publish.artifact-keys",
    operation: "collectManifestArtifactKeys",
    run: (files) =>
      Effect.gen(function* () {
        const keys = new Set<string>();
        let manifestCount = 0;
        for (const dir of input.manifestDirs) {
          const manifestPath = join(input.artifactRoot, dir, input.month, "manifest.json");
          const rawManifest = yield* files.readJsonIfExists({
            command: "publish.artifact-keys",
            operation: "readManifestArtifactKeys",
            path: manifestPath,
            spanAttributes: { month: input.month },
          });
          if (rawManifest === null) continue;
          manifestCount += 1;
          const manifest = manifestFileFromJson(rawManifest);
          for (const entry of manifest.artifacts ?? []) {
            if (typeof entry.artifactKey === "string" && entry.artifactKey.length > 0) {
              keys.add(entry.artifactKey);
            }
          }
        }
        return { keys: [...keys].sort(), manifestCount };
      }),
  });
}

async function readD1ExportSqlIfExists(input: {
  month: string;
  schemaPath: string;
  seedPath: string;
}): Promise<{ schemaSql: string; seedSql: string } | null> {
  return runPipelineFileSystemBoundary({
    command: "publish.artifact-keys",
    operation: "readD1ExportSql",
    run: (files) =>
      Effect.gen(function* () {
        const schemaSql = yield* files.readTextIfExists({
          command: "publish.artifact-keys",
          operation: "readD1SchemaSql",
          path: input.schemaPath,
          spanAttributes: { month: input.month },
        });
        if (schemaSql === null) return null;

        const seedSql = yield* files.readTextIfExists({
          command: "publish.artifact-keys",
          operation: "readD1SeedSql",
          path: input.seedPath,
          spanAttributes: { month: input.month },
        });
        if (seedSql === null) return null;

        return { schemaSql, seedSql };
      }),
  });
}

export async function collectD1ArtifactKeys(input: {
  month: string;
  schemaPath: string;
  seedPath: string;
}): Promise<D1ArtifactKeyResult> {
  const sql = await readD1ExportSqlIfExists(input);
  if (sql === null) {
    return { keys: [], exportUsed: false };
  }

  return runD1ReplayBoundary({
    command: "publish.artifact-keys",
    operation: "collectD1ArtifactKeys",
    schemaSql: sql.schemaSql,
    seedSql: sql.seedSql,
    spanAttributes: { month: input.month },
    run: async ({ db }) => {
      const [routeArtifacts, corridorArtifacts] = await Promise.all([
        listRouteArtifacts(db, input.month),
        listCorridorArtifacts(db, input.month),
      ]);
      return {
        keys: [
          ...new Set([
            ...routeArtifacts.map((row) => row.artifact_key),
            ...corridorArtifacts.map((row) => row.artifact_key),
          ]),
        ].sort(),
        exportUsed: true,
      };
    },
  });
}
