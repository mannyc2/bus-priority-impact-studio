import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { routeHourlyProfileArtifactPath } from "@bp/analytics/artifacts";
import { buildRouteHourlyProfileArtifact } from "@bp/analytics/feature-history";
import { loadRouteHourlyProfileLocalDbRows } from "@bp/pipeline-v2/local-db-aggregates";
import { arg, defineCommand, z } from "@liche/core";
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
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023),
      startMonth: arg.positiveInt().default(4),
      endYear: arg.positiveInt().default(2026),
      endMonth: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    startMonth: z.string(),
    endMonth: z.string(),
    outputPath: z.string(),
    profileCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
    monthCount: z.number().int().nonnegative(),
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
        const rows = loadRouteHourlyProfileLocalDbRows({
          sqlite: local.sqlite,
          startMonth,
          endMonth,
        });
        const artifact = buildRouteHourlyProfileArtifact({
          rows,
          startMonth,
          endMonth,
          generatedAt: new Date().toISOString(),
          dbPath: repoDisplayPath(local.path),
          artifactPath: repoDisplayPath(path),
        });
        await mkdir(dirname(path), { recursive: true });
        await writeJson(path, artifact);
        return {
          startMonth,
          endMonth,
          outputPath: repoDisplayPath(path),
          profileCount: artifact.summary.profileCount,
          routeCount: artifact.summary.routeCount,
          monthCount: artifact.window.monthCount,
        };
      },
    });
  },
});
