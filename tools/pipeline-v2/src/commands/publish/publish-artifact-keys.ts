import { Database } from "bun:sqlite";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listCorridorArtifacts, listRouteArtifacts } from "@bp/db";
import { createBunSqliteServingDb } from "@bp/db/d1/bun-sqlite";

type ManifestFile = {
  artifacts?: Array<{ artifactKey?: unknown }>;
};

export type ManifestArtifactKeyResult = {
  keys: string[];
  manifestCount: number;
};

export type D1ArtifactKeyResult = {
  keys: string[];
  exportUsed: boolean;
};

async function readJsonIfExists<T>(path: string): Promise<T | null> {
  try {
    const body = await readFile(path, "utf-8");
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

export async function collectManifestArtifactKeys(input: {
  artifactRoot: string;
  manifestDirs: readonly string[];
  month: string;
}): Promise<ManifestArtifactKeyResult> {
  const keys = new Set<string>();
  let manifestCount = 0;
  for (const dir of input.manifestDirs) {
    const manifestPath = join(input.artifactRoot, dir, input.month, "manifest.json");
    const manifest = await readJsonIfExists<ManifestFile>(manifestPath);
    if (manifest === null) continue;
    manifestCount += 1;
    for (const entry of manifest.artifacts ?? []) {
      if (typeof entry.artifactKey === "string" && entry.artifactKey.length > 0) {
        keys.add(entry.artifactKey);
      }
    }
  }
  return { keys: [...keys].sort(), manifestCount };
}

export async function collectD1ArtifactKeys(input: {
  month: string;
  schemaPath: string;
  seedPath: string;
}): Promise<D1ArtifactKeyResult> {
  let schemaSql: string;
  let seedSql: string;
  try {
    [schemaSql, seedSql] = await Promise.all([
      readFile(input.schemaPath, "utf-8"),
      readFile(input.seedPath, "utf-8"),
    ]);
  } catch {
    return { keys: [], exportUsed: false };
  }

  const sqlite = new Database(":memory:");
  try {
    sqlite.exec(schemaSql);
    sqlite.exec(seedSql);
    const db = createBunSqliteServingDb(sqlite);
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
  } finally {
    sqlite.close();
  }
}
