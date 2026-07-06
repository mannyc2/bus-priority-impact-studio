import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { sourceCoverageLedgerPath } from "@bp/analytics/artifacts";
import { buildSourceCoverageLedger } from "@bp/pipeline-v2/local-db-aggregates";
import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
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
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for ledger JSON"),
    }),
  },
  output: z.object({
    month: z.string(),
    outputPath: z.string(),
    sourceCount: z.number().int().nonnegative(),
    sourcesNeedingAction: z.number().int().nonnegative(),
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
