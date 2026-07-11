import { Effect } from "effect";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  routeHourlyProfileArtifactPath,
  routeHourlyProfileRouteArtifactPath,
} from "@bp/analytics/artifacts";
import {
  buildRouteHourlyProfileArtifact,
  buildStudioRouteHourlyProfileArtifacts,
} from "@bp/analytics/feature-history";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import {
  loadRouteHourlyProfileHourRows,
  loadRouteHourlyProfileLocalDbRows,
  loadRouteHourlyProfileReliabilitySampleRows,
  loadRouteHourlyProfileSlowestWindowRows,
} from "@bp/pipeline-v2/local-db-aggregates";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export { routeHourlyProfileArtifactPath } from "@bp/analytics/artifacts";

export default defineCommand({
  path: ["build", "route-hourly-profile"],
  summary: "Build compact route-hourly ridership profile feature artifact.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        startYear: arg.positiveInt().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2023))),
        startMonth: arg.positiveInt().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(4))),
        endYear: arg.positiveInt().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026))),
        endMonth: arg.positiveInt().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3))),
        artifactRoot: Schema.optionalKey(Schema.String),
        output: Schema.optionalKey(Schema.String),
      },
    }),
  },
  output: Schema.Struct({
    startMonth: Schema.String,
    endMonth: Schema.String,
    outputPath: Schema.String,
    profileCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    monthCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    routeArtifactCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  async run({ input }) {
    const startMonth = isoMonth(input.options.startYear, input.options.startMonth);
    const endMonth = isoMonth(input.options.endYear, input.options.endMonth);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const path =
      input.options.output === undefined
        ? routeHourlyProfileArtifactPath({ artifactRoot, startMonth, endMonth })
        : fromCliPath(input.options.output);
    const dbPath = input.options.db === undefined ? undefined : fromCliPath(input.options.db);
    return runLocalDbCommandBoundary({
      dbPath,
      localDbOptions: { readonly: true },
      command: "build.route-hourly-profile",
      operation: "buildRouteHourlyProfileArtifact",
      spanAttributes: {
        startMonth,
        endMonth,
      },
      run: async (local) => {
        const generatedAt = new Date().toISOString();
        const rows = loadRouteHourlyProfileLocalDbRows({
          sqlite: local.sqlite,
          startMonth,
          endMonth,
        });
        const hourRows = loadRouteHourlyProfileHourRows({
          sqlite: local.sqlite,
          startMonth,
          endMonth,
        });
        const slowestWindowRows = loadRouteHourlyProfileSlowestWindowRows({
          sqlite: local.sqlite,
          startMonth,
          endMonth,
        });
        const reliabilitySampleRows = loadRouteHourlyProfileReliabilitySampleRows({
          sqlite: local.sqlite,
          startMonth,
          endMonth,
        });
        const artifact = buildRouteHourlyProfileArtifact({
          rows,
          startMonth,
          endMonth,
          generatedAt,
          dbPath: repoDisplayPath(local.path),
          artifactPath: repoDisplayPath(path),
        });
        const routeArtifacts = buildStudioRouteHourlyProfileArtifacts({
          profiles: rows,
          hours: hourRows,
          slowestWindows: slowestWindowRows,
          reliabilitySamples: reliabilitySampleRows,
          startMonth,
          endMonth,
          generatedAt,
          dbPath: repoDisplayPath(local.path),
          artifactPathForRoute: (routeSlug) =>
            repoDisplayPath(routeHourlyProfileRouteArtifactPath({ artifactRoot, routeSlug })),
        });
        await mkdir(dirname(path), { recursive: true });
        await writeJson(path, artifact);
        for (const routeArtifact of routeArtifacts) {
          const routePath = routeHourlyProfileRouteArtifactPath({
            artifactRoot,
            routeSlug: routeArtifact.routeSlug,
          });
          await mkdir(dirname(routePath), { recursive: true });
          await writeJson(routePath, routeArtifact);
        }
        return {
          startMonth,
          endMonth,
          outputPath: repoDisplayPath(path),
          profileCount: artifact.summary.profileCount,
          routeCount: artifact.summary.routeCount,
          monthCount: artifact.window.monthCount,
          routeArtifactCount: routeArtifacts.length,
        };
      },
    });
  },
});
