import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { replaceRouteArtifacts } from "@bp/db/local";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { fromRepoRoot } from "../../source-manifest.js";

const artifactNames = [
  "summary.json",
  "hotspots.json",
  "ridership-profile.json",
  "speed-profile.json",
  "intervention-overlay.json",
  "bus-lane-overlay.json",
  "schedule-comparison.json",
  "route-scorecard.json",
  "route-brief-input.json",
] as const;

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

async function fileDigest(path: string): Promise<{ byteLength: number; sha256: string }> {
  const bytes = Buffer.from(await Bun.file(path).arrayBuffer());

  return {
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function buildM1ArtifactManifest(
  args: ArtifactManifestBuildArgs = {},
): Promise<ArtifactManifestBuildResult> {
  const options = parseBuildArgs(args);
  const month = isoMonth(options.year, options.month);
  const key = routeSliceKey(options.routeId, month);
  const artifactDir = fromRepoRoot(join("data/artifacts/route-slices", key));
  const artifacts = await Promise.all(
    artifactNames.map(async (name) => {
      const path = join(artifactDir, name);
      const digest = await fileDigest(path);

      return {
        name,
        path,
        artifactKey: `route-slices/${key}/${basename(path)}`,
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
