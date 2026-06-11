import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { evaluationArtifactManifestPath } from "@bp/applied-research/artifacts";
import {
  buildEvaluationArtifactManifest,
  buildEvaluationJsonArtifacts,
  type EvaluationArtifactExpectedRowCounts,
  type EvaluationArtifactManifest,
  type EvaluationArtifactsResult,
  type EvaluationArtifactVerification,
  readEvaluationArtifactManifest,
  referencedEvaluationInterventionEvents,
  verifyEvaluationArtifactManifest,
} from "@bp/applied-research/evaluation";
import type {
  LocalCorridorInterventionContext,
  LocalInterventionEvent,
  LocalRouteInterventionComparison,
  LocalRouteObservedReliabilitySummary,
} from "@bp/db/local";
import {
  listCorridorInterventionContexts,
  listInterventionEvents,
  listRouteInterventionComparisons,
  listRouteObservedReliabilitySummaries,
} from "@bp/db/local";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

export type {
  EvaluationArtifactExpectedRowCounts,
  EvaluationArtifactManifest,
  EvaluationArtifactsResult,
  EvaluationArtifactVerification,
};
export {
  evaluationArtifactManifestPath,
  readEvaluationArtifactManifest,
  verifyEvaluationArtifactManifest,
};

async function readEvaluationRows(input: { local: OpenLocalPipelineDb; month: string }): Promise<{
  observedReliability: LocalRouteObservedReliabilitySummary[];
  interventionEvents: LocalInterventionEvent[];
  interventionComparisons: LocalRouteInterventionComparison[];
  corridorInterventionContexts: LocalCorridorInterventionContext[];
}> {
  const [
    observedReliability,
    interventionEvents,
    interventionComparisons,
    corridorInterventionContexts,
  ] = await Promise.all([
    listRouteObservedReliabilitySummaries(input.local.db, input.month),
    listInterventionEvents(input.local.db),
    listRouteInterventionComparisons(input.local.db, input.month),
    listCorridorInterventionContexts(input.local.db, input.month),
  ]);
  return {
    observedReliability,
    interventionEvents: referencedEvaluationInterventionEvents({
      events: interventionEvents,
      comparisons: interventionComparisons,
    }) as LocalInterventionEvent[],
    interventionComparisons,
    corridorInterventionContexts,
  };
}

export async function runEvaluationArtifacts(inputs: {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  artifactRoot?: string | undefined;
}): Promise<EvaluationArtifactsResult> {
  const month = isoMonth(inputs.year, inputs.month);
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();
  const generatedAt = new Date().toISOString();
  const rows = await readEvaluationRows({ local: inputs.local, month });
  const { artifacts } = buildEvaluationJsonArtifacts({
    artifactRoot,
    month,
    generatedAt,
    rows,
  });
  const manifest = buildEvaluationArtifactManifest({
    month,
    generatedAt,
    artifacts: artifacts.map((artifact) => artifact.entry),
  });

  await Promise.all(
    artifacts.map(async (artifact) => {
      await mkdir(dirname(artifact.path), { recursive: true });
      await Bun.write(artifact.path, artifact.bytes);
    }),
  );
  const manifestPath = evaluationArtifactManifestPath(artifactRoot, month);
  await mkdir(dirname(manifestPath), { recursive: true });
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    isoMonth: month,
    manifestPath,
    artifactCount: manifest.artifactCount,
    totalByteLength: manifest.totalByteLength,
    observedReliabilityRowCount: rows.observedReliability.length,
    interventionEventCount: rows.interventionEvents.length,
    interventionComparisonCount: rows.interventionComparisons.length,
    corridorInterventionContextRowCount: rows.corridorInterventionContexts.length,
  };
}

export default defineCommand({
  path: ["evaluation", "artifacts"],
  summary: "Write evaluation JSON artifacts (observed reliability + interventions) and manifest.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    isoMonth: z.string(),
    manifestPath: z.string(),
    artifactCount: z.number(),
    totalByteLength: z.number(),
    observedReliabilityRowCount: z.number(),
    interventionEventCount: z.number(),
    interventionComparisonCount: z.number(),
    corridorInterventionContextRowCount: z.number(),
  }),
  async run({ ctx, input }) {
    return runEvaluationArtifacts({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
    });
  },
});
