import { Effect } from "effect";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { segmentDaypartPanelArtifactPath } from "@bp/analytics/artifacts";
import {
  buildSegmentDaypartPanelArtifact,
  SEGMENT_DAYPART_PANEL_V1_ID,
} from "@bp/analytics/feature-history";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { loadSegmentDaypartHistoryLocalDbRows } from "@bp/pipeline-v2/local-db-aggregates";
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

export { segmentDaypartPanelArtifactPath } from "@bp/analytics/artifacts";

export default defineCommand({
  path: ["build", "segment-daypart-panel"],
  summary: "Build the segment/daypart/month panel artifact.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        startYear: arg.positiveInt().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2023))),
        startMonth: arg.positiveInt().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(4))),
        endYear: arg.positiveInt().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026))),
        endMonth: arg.positiveInt().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3))),
        minObservationCount: arg
          .positiveInt()
          .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(10))),
        artifactRoot: Schema.optionalKey(Schema.String),
        output: Schema.optionalKey(Schema.String),
      },
    }),
  },
  output: Schema.Struct({
    releaseMonth: Schema.String,
    outputPath: Schema.String,
    panelRowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    eligiblePanelRowCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    releaseMonthRowCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    monthCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  async run({ input }) {
    const startMonth = isoMonth(input.options.startYear, input.options.startMonth);
    const endMonth = isoMonth(input.options.endYear, input.options.endMonth);
    const releaseMonth = endMonth;
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? segmentDaypartPanelArtifactPath({ artifactRoot, startMonth, releaseMonth })
        : fromCliPath(input.options.output);
    const dbPath = input.options.db === undefined ? undefined : fromCliPath(input.options.db);
    return runLocalDbCommandBoundary({
      dbPath,
      localDbOptions: { readonly: true },
      command: "build.segment-daypart-panel",
      operation: "buildSegmentDaypartPanelArtifact",
      spanAttributes: {
        startMonth,
        endMonth,
        minObservationCount: input.options.minObservationCount,
      },
      run: async (local) => {
        const rows = loadSegmentDaypartHistoryLocalDbRows({
          sqlite: local.sqlite,
          startMonth,
          endMonth,
        });
        const artifact = buildSegmentDaypartPanelArtifact({
          rows,
          spec: {
            panelId: SEGMENT_DAYPART_PANEL_V1_ID,
            startMonth,
            endMonth,
            minObservationCount: input.options.minObservationCount,
          },
          releaseMonth,
          generatedAt: new Date().toISOString(),
          dbPath: repoDisplayPath(local.path),
          artifactPath: repoDisplayPath(outputPath),
        });
        await mkdir(dirname(outputPath), { recursive: true });
        await writeJson(outputPath, artifact);
        return {
          releaseMonth,
          outputPath: repoDisplayPath(outputPath),
          panelRowCount: artifact.summary.panelRowCount,
          eligiblePanelRowCount: artifact.summary.eligiblePanelRowCount,
          releaseMonthRowCount: artifact.summary.releaseMonthRowCount,
          routeCount: artifact.summary.routeCount,
          monthCount: artifact.window.monthCount,
        };
      },
    });
  },
});
