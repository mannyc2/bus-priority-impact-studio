import { Effect } from "effect";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  buildDocumentAnchorEventsForRouteEvaluation,
  defaultInterventionEvaluationComparisonRouteCount,
  defaultInterventionEvaluationMinSampleMonths,
  defaultInterventionEvaluationWindowMonths,
  documentOperationalDateSourceId,
  parseBusLaneOpenDates,
} from "@bp/pipeline-v2/local-db-aggregates";
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
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        year: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
          .annotate({ description: "Calendar year" }),
        month: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
          .annotate({ description: "Calendar month, 1-12" }),
        routeUniverseYear: Schema.optionalKey(arg.positiveInt()).annotate({
          description: "Year for route universe/treatment inventory; defaults to analysis year",
        }),
        routeUniverseMonth: Schema.optionalKey(arg.positiveInt()).annotate({
          description: "Month for route universe/treatment inventory; defaults to analysis month",
        }),
        documentOperationalDateAssertionsPath: Schema.optionalKey(Schema.String).annotate({
          description: "Anchor-ready wiki operational-date assertions artifact path",
        }),
        windowMonths: arg
          .positiveInt()
          .pipe(
            Schema.withDecodingDefaultTypeKey(
              Effect.succeed(defaultInterventionEvaluationWindowMonths),
            ),
          )
          .annotate({ description: "Pre/post window length in months" }),
        minSampleMonths: arg
          .positiveInt()
          .pipe(
            Schema.withDecodingDefaultTypeKey(
              Effect.succeed(defaultInterventionEvaluationMinSampleMonths),
            ),
          )
          .annotate({ description: "Minimum monthly samples per side" }),
        comparisonRouteCount: arg
          .positiveInt()
          .pipe(
            Schema.withDecodingDefaultTypeKey(
              Effect.succeed(defaultInterventionEvaluationComparisonRouteCount),
            ),
          )
          .annotate({ description: "Number of comparison routes for peer adjustment" }),
      },
    }),
  },
  output: Schema.Struct({
    isoMonth: Schema.String,
    routeUniverseMonth: Schema.String,
    routeCount: Schema.Number,
    eventCount: Schema.Number,
    comparisonCount: Schema.Number,
    documentAnchorEventCount: Schema.Number,
    documentAnchorComparisonCount: Schema.Number,
    evaluatedComparisonCount: Schema.Number,
    futureComparisonCount: Schema.Number,
    insufficientComparisonCount: Schema.Number,
    sourceGapComparisonCount: Schema.Number,
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
