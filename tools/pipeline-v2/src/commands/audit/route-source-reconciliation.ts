import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { routeSourceReconciliationPath } from "@bp/analytics/artifacts";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { buildRouteSourceReconciliation } from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

export { routeSourceReconciliationPath } from "@bp/analytics/artifacts";
export {
  buildRouteSourceReconciliation,
  type RouteAliasCandidate,
  type RouteSourceReconciliationArtifact,
  type RouteSourceReconciliationRoute,
  type ScheduleSourceYearRoute,
} from "@bp/pipeline-v2/local-db-aggregates";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export default defineCommand({
  path: ["audit", "route-source-reconciliation"],
  summary: "Reconcile current route catalog IDs against source-backed route universes.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        year: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026)))
          .annotate({ description: "Release calendar year" }),
        month: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3)))
          .annotate({ description: "Release calendar month, 1-12" }),
        historyStartMonth: Schema.String.pipe(
          Schema.withDecodingDefaultTypeKey(Effect.succeed("2023-04")),
        ).annotate({ description: "Start month for history window" }),
        runId: Schema.optionalKey(Schema.String).annotate({
          description: "Observed GTFS-RT/import run id",
        }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
        output: Schema.optionalKey(Schema.String).annotate({ description: "Override output path" }),
      },
    }),
  },
  output: Schema.Struct({
    releaseMonth: Schema.String,
    runId: Schema.String,
    outputPath: Schema.String,
    routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    sourceAbsentRouteCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    aliasCandidateCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const historyStartMonth = input.options.historyStartMonth;
    const runId = input.options.runId ?? `bus-observatory-${releaseMonth}`;
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? routeSourceReconciliationPath({ artifactRoot, historyStartMonth, releaseMonth })
        : fromCliPath(input.options.output);
    const dbPath = input.options.db === undefined ? undefined : fromCliPath(input.options.db);
    return runLocalDbCommandBoundary({
      dbPath,
      localDbOptions: { readonly: true },
      command: "audit.route-source-reconciliation",
      operation: "buildRouteSourceReconciliation",
      spanAttributes: {
        releaseMonth,
        historyStartMonth,
        runId,
      },
      run: async (local) => {
        const artifact = buildRouteSourceReconciliation({
          sqlite: local.sqlite,
          releaseMonth,
          historyStartMonth,
          runId,
          generatedAt: new Date().toISOString(),
          dbPath: repoDisplayPath(local.path),
          artifactPath: repoDisplayPath(outputPath),
        });
        await mkdir(dirname(outputPath), { recursive: true });
        await writeJson(outputPath, artifact);
        return {
          releaseMonth,
          runId,
          outputPath: repoDisplayPath(outputPath),
          routeCount: artifact.routes.length,
          sourceAbsentRouteCount: artifact.sourceAbsentRouteIds.length,
          aliasCandidateCount: artifact.aliasCandidates.length,
        };
      },
    });
  },
});
