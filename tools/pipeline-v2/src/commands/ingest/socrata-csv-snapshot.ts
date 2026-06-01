import { join } from "node:path";
import {
  getSocrataSource,
  parseSourceManifest,
  type SocrataFetch,
  type SocrataManifestSource,
} from "@bp/sources";
import { defineCommand, z } from "@liche/core";
import { downloadHttpFile } from "../../lib/http-file-download.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import { fetchWithSocrataAppToken } from "../../lib/socrata-token.ts";

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
  return downloadHttpFile({
    url: input.source.rows_csv,
    outputPath: input.outputPath,
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
  const source = getSocrataSource(parseSourceManifest(manifestText), inputs.sourceId);
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
    options: z.object({
      sourceId: z
        .string()
        .min(1)
        .describe("Socrata source ID from knowledge/raw/source_manifest.yaml"),
      outputPath: z
        .string()
        .optional()
        .describe("Target CSV path; defaults under data/raw/socrata-bulk"),
      force: z.coerce
        .boolean()
        .default(false)
        .describe("Redownload even when the CSV already exists"),
      downloadRetryCount: z.coerce
        .number()
        .int()
        .min(0)
        .default(2)
        .describe("Number of retry attempts after a failed CSV download attempt"),
      downloadRetryDelayMs: z.coerce
        .number()
        .int()
        .min(0)
        .default(5_000)
        .describe("Delay between CSV download retry attempts"),
      logProgress: z.coerce
        .boolean()
        .default(true)
        .describe("Write download progress events to stderr"),
    }),
  },
  output: z.object({
    sourceId: z.string(),
    datasetId: z.string(),
    outputPath: z.string(),
    downloaded: z.boolean(),
    bytes: z.number(),
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
