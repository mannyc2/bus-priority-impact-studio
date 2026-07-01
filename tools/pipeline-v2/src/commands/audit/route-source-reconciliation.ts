import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { routeSourceReconciliationPath } from "@bp/analytics/artifacts";
import { buildRouteSourceReconciliation } from "@bp/pipeline-v2/local-db-aggregates";
import { arg, defineCommand, z } from "@liche/core";
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
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Release calendar year"),
      month: arg.positiveInt().default(3).describe("Release calendar month, 1-12"),
      historyStartMonth: z.string().default("2023-04").describe("Start month for history window"),
      runId: z.string().optional().describe("Observed GTFS-RT/import run id"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path"),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    runId: z.string(),
    outputPath: z.string(),
    routeCount: z.number().int().nonnegative(),
    sourceAbsentRouteCount: z.number().int().nonnegative(),
    aliasCandidateCount: z.number().int().nonnegative(),
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
