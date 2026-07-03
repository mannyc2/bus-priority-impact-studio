import {
  buildDocumentAnchorEventsForRouteEvaluation,
  defaultInterventionEvaluationComparisonRouteCount,
  defaultInterventionEvaluationMinSampleMonths,
  defaultInterventionEvaluationWindowMonths,
  documentOperationalDateSourceId,
  parseBusLaneOpenDates,
} from "@bp/pipeline-v2/local-db-aggregates";
import { arg, defineCommand, z } from "@liche/core";
import {
  defaultDocumentOperationalDateAssertionsPath,
  makeRouteLocalDbCommandLayer,
  runRouteInterventionEvaluation,
  runRouteInterventionEvaluationCommand,
} from "../../effect/route-local-db.ts";
import { runPipelineEffect } from "../../effect/runtime.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";

export type { RouteInterventionEvaluationResult } from "@bp/pipeline-v2/local-db-aggregates";
export {
  buildDocumentAnchorEventsForRouteEvaluation,
  documentOperationalDateSourceId,
  parseBusLaneOpenDates,
  runRouteInterventionEvaluation,
};

export default defineCommand({
  path: ["route", "intervention-evaluation"],
  summary:
    "Evaluate route-level before/after for ACE, bus-lane, and document-anchor interventions.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      routeUniverseYear: arg
        .positiveInt()
        .optional()
        .describe("Year for route universe/treatment inventory; defaults to analysis year"),
      routeUniverseMonth: arg
        .positiveInt()
        .optional()
        .describe("Month for route universe/treatment inventory; defaults to analysis month"),
      documentOperationalDateAssertionsPath: z
        .string()
        .optional()
        .describe("Anchor-ready wiki operational-date assertions artifact path"),
      windowMonths: arg
        .positiveInt()
        .default(defaultInterventionEvaluationWindowMonths)
        .describe("Pre/post window length in months"),
      minSampleMonths: arg
        .positiveInt()
        .default(defaultInterventionEvaluationMinSampleMonths)
        .describe("Minimum monthly samples per side"),
      comparisonRouteCount: arg
        .positiveInt()
        .default(defaultInterventionEvaluationComparisonRouteCount)
        .describe("Number of comparison routes for peer adjustment"),
    }),
  },
  output: z.object({
    isoMonth: z.string(),
    routeUniverseMonth: z.string(),
    routeCount: z.number(),
    eventCount: z.number(),
    comparisonCount: z.number(),
    documentAnchorEventCount: z.number(),
    documentAnchorComparisonCount: z.number(),
    evaluatedComparisonCount: z.number(),
    futureComparisonCount: z.number(),
    insufficientComparisonCount: z.number(),
    sourceGapComparisonCount: z.number(),
  }),
  async run({ input }) {
    const documentOperationalDateAssertionsPath =
      input.options.documentOperationalDateAssertionsPath === undefined
        ? defaultDocumentOperationalDateAssertionsPath
        : fromCliPath(input.options.documentOperationalDateAssertionsPath);
    return runPipelineEffect(
      runRouteInterventionEvaluationCommand({
        year: input.options.year,
        month: input.options.month,
        routeUniverseYear: input.options.routeUniverseYear,
        routeUniverseMonth: input.options.routeUniverseMonth,
        windowMonths: input.options.windowMonths,
        minSampleMonths: input.options.minSampleMonths,
        comparisonRouteCount: input.options.comparisonRouteCount,
        documentOperationalDateAssertionsPath,
      }),
      makeRouteLocalDbCommandLayer({
        dbPath: input.options.db,
      }),
    );
  },
});
