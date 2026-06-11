import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  DEFAULT_REGISTRY_DETECTOR_STUDY_ID,
  runRegistryDetectorStudyFromResolverPath,
} from "@bp/applied-research/detector-runs";
import { loadDetectorStudyLocalDbRows } from "@bp/applied-research/local-db";
import { replaceFindingsForMonth } from "@bp/db/local";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath, openLocalPipelineDb } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

export type { RegistryDetectorRunArtifact } from "@bp/applied-research/detector-runs";

const FEATURE_COUNT_SUMMARY_KEY = "featureCount";
const LOADED_FEATURE_COUNT_SUMMARY_KEY = "loadedFeatureCount";

// Strict boolean flag for destructive DB writes. `z.coerce.boolean()` is unsafe here because
// `Boolean("false") === true`, so `--writeDb false` would silently write the DB. Only an explicit
// true/1 (or a real boolean) enables the write; everything else — "false", "0", "", omitted — is
// false. Exported for focused parser tests.
export const writeDbFlagSchema = z
  .union([z.boolean(), z.string()])
  .default(false)
  .transform((value) => value === true || value === "true" || value === "1");

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export function detectorRunArtifactPath(input: {
  artifactRoot: string;
  releaseMonth: string;
  detectorId: string;
}): string {
  return join(
    input.artifactRoot,
    "detector-runs",
    input.releaseMonth,
    `${input.detectorId}-run.json`,
  );
}

export default defineCommand({
  path: ["findings", "run-detector"],
  summary: "Run a registry detector study through @bp/applied-research.",
  input: {
    options: dbOptions.extend({
      detectorId: z.string().default(DEFAULT_REGISTRY_DETECTOR_STUDY_ID),
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .default("2023-04"),
      runId: z.string().optional(),
      observedRunId: z.string().optional(),
      routeId: z.string().optional(),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
      writeDb: writeDbFlagSchema,
      candidateLimit: arg.positiveInt().optional(),
    }),
  },
  output: z.object({
    detectorId: z.string(),
    releaseMonth: z.string(),
    outputPath: z.string(),
    wroteDb: z.boolean(),
    featureCount: z.number().int().nonnegative(),
    candidateCount: z.number().int().nonnegative(),
    coverageCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const detectorId = input.options.detectorId;
    const detectorRunId = input.options.runId ?? `${detectorId}-${releaseMonth}`;
    const observedRunId = input.options.observedRunId ?? `bus-observatory-${releaseMonth}`;
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? detectorRunArtifactPath({
            artifactRoot,
            releaseMonth,
            detectorId,
          })
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const local = await openLocalPipelineDb(dbPath);
    try {
      const localRows = loadDetectorStudyLocalDbRows({
        sqlite: local.sqlite,
        detectorId,
        releaseMonth,
        historyStartMonth: input.options.historyStartMonth,
        observedRunId,
        ...(input.options.routeId === undefined ? {} : { routeId: input.options.routeId }),
      });
      const { artifact, output } = await runRegistryDetectorStudyFromResolverPath({
        metadata: {
          detectorId,
          detectorRunId,
          releaseMonth,
          historyStartMonth: input.options.historyStartMonth,
          generatedAt: new Date().toISOString(),
          dbPath: repoDisplayPath(dbPath),
          artifactPath: repoDisplayPath(outputPath),
          wroteDb: input.options.writeDb,
          ...(input.options.candidateLimit === undefined
            ? {}
            : { candidateLimit: input.options.candidateLimit }),
        },
        context: {
          detectorId,
          artifactRoot,
          releaseMonth,
          historyStartMonth: input.options.historyStartMonth,
          observedRunId,
          sqlite: local.sqlite,
          ...(input.options.routeId === undefined ? {} : { routeId: input.options.routeId }),
        },
        localRows,
      });
      if (input.options.writeDb) {
        await replaceFindingsForMonth(local.db, {
          month: releaseMonth,
          detectorId,
          candidates: output.candidates,
          evidence: output.evidence,
          coverage: output.coverage,
        });
      }
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      return {
        detectorId,
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        wroteDb: artifact.wroteDb,
        featureCount: Number(
          artifact.inputSummary[FEATURE_COUNT_SUMMARY_KEY] ??
            artifact.inputSummary[LOADED_FEATURE_COUNT_SUMMARY_KEY] ??
            0,
        ),
        candidateCount: artifact.outputSummary.candidateCount,
        coverageCount: artifact.outputSummary.coverageCount,
      };
    } finally {
      local.sqlite.close();
    }
  },
});
