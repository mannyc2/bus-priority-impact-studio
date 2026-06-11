import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { featureGrainMaterializationCoveragePath } from "@bp/applied-research/artifacts";
import {
  buildFeatureGrainMaterializationCoverage,
  type FeatureGrainMaterializationCoverage,
} from "@bp/applied-research/evaluation";
import { loadFeatureGrainMaterializationCoverageRows } from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

export { featureGrainMaterializationCoveragePath } from "@bp/applied-research/artifacts";
export type {
  FeatureGrainMaterializationCoverage,
  FeatureGrainMaterializationStatus,
} from "@bp/applied-research/evaluation";
export { buildFeatureGrainMaterializationCoverage } from "@bp/applied-research/evaluation";

export type RunFeatureGrainMaterializationCoverageInput = {
  readonly year: number;
  readonly month: number;
  readonly runId?: string;
  readonly dbPath?: string;
  readonly artifactRoot?: string;
  readonly outputPath?: string;
  readonly generatedAt?: string;
};

export type RunFeatureGrainMaterializationCoverageResult = {
  readonly releaseMonth: string;
  readonly runId: string;
  readonly outputPath: string;
  readonly artifact: FeatureGrainMaterializationCoverage;
};

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export async function runFeatureGrainMaterializationCoverage(
  input: RunFeatureGrainMaterializationCoverageInput,
): Promise<RunFeatureGrainMaterializationCoverageResult> {
  const releaseMonth = isoMonth(input.year, input.month);
  const runId = input.runId ?? `bus-observatory-${releaseMonth}`;
  const artifactRoot = input.artifactRoot ?? defaultArtifactRootPath();
  const outputPath =
    input.outputPath ??
    featureGrainMaterializationCoveragePath({
      artifactRoot,
      releaseMonth,
    });
  const dbPath = input.dbPath ?? defaultLocalPipelineDbPath();
  const sqlite = new BunDatabase(dbPath, { readonly: true });

  let artifact: FeatureGrainMaterializationCoverage;
  try {
    sqlite.exec("PRAGMA busy_timeout = 30000");
    artifact = buildFeatureGrainMaterializationCoverage({
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      releaseMonth,
      rows: loadFeatureGrainMaterializationCoverageRows({
        sqlite,
        releaseMonth,
        runId,
      }),
    });
  } finally {
    sqlite.close();
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);

  return {
    releaseMonth,
    runId,
    outputPath,
    artifact,
  };
}

const rowSchema = z.object({
  featureGrain: z.string(),
  scopesMaterialized: z.number().int().nonnegative(),
  fleetUniverse: z.number().int().nonnegative().nullable(),
  coverageShare: z.number().nullable(),
  status: z.enum(["complete", "partial", "sparse", "missing"]),
  note: z.string().nullable(),
});

export default defineCommand({
  path: ["audit", "feature-grain-materialization-coverage"],
  summary:
    "Emit per-feature-grain materialization coverage for the release month from current local DB support.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Materialization calendar year"),
      month: arg.positiveInt().default(3).describe("Materialization calendar month, 1-12"),
      runId: z.string().optional().describe("Observed GTFS-RT/import run id"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for coverage JSON"),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    runId: z.string(),
    outputPath: z.string(),
    grainCount: z.number().int().nonnegative(),
    completeCount: z.number().int().nonnegative(),
    partialCount: z.number().int().nonnegative(),
    sparseCount: z.number().int().nonnegative(),
    missingCount: z.number().int().nonnegative(),
    fleetUniverseKnownCount: z.number().int().nonnegative(),
    rows: z.array(rowSchema),
  }),
  async run({ input }) {
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? undefined
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined ? undefined : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? undefined : fromCliPath(input.options.db);
    const result = await runFeatureGrainMaterializationCoverage({
      year: input.options.year,
      month: input.options.month,
      ...(input.options.runId === undefined ? {} : { runId: input.options.runId }),
      ...(dbPath === undefined ? {} : { dbPath }),
      ...(artifactRoot === undefined ? {} : { artifactRoot }),
      ...(outputPath === undefined ? {} : { outputPath }),
    });

    return {
      releaseMonth: result.releaseMonth,
      runId: result.runId,
      outputPath: repoDisplayPath(result.outputPath),
      grainCount: result.artifact.summary.grainCount,
      completeCount: result.artifact.summary.completeCount,
      partialCount: result.artifact.summary.partialCount,
      sparseCount: result.artifact.summary.sparseCount,
      missingCount: result.artifact.summary.missingCount,
      fleetUniverseKnownCount: result.artifact.summary.fleetUniverseKnownCount,
      rows: [...result.artifact.rows],
    };
  },
});
