import { join } from "node:path";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { runPipelineFileSystemBoundary } from "../../effect/file-system.ts";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import {
  buildRawCoverageReport,
  buildRawFamilyReports,
  probeRawFamilySqliteCoverage,
  type RawCoverageReport,
  type RawDeletionManifestEntry,
  type RawFamilyReport,
  type RawListingEntry,
} from "../../lib/raw-deprecation.ts";

export type RawSnapshotCoverageCommandResult = {
  generatedAt: string;
  reportPath: string;
  deletionManifestPath: string;
  familyCount: number;
  deletionManifestFamilyCount: number;
  deletionManifestBytes: number;
};

function todayStamp(generatedAt: string): string {
  return generatedAt.slice(0, 10);
}

function bytesToGib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

async function listRawTree(rawRoot: string): Promise<RawListingEntry[]> {
  return runPipelineFileSystemBoundary({
    command: "audit.raw-snapshot-coverage",
    operation: "listRawTree",
    run: (files) =>
      files.listDirectory({
        command: "audit.raw-snapshot-coverage",
        operation: "listRawTree",
        path: rawRoot,
        recursive: true,
      }),
  });
}

async function writeReportArtifacts(input: {
  reportPath: string;
  deletionManifestPath: string;
  report: RawCoverageReport;
  deletionManifest: readonly RawDeletionManifestEntry[];
}): Promise<void> {
  await runPipelineFileSystemBoundary({
    command: "audit.raw-snapshot-coverage",
    operation: "writeArtifacts",
    run: (files) =>
      Effect.gen(function* () {
        yield* files.writeText({
          command: "audit.raw-snapshot-coverage",
          operation: "writeCoverageReport",
          path: input.reportPath,
          contents: `${JSON.stringify(input.report, null, 2)}\n`,
        });
        yield* files.writeText({
          command: "audit.raw-snapshot-coverage",
          operation: "writeDeletionManifest",
          path: input.deletionManifestPath,
          contents: `${JSON.stringify(input.deletionManifest, null, 2)}\n`,
        });
      }),
  });
}

function printSummary(report: RawCoverageReport): void {
  const lines = [
    "raw-snapshot-coverage:",
    `family                         verdict       size       files    reason`,
    ...report.families.map((family) =>
      [
        family.family.padEnd(30),
        family.verdict.padEnd(12),
        bytesToGib(family.bytes).padStart(10),
        String(family.fileCount).padStart(8),
        family.reason,
      ].join("  "),
    ),
    `deletion manifest: ${report.deletionManifest.length} families, ${bytesToGib(
      report.summary.deletionManifestBytes,
    )}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

export async function runRawSnapshotCoverageAudit(input: {
  dbPath?: string | undefined;
  rawRoot: string;
  artifactRoot: string;
  generatedAt: string;
}): Promise<RawSnapshotCoverageCommandResult> {
  const listing = await listRawTree(input.rawRoot);
  const families: RawFamilyReport[] = buildRawFamilyReports(input.rawRoot, listing);
  const sqliteCoverage = await runLocalDbCommandBoundary({
    dbPath: input.dbPath,
    localDbOptions: { readonly: true },
    command: "audit.raw-snapshot-coverage",
    operation: "probeSqliteCoverage",
    run: async (local) => ({
      dbPath: local.path,
      sqliteProbes: probeRawFamilySqliteCoverage(local.sqlite, families),
    }),
  });
  const report = buildRawCoverageReport({
    generatedAt: input.generatedAt,
    rawRoot: input.rawRoot,
    dbPath: sqliteCoverage.dbPath,
    families,
    sqliteProbes: sqliteCoverage.sqliteProbes,
  });
  const stamp = todayStamp(input.generatedAt);
  const outputRoot = join(input.artifactRoot, "raw-deprecation");
  const reportPath = join(outputRoot, `raw-coverage-${stamp}.json`);
  const deletionManifestPath = join(outputRoot, `deletion-manifest-${stamp}.json`);
  await writeReportArtifacts({
    reportPath,
    deletionManifestPath,
    report,
    deletionManifest: report.deletionManifest,
  });
  printSummary(report);

  return {
    generatedAt: input.generatedAt,
    reportPath,
    deletionManifestPath,
    familyCount: report.summary.familyCount,
    deletionManifestFamilyCount: report.summary.deletionManifestFamilyCount,
    deletionManifestBytes: report.summary.deletionManifestBytes,
  };
}

export default defineCommand({
  path: ["audit", "raw-snapshot-coverage"],
  summary: "Audit whether raw JSON snapshots are covered by local SQLite tables.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        rawRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override data/raw root",
        }),
        artifactRoot: Schema.optionalKey(Schema.String).annotate({
          description: "Override artifact root directory",
        }),
        generatedAt: Schema.optionalKey(Schema.String).annotate({
          description: "Override generated timestamp for deterministic tests",
        }),
      },
    }),
  },
  output: Schema.Struct({
    generatedAt: Schema.String,
    reportPath: Schema.String,
    deletionManifestPath: Schema.String,
    familyCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    deletionManifestFamilyCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    deletionManifestBytes: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  async run({ input }) {
    return runRawSnapshotCoverageAudit({
      dbPath: input.options.db,
      rawRoot:
        input.options.rawRoot === undefined
          ? fromRepoRoot("data/raw")
          : fromCliPath(input.options.rawRoot),
      artifactRoot:
        input.options.artifactRoot === undefined
          ? defaultArtifactRootPath()
          : fromCliPath(input.options.artifactRoot),
      generatedAt: input.options.generatedAt ?? new Date().toISOString(),
    });
  },
});
