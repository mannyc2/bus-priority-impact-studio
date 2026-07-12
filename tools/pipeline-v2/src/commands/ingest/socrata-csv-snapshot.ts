import { join } from "node:path";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { getSocrataSource, type SocrataManifestSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { Effect } from "effect";
import { downloadHttpFile } from "../../lib/http-file-download.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import { fetchWithSocrataAppToken } from "../../lib/socrata-token.ts";
import type { SocrataFetch } from "../../lib/soda3.ts";
import { soda3ExportUrl } from "../../lib/soda3.ts";

export type SocrataCsvSnapshotProgressEvent =
  | {
      kind: "download_started";
      sourceId: string;
      url: string;
      outputPath: string;
    }
  | {
      kind: "download_progress";
      sourceId: string;
      outputPath: string;
      downloadedBytes: number;
      totalBytes: number | null;
      attempt: number;
      maxAttempts: number;
    }
  | {
      kind: "download_attempt_failed";
      sourceId: string;
      outputPath: string;
      attempt: number;
      maxAttempts: number;
      message: string;
    }
  | {
      kind: "download_completed" | "download_reused";
      sourceId: string;
      outputPath: string;
      downloadedBytes: number;
    };

export type SocrataCsvSnapshotInputs = {
  sourceId: string;
  outputPath?: string | undefined;
  force?: boolean | undefined;
  retryCount?: number | undefined;
  retryDelayMs?: number | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  progress?: ((event: SocrataCsvSnapshotProgressEvent) => void) | undefined;
};

export type SocrataCsvSnapshotResult = {
  sourceId: string;
  datasetId: string;
  outputPath: string;
  downloaded: boolean;
  bytes: number;
};

function defaultOutputPath(sourceId: string): string {
  return fromRepoRoot(join("data/raw/socrata-bulk", sourceId, "rows.csv"));
}

async function downloadRowsCsv(input: {
  source: SocrataManifestSource;
  outputPath: string;
  force?: boolean | undefined;
  retryCount?: number | undefined;
  retryDelayMs?: number | undefined;
  fetcher?: SocrataFetch | undefined;
  progress?: ((event: SocrataCsvSnapshotProgressEvent) => void) | undefined;
}): Promise<{ downloaded: boolean; bytes: number }> {
  const url = soda3ExportUrl(input.source.domain, input.source.dataset_id, "csv").href;
  return downloadHttpFile({
    url,
    outputPath: input.outputPath,
    requestInit: {
      method: "POST",
      headers: {
        Accept: "text/csv",
        "Content-Type": "application/json",
      },
      body: "{}",
    },
    force: input.force,
    retryCount: input.retryCount,
    retryDelayMs: input.retryDelayMs,
    fetcher: input.fetcher,
    progress: (event) => {
      if (event.kind === "download_started") {
        input.progress?.({
          kind: "download_started",
          sourceId: input.source.id,
          url: event.url,
          outputPath: event.outputPath,
        });
      } else if (event.kind === "download_progress") {
        input.progress?.({
          kind: "download_progress",
          sourceId: input.source.id,
          outputPath: event.outputPath,
          downloadedBytes: event.downloadedBytes,
          totalBytes: event.totalBytes,
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
        });
      } else if (event.kind === "download_attempt_failed") {
        input.progress?.({
          kind: "download_attempt_failed",
          sourceId: input.source.id,
          outputPath: event.outputPath,
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          message: event.message,
        });
      } else {
        input.progress?.({
          kind: event.kind,
          sourceId: input.source.id,
          outputPath: event.outputPath,
          downloadedBytes: event.downloadedBytes,
        });
      }
    },
  });
}

export async function runSocrataCsvSnapshot(
  inputs: SocrataCsvSnapshotInputs,
): Promise<SocrataCsvSnapshotResult> {
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(loadSourceManifestYaml(manifestText), inputs.sourceId);
  const outputPath = inputs.outputPath ?? defaultOutputPath(source.id);
  const result = await downloadRowsCsv({
    source,
    outputPath,
    force: inputs.force,
    retryCount: inputs.retryCount,
    retryDelayMs: inputs.retryDelayMs,
    fetcher: fetchWithSocrataAppToken(inputs.fetcher),
    progress: inputs.progress,
  });

  return {
    sourceId: source.id,
    datasetId: source.dataset_id,
    outputPath,
    downloaded: result.downloaded,
    bytes: result.bytes,
  };
}

export default defineCommand({
  path: ["ingest", "socrata-csv-snapshot"],
  summary: "Download or reuse a Socrata rows.csv source snapshot from the source manifest.",
  input: {
    options: Schema.Struct({
      sourceId: Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "Socrata source ID from knowledge/raw/source_manifest.yaml",
      }),
      outputPath: Schema.optionalKey(Schema.String).annotate({
        description: "Target CSV path; defaults under data/raw/socrata-bulk",
      }),
      force: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
        .annotate({ description: "Redownload even when the CSV already exists" }),
      downloadRetryCount: arg
        .number()
        .check(Schema.isInt())
        .check(Schema.isGreaterThanOrEqualTo(0))
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2)))
        .annotate({ description: "Number of retry attempts after a failed CSV download attempt" }),
      downloadRetryDelayMs: arg
        .number()
        .check(Schema.isInt())
        .check(Schema.isGreaterThanOrEqualTo(0))
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(5_000)))
        .annotate({ description: "Delay between CSV download retry attempts" }),
      logProgress: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true)))
        .annotate({ description: "Write download progress events to stderr" }),
    }),
  },
  output: Schema.Struct({
    sourceId: Schema.String,
    datasetId: Schema.String,
    outputPath: Schema.String,
    downloaded: Schema.Boolean,
    bytes: Schema.Number,
  }),
  async run({ input }) {
    return runSocrataCsvSnapshot({
      sourceId: input.options.sourceId,
      outputPath:
        input.options.outputPath === undefined ? undefined : fromCliPath(input.options.outputPath),
      force: input.options.force,
      retryCount: input.options.downloadRetryCount,
      retryDelayMs: input.options.downloadRetryDelayMs,
      progress: input.options.logProgress
        ? (event) => {
            console.error(
              JSON.stringify({
                event: "socrata_csv_snapshot_progress",
                ...event,
              }),
            );
          }
        : undefined,
    });
  },
});
