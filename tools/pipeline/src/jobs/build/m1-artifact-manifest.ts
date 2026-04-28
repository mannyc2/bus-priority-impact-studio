import { replaceRouteArtifacts } from "@bp/db/local";
import {
  fileDigest,
  routeSliceArtifactKey,
  routeSliceArtifactNames,
  routeSliceArtifactPath,
} from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";

type ArtifactManifestBuildArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  dbPath?: string;
};

type ArtifactManifestBuildResult = {
  routeId: string;
  isoMonth: string;
  artifactCount: number;
};

function parseBuildArgs(args: ArtifactManifestBuildArgs): Required<ArtifactManifestBuildArgs> {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

function parseCliArgs(args: string[]): ArtifactManifestBuildArgs {
  const output: ArtifactManifestBuildArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--route" && value !== undefined) {
      output.routeId = value;
      index += 1;
      continue;
    }

    if (arg === "--year" && value !== undefined) {
      output.year = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--month" && value !== undefined) {
      output.month = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--db" && value !== undefined) {
      output.dbPath = fromCliPath(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }

  return output;
}

export async function buildM1ArtifactManifest(
  args: ArtifactManifestBuildArgs = {},
): Promise<ArtifactManifestBuildResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const artifacts = await Promise.all(
    routeSliceArtifactNames.map(async (name) => {
      const path = routeSliceArtifactPath(options.routeId, month, name);
      const digest = await fileDigest(path);

      return {
        name,
        path,
        artifactKey: routeSliceArtifactKey(options.routeId, month, name),
        contentType: "application/json" as const,
        ...digest,
      };
    }),
  );
  const routeId = options.routeId.toUpperCase();

  const local = await openLocalPipelineDb(options.dbPath);
  try {
    await replaceRouteArtifacts(
      local.db,
      routeId,
      month,
      artifacts.map((artifact) => ({
        routeId,
        month,
        artifactName: artifact.name,
        artifactKey: artifact.artifactKey,
        contentType: artifact.contentType,
        byteLength: artifact.byteLength,
        sha256: artifact.sha256,
      })),
    );
  } finally {
    local.sqlite.close();
  }

  return {
    routeId,
    isoMonth: month,
    artifactCount: artifacts.length,
  };
}

export async function buildM1ArtifactManifestFromCli(
  args: string[],
): Promise<ArtifactManifestBuildResult> {
  return buildM1ArtifactManifest(parseCliArgs(args));
}
