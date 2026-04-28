import { replaceRouteArtifacts } from "@bp/db/local";
import {
  fileDigest,
  routeSliceArtifactKey,
  routeSliceArtifactNames,
  routeSliceArtifactPath,
} from "../../lib/artifacts.js";
import {
  dbOption,
  monthOption,
  parseCliOptions,
  routeOption,
  yearOption,
} from "../../lib/cli-args.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, withLocalPipelineDb } from "../../lib/local-db.js";
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
  return parseCliOptions<ArtifactManifestBuildArgs>(args, {}, [
    routeOption(),
    yearOption(),
    monthOption(),
    dbOption(fromCliPath),
  ]);
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

  await withLocalPipelineDb(options.dbPath, (local) =>
    replaceRouteArtifacts(
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
    ),
  );

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
