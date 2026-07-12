import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { segmentDaypartHistoryArtifactPath } from "@bp/analytics/artifacts";
import { buildSegmentDaypartHistoryArtifact } from "@bp/analytics/feature-history";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { loadSegmentDaypartHistoryLocalDbRows } from "@bp/pipeline-v2/local-db-aggregates";
import { Effect } from "effect";
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

export { segmentDaypartHistoryArtifactPath } from "@bp/analytics/artifacts";

export default defineCommand({
  path: ["build", "segment-daypart-history"],
  summary: "Build compact segment/daypart speed-history feature artifact.",
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
    featureCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    monthCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  async run({ input }) {
    const startMonth = isoMonth(input.options.startYear, input.options.startMonth);
    const endMonth = isoMonth(input.options.endYear, input.options.endMonth);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? segmentDaypartHistoryArtifactPath({ artifactRoot, startMonth, endMonth })
        : fromCliPath(input.options.output);
    const dbPath = input.options.db === undefined ? undefined : fromCliPath(input.options.db);
    return runLocalDbCommandBoundary({
      dbPath,
      localDbOptions: { readonly: true },
      command: "build.segment-daypart-history",
      operation: "buildSegmentDaypartHistoryArtifact",
      spanAttributes: {
        startMonth,
        endMonth,
      },
      run: async (local) => {
        const rows = loadSegmentDaypartHistoryLocalDbRows({
          sqlite: local.sqlite,
          startMonth,
          endMonth,
        });
        const artifact = buildSegmentDaypartHistoryArtifact({
          rows,
          startMonth,
          endMonth,
          generatedAt: new Date().toISOString(),
          dbPath: repoDisplayPath(local.path),
          artifactPath: repoDisplayPath(outputPath),
        });
        await mkdir(dirname(outputPath), { recursive: true });
        await writeJson(outputPath, artifact);
        return {
          startMonth,
          endMonth,
          outputPath: repoDisplayPath(outputPath),
          featureCount: artifact.summary.featureCount,
          routeCount: artifact.summary.routeCount,
          monthCount: artifact.window.monthCount,
        };
      },
    });
  },
});
