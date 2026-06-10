import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  treatmentEventCandidateCausalReviewPath,
  treatmentEventPanelArtifactPath,
} from "@bp/applied-research/artifacts";
import {
  buildTreatmentEventCandidateCausalReviewProjection,
  buildTreatmentEventPanelArtifactV1,
} from "@bp/applied-research/feature-resolvers";
import { loadDetectorStudyLocalDbRows } from "@bp/applied-research/local-db";
import { KNOWN_DETECTOR_IDS } from "@bp/domain/findings";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

// Detector id sourced from the @bp/domain allowlist; pipeline-v2 must not import @bp/analytics
// directly (production-boundaries harness enforces this). The annotation makes it a compile error if
// the id is ever dropped from KNOWN_DETECTOR_IDS.
const INTERVENTION_EVENT_STUDY_DETECTOR_ID: (typeof KNOWN_DETECTOR_IDS)[number] =
  "intervention_event_study";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export {
  treatmentEventCandidateCausalReviewPath,
  treatmentEventPanelArtifactPath,
} from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "treatment-event-panel"],
  summary: "Build treatment event panel model artifact from intervention comparison rows.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .default("2023-04"),
      routeId: z.string().optional(),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    reviewOutputPath: z.string(),
    panelRowCount: z.number().int().nonnegative(),
    supportedRowCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    eligibleControlRowCount: z.number().int().nonnegative(),
    effectEstimateRowCount: z.number().int().nonnegative(),
    candidateCausalEligibleRowCount: z.number().int().nonnegative(),
    candidateCausalReviewRowCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? treatmentEventPanelArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const reviewOutputPath = treatmentEventCandidateCausalReviewPath({
      artifactRoot,
      historyStartMonth: input.options.historyStartMonth,
      releaseMonth,
    });
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    try {
      const rows = loadDetectorStudyLocalDbRows({
        sqlite,
        detectorId: INTERVENTION_EVENT_STUDY_DETECTOR_ID,
        releaseMonth,
        historyStartMonth: input.options.historyStartMonth,
        ...(input.options.routeId === undefined ? {} : { routeId: input.options.routeId }),
      });
      const artifact = buildTreatmentEventPanelArtifactV1({
        rows: rows.interventionComparisonRows ?? [],
        routeMetricHistoryRows: rows.routeMetricHistoryRows ?? [],
        generatedAt: new Date().toISOString(),
        artifactPath: repoDisplayPath(outputPath),
        spec: {
          panelId: "treatment_event_panel_v1",
          historyStartMonth: input.options.historyStartMonth,
          releaseMonth,
          ...(input.options.routeId === undefined ? {} : { routeId: input.options.routeId }),
        },
      });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeJson(outputPath, artifact);
      const reviewProjection = buildTreatmentEventCandidateCausalReviewProjection(artifact);
      await mkdir(dirname(reviewOutputPath), { recursive: true });
      await writeJson(reviewOutputPath, reviewProjection);
      return {
        releaseMonth,
        outputPath: repoDisplayPath(outputPath),
        reviewOutputPath: repoDisplayPath(reviewOutputPath),
        panelRowCount: artifact.summary.panelRowCount,
        supportedRowCount: artifact.summary.supportedRowCount,
        routeCount: artifact.summary.routeCount,
        eventCount: artifact.summary.eventCount,
        eligibleControlRowCount: artifact.summary.eligibleControlRowCount,
        effectEstimateRowCount: artifact.summary.effectEstimateRowCount,
        candidateCausalEligibleRowCount: artifact.summary.candidateCausalEligibleRowCount,
        candidateCausalReviewRowCount:
          reviewProjection.summary.candidateCausalEligibleRowCount,
      };
    } finally {
      sqlite.close();
    }
  },
});
