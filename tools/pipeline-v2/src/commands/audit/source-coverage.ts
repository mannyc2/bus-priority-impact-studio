import { Effect } from "effect";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { sourceCoverageLedgerPath } from "@bp/analytics/artifacts";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { buildSourceCoverageLedger } from "@bp/pipeline-v2/local-db-aggregates";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

export { sourceCoverageLedgerPath } from "@bp/analytics/artifacts";
export {
  buildSourceCoverageLedger,
  type DetectorEligibility,
  type EvidenceRole,
  SOURCE_COVERAGE_CONFIGS,
  type SourceConfig,
  type SourceCoverageLedger,
  type SourceCoverageLedgerEntry,
  type SourceDecision,
  type SourceRole,
} from "@bp/pipeline-v2/local-db-aggregates";

export default defineCommand({
  path: ["audit", "source-coverage"],
  summary: "Build the source coverage ledger for a release month.",
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
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
        output: Schema.optionalKey(Schema.String).annotate({
          description: "Override output path for ledger JSON",
        }),
      },
    }),
  },
  output: Schema.Struct({
    month: Schema.String,
    outputPath: Schema.String,
    sourceCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    sourcesNeedingAction: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  async run({ input }) {
    const month = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? sourceCoverageLedgerPath(artifactRoot, month)
        : fromCliPath(input.options.output);

    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      localDbOptions: { readonly: true },
      command: "audit.source-coverage",
      operation: "buildSourceCoverageLedger",
      spanAttributes: { month },
      run: async (local) => {
        const ledger = buildSourceCoverageLedger({
          sqlite: local.sqlite,
          month,
          dbPath: local.path,
        });

        await mkdir(dirname(outputPath), { recursive: true });
        await writeJson(outputPath, ledger);

        return {
          month,
          outputPath,
          sourceCount: ledger.summary.sourceCount,
          sourcesNeedingAction: ledger.summary.sourcesNeedingAction,
        };
      },
    });
  },
});
