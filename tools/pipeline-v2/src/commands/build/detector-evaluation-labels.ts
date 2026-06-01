import type { Database } from "bun:sqlite";
import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  buildDetectorEvaluationLabelSetArtifact,
  type DetectorEvaluationCoverageRow,
} from "@bp/applied-research/evaluation";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function queryCoverageRows(input: {
  sqlite: Database;
  releaseMonth: string;
  maxCleanNoHitPerDetector: number | null;
  maxMissingDataScopesPerDetector: number;
}): DetectorEvaluationCoverageRow[] {
  const cleanLimit = input.maxCleanNoHitPerDetector ?? 2_147_483_647;
  return input.sqlite
    .query(
      `
        WITH ranked AS (
          SELECT
            detector_id,
            month,
            scope_kind,
            scope_id,
            outcome,
            reason_code,
            reason,
            inputs_seen_json,
            inputs_expected_json,
            ROW_NUMBER() OVER (
              PARTITION BY detector_id, outcome
              ORDER BY scope_kind, scope_id
            ) AS row_number
          FROM local_finding_coverage_audit
          WHERE month = ?
            AND outcome IN (
              'clean_no_hit',
              'skipped_missing_input',
              'skipped_failed_join',
              'source_lag'
            )
        )
        SELECT
          detector_id,
          month,
          scope_kind,
          scope_id,
          outcome,
          reason_code,
          reason,
          inputs_seen_json,
          inputs_expected_json
        FROM ranked
        WHERE
          (outcome = 'clean_no_hit' AND row_number <= ?)
          OR (outcome <> 'clean_no_hit' AND row_number <= ?)
        ORDER BY detector_id, outcome, scope_kind, scope_id
      `,
    )
    .all(
      input.releaseMonth,
      cleanLimit,
      input.maxMissingDataScopesPerDetector,
    ) as DetectorEvaluationCoverageRow[];
}

export function detectorEvaluationLabelsPath(
  artifactRoot: string,
  historyStartMonth: string,
  releaseMonth: string,
): string {
  return join(
    artifactRoot,
    "detector-evaluation",
    `${historyStartMonth}_to_${releaseMonth}`,
    releaseMonth,
    "detector-evaluation-labels.json",
  );
}

export default defineCommand({
  path: ["build", "detector-evaluation-labels"],
  summary: "Build deterministic detector evaluation negative, holdout, and missing-data labels.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z.string().default("2023-04"),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
      holdoutModulo: arg.positiveInt().default(5),
      maxCleanNoHitPerDetector: z.number().int().positive().nullable().default(5_000),
      maxMissingDataScopesPerDetector: arg.positiveInt().default(5_000),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    confirmedNegativeCount: z.number().int().nonnegative(),
    holdoutNegativeCount: z.number().int().nonnegative(),
    missingDataScopeCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? detectorEvaluationLabelsPath(artifactRoot, input.options.historyStartMonth, releaseMonth)
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    sqlite.exec("PRAGMA busy_timeout = 5000");
    let rows: DetectorEvaluationCoverageRow[];
    try {
      rows = queryCoverageRows({
        sqlite,
        releaseMonth,
        maxCleanNoHitPerDetector: input.options.maxCleanNoHitPerDetector,
        maxMissingDataScopesPerDetector: input.options.maxMissingDataScopesPerDetector,
      });
    } finally {
      sqlite.close();
    }
    const artifact = buildDetectorEvaluationLabelSetArtifact({
      rows,
      releaseMonth,
      generatedAt: new Date().toISOString(),
      dbPath: repoDisplayPath(dbPath),
      artifactPath: repoDisplayPath(outputPath),
      holdoutModulo: input.options.holdoutModulo,
      maxCleanNoHitPerDetector: input.options.maxCleanNoHitPerDetector,
      maxMissingDataScopesPerDetector: input.options.maxMissingDataScopesPerDetector,
    });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      confirmedNegativeCount: artifact.summary.confirmedNegativeCount,
      holdoutNegativeCount: artifact.summary.holdoutNegativeCount,
      missingDataScopeCount: artifact.summary.missingDataScopeCount,
    };
  },
});
