import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import * as z from "zod";
import { routeSliceKey } from "../../lib/artifacts.js";
import { isoMonth } from "../../lib/dates.js";
import { writeJson } from "../../lib/json.js";
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

const ArtifactManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    routeId: z.string().min(1),
    isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
    generatedAt: z.iso.datetime(),
    artifactRoot: z.string().min(1),
    artifacts: z.array(
      z
        .object({
          name: z.enum(artifactNames),
          path: z.string().min(1),
          artifactKey: z.string().min(1),
          contentType: z.literal("application/json"),
          byteLength: z.number().int().nonnegative(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ),
  })
  .strict();

type ArtifactManifestBuildArgs = {
  routeId?: string;
  year?: number;
  month?: number;
};

type ArtifactManifestBuildResult = {
  routeId: string;
  isoMonth: string;
  manifestPath: string;
  artifactCount: number;
};

function parseBuildArgs(args: ArtifactManifestBuildArgs): Required<ArtifactManifestBuildArgs> {
  return {
    routeId: args.routeId ?? "M1",
    year: args.year ?? 2026,
    month: args.month ?? 3,
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
  const manifestPath = join(artifactDir, "artifact-manifest.json");
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
  const manifest = ArtifactManifestSchema.parse({
    schemaVersion: 1,
    routeId: options.routeId.toUpperCase(),
    isoMonth: month,
    generatedAt: new Date().toISOString(),
    artifactRoot: artifactDir,
    artifacts,
  });

  await mkdir(artifactDir, { recursive: true });
  await writeJson(manifestPath, manifest);

  return {
    routeId: manifest.routeId,
    isoMonth: manifest.isoMonth,
    manifestPath,
    artifactCount: manifest.artifacts.length,
  };
}

export async function buildM1ArtifactManifestFromCli(
  args: string[],
): Promise<ArtifactManifestBuildResult> {
  return buildM1ArtifactManifest(parseCliArgs(args));
}
