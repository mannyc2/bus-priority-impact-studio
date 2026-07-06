import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { getSocrataSource, type SocrataManifestSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { downloadHttpFile } from "../../lib/http-file-download.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import { fetchWithSocrataAppToken } from "../../lib/socrata-token.ts";
import type { SocrataFetch } from "../../lib/soda3.ts";

type PartitionInterval = "day" | "month" | "year";

type DateChunk = {
  id: string;
  startDate: string;
  endDate: string;
};

export type SocrataPartitionedCsvSnapshotProgressEvent =
  | {
      kind: "chunk_download_started";
      sourceId: string;
      chunkId: string;
      url: string;
      outputPath: string;
    }
  | {
      kind: "chunk_download_progress";
      sourceId: string;
      chunkId: string;
      outputPath: string;
      downloadedBytes: number;
      totalBytes: number | null;
      attempt: number;
      maxAttempts: number;
    }
  | {
      kind: "chunk_download_attempt_failed";
      sourceId: string;
      chunkId: string;
      outputPath: string;
      attempt: number;
      maxAttempts: number;
      message: string;
    }
  | {
      kind: "chunk_download_completed" | "chunk_download_reused";
      sourceId: string;
      chunkId: string;
      outputPath: string;
      downloadedBytes: number;
    }
  | {
      kind: "manifest_written";
      sourceId: string;
      outputPath: string;
      chunkCount: number;
    };

export type SocrataPartitionedCsvSnapshotInputs = {
  sourceId: string;
  partitionField: string;
  startDate: string;
  endDate: string;
  interval?: PartitionInterval | undefined;
  select?: string | undefined;
  where?: string | undefined;
  orderBy?: string | undefined;
  limit?: number | undefined;
  maxChunks?: number | undefined;
  outputDir?: string | undefined;
  force?: boolean | undefined;
  retryCount?: number | undefined;
  retryDelayMs?: number | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  progress?: ((event: SocrataPartitionedCsvSnapshotProgressEvent) => void) | undefined;
};

export type SocrataPartitionedCsvSnapshotChunkResult = {
  chunkId: string;
  startDate: string;
  endDate: string;
  outputPath: string;
  query: string;
  downloaded: boolean;
  bytes: number;
};

export type SocrataPartitionedCsvSnapshotResult = {
  sourceId: string;
  datasetId: string;
  outputDir: string;
  manifestPath: string;
  chunkCount: number;
  downloadedChunkCount: number;
  reusedChunkCount: number;
  bytes: number;
  chunks: SocrataPartitionedCsvSnapshotChunkResult[];
};

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertSoqlIdentifier(value: string, name: string): string {
  if (!identifierPattern.test(value)) {
    throw new Error(`${name} must be a simple SoQL identifier, got: ${value}`);
  }
  return value;
}

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error(`Invalid date: ${value}`);
  }
  const year = Number(match[1] ?? "");
  const month = Number(match[2] ?? "");
  const day = Number(match[3] ?? "");
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addInterval(date: Date, interval: PartitionInterval): Date {
  if (interval === "day") {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  }
  if (interval === "month") {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));
  }
  return new Date(Date.UTC(date.getUTCFullYear() + 1, date.getUTCMonth(), date.getUTCDate()));
}

function chunkId(input: { partitionField: string; startDate: string; endDate: string }): string {
  return `${input.partitionField}-${input.startDate}-to-${input.endDate}`.replace(
    /[^A-Za-z0-9._-]/g,
    "_",
  );
}

export function buildDateChunks(input: {
  partitionField: string;
  startDate: string;
  endDate: string;
  interval: PartitionInterval;
  maxChunks?: number | undefined;
}): DateChunk[] {
  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  if (start.getTime() >= end.getTime()) {
    throw new Error(`startDate must be before endDate: ${input.startDate} >= ${input.endDate}`);
  }

  const chunks: DateChunk[] = [];
  let cursor = start;
  while (cursor.getTime() < end.getTime()) {
    const next = addInterval(cursor, input.interval);
    const chunkEnd = next.getTime() > end.getTime() ? end : next;
    const startDate = formatDateOnly(cursor);
    const endDate = formatDateOnly(chunkEnd);
    chunks.push({
      id: chunkId({
        partitionField: input.partitionField,
        startDate,
        endDate,
      }),
      startDate,
      endDate,
    });
    if (input.maxChunks !== undefined && chunks.length >= input.maxChunks) break;
    cursor = chunkEnd;
  }
  return chunks;
}

function timestampLiteral(dateOnly: string): string {
  return `'${dateOnly}T00:00:00'`;
}

export function buildSocrataPartitionQuery(input: {
  partitionField: string;
  chunk: DateChunk;
  select?: string | undefined;
  where?: string | undefined;
  orderBy?: string | undefined;
  limit?: number | undefined;
}): string {
  const partitionField = assertSoqlIdentifier(input.partitionField, "partitionField");
  const orderBy =
    input.orderBy === undefined || input.orderBy.trim().length === 0
      ? partitionField
      : assertSoqlIdentifier(input.orderBy.trim(), "orderBy");
  const clauses = [
    `${partitionField} >= ${timestampLiteral(input.chunk.startDate)}`,
    `${partitionField} < ${timestampLiteral(input.chunk.endDate)}`,
  ];
  const where = input.where?.trim();
  if (where !== undefined && where.length > 0) clauses.unshift(`(${where})`);

  let query = `SELECT ${input.select?.trim() || "*"} WHERE ${clauses.join(" AND ")}`;
  query += ` ORDER BY ${orderBy}`;
  if (input.limit !== undefined) query += ` LIMIT ${input.limit}`;
  return query;
}

function soda3ExportUrl(source: SocrataManifestSource): string {
  return new URL(`/api/v3/views/${source.dataset_id}/export.csv`, `https://${source.domain}`).href;
}

function defaultOutputDir(sourceId: string): string {
  return fromRepoRoot(join("data/raw/socrata-partitioned", sourceId));
}

function chunkPath(outputDir: string, chunk: DateChunk): string {
  return join(outputDir, "chunks", chunk.id, "rows.csv");
}

async function writePartitionManifest(input: {
  source: SocrataManifestSource;
  outputDir: string;
  manifestPath: string;
  partitionField: string;
  interval: PartitionInterval;
  startDate: string;
  endDate: string;
  chunks: SocrataPartitionedCsvSnapshotChunkResult[];
}): Promise<void> {
  await mkdir(input.outputDir, { recursive: true });
  await Bun.write(
    input.manifestPath,
    `${JSON.stringify(
      {
        sourceId: input.source.id,
        datasetId: input.source.dataset_id,
        domain: input.source.domain,
        endpoint: soda3ExportUrl(input.source),
        generatedAt: new Date().toISOString(),
        partitionField: input.partitionField,
        interval: input.interval,
        startDate: input.startDate,
        endDate: input.endDate,
        chunkCount: input.chunks.length,
        downloadedChunkCount: input.chunks.filter((chunk) => chunk.downloaded).length,
        reusedChunkCount: input.chunks.filter((chunk) => !chunk.downloaded).length,
        chunks: input.chunks.map((chunk) => ({
          chunkId: chunk.chunkId,
          startDate: chunk.startDate,
          endDate: chunk.endDate,
          path: relative(input.outputDir, chunk.outputPath),
          query: chunk.query,
          downloaded: chunk.downloaded,
          bytes: chunk.bytes,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

export async function runSocrataPartitionedCsvSnapshot(
  inputs: SocrataPartitionedCsvSnapshotInputs,
): Promise<SocrataPartitionedCsvSnapshotResult> {
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(loadSourceManifestYaml(manifestText), inputs.sourceId);
  const outputDir = inputs.outputDir ?? defaultOutputDir(source.id);
  const manifestPath = join(outputDir, "partition-manifest.json");
  const interval = inputs.interval ?? "month";
  const partitionField = assertSoqlIdentifier(inputs.partitionField, "partitionField");
  const url = soda3ExportUrl(source);
  const fetcher = fetchWithSocrataAppToken(inputs.fetcher);
  const chunks = buildDateChunks({
    partitionField,
    startDate: inputs.startDate,
    endDate: inputs.endDate,
    interval,
    maxChunks: inputs.maxChunks,
  });

  const chunkResults: SocrataPartitionedCsvSnapshotChunkResult[] = [];
  for (const chunk of chunks) {
    const outputPath = chunkPath(outputDir, chunk);
    const query = buildSocrataPartitionQuery({
      partitionField,
      chunk,
      select: inputs.select,
      where: inputs.where,
      orderBy: inputs.orderBy,
      limit: inputs.limit,
    });
    const result = await downloadHttpFile({
      url,
      outputPath,
      force: inputs.force,
      retryCount: inputs.retryCount,
      retryDelayMs: inputs.retryDelayMs,
      fetcher,
      requestInit: {
        method: "POST",
        headers: {
          Accept: "text/csv",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      },
      expectedStatuses: [200],
      progress: (event) => {
        if (event.kind === "download_started") {
          inputs.progress?.({
            kind: "chunk_download_started",
            sourceId: source.id,
            chunkId: chunk.id,
            url: event.url,
            outputPath: event.outputPath,
          });
        } else if (event.kind === "download_progress") {
          inputs.progress?.({
            kind: "chunk_download_progress",
            sourceId: source.id,
            chunkId: chunk.id,
            outputPath: event.outputPath,
            downloadedBytes: event.downloadedBytes,
            totalBytes: event.totalBytes,
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
          });
        } else if (event.kind === "download_attempt_failed") {
          inputs.progress?.({
            kind: "chunk_download_attempt_failed",
            sourceId: source.id,
            chunkId: chunk.id,
            outputPath: event.outputPath,
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            message: event.message,
          });
        } else {
          inputs.progress?.({
            kind:
              event.kind === "download_completed"
                ? "chunk_download_completed"
                : "chunk_download_reused",
            sourceId: source.id,
            chunkId: chunk.id,
            outputPath: event.outputPath,
            downloadedBytes: event.downloadedBytes,
          });
        }
      },
    });

    chunkResults.push({
      chunkId: chunk.id,
      startDate: chunk.startDate,
      endDate: chunk.endDate,
      outputPath,
      query,
      downloaded: result.downloaded,
      bytes: result.bytes,
    });
  }

  await writePartitionManifest({
    source,
    outputDir,
    manifestPath,
    partitionField,
    interval,
    startDate: inputs.startDate,
    endDate: inputs.endDate,
    chunks: chunkResults,
  });
  inputs.progress?.({
    kind: "manifest_written",
    sourceId: source.id,
    outputPath: manifestPath,
    chunkCount: chunkResults.length,
  });

  return {
    sourceId: source.id,
    datasetId: source.dataset_id,
    outputDir,
    manifestPath,
    chunkCount: chunkResults.length,
    downloadedChunkCount: chunkResults.filter((chunk) => chunk.downloaded).length,
    reusedChunkCount: chunkResults.filter((chunk) => !chunk.downloaded).length,
    bytes: chunkResults.reduce((sum, chunk) => sum + chunk.bytes, 0),
    chunks: chunkResults,
  };
}

export default defineCommand({
  path: ["ingest", "socrata-partitioned-csv-snapshot"],
  summary: "Download or reuse authenticated SODA3 CSV exports partitioned by a timestamp column.",
  input: {
    options: z.object({
      sourceId: z
        .string()
        .min(1)
        .describe("Socrata source ID from knowledge/raw/source_manifest.yaml"),
      partitionField: z.string().min(1).describe("Timestamp field to partition on"),
      startDate: DateOnlySchema.describe("Inclusive partition start date, YYYY-MM-DD"),
      endDate: DateOnlySchema.describe("Exclusive partition end date, YYYY-MM-DD"),
      interval: z.enum(["day", "month", "year"]).default("month").describe("Partition interval"),
      outputDir: z
        .string()
        .optional()
        .describe("Target directory; defaults under data/raw/socrata-partitioned"),
      select: z.string().optional().describe("SoQL SELECT expression, defaults to *"),
      where: z.string().optional().describe("Additional SoQL WHERE predicate"),
      orderBy: z.string().optional().describe("Simple SoQL ORDER BY field"),
      limit: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional per-partition LIMIT, useful for smoke tests"),
      maxChunks: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional maximum number of partitions to download"),
      force: z.coerce
        .boolean()
        .default(false)
        .describe("Redownload chunks even when they already exist"),
      downloadRetryCount: z.coerce
        .number()
        .int()
        .min(0)
        .default(2)
        .describe("Number of retry attempts after a failed chunk download attempt"),
      downloadRetryDelayMs: z.coerce
        .number()
        .int()
        .min(0)
        .default(5_000)
        .describe("Delay between CSV download retry attempts"),
      logProgress: z.coerce
        .boolean()
        .default(true)
        .describe("Write chunk progress events to stderr"),
    }),
  },
  output: z.object({
    sourceId: z.string(),
    datasetId: z.string(),
    outputDir: z.string(),
    manifestPath: z.string(),
    chunkCount: z.number(),
    downloadedChunkCount: z.number(),
    reusedChunkCount: z.number(),
    bytes: z.number(),
    chunks: z.array(
      z.object({
        chunkId: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        outputPath: z.string(),
        query: z.string(),
        downloaded: z.boolean(),
        bytes: z.number(),
      }),
    ),
  }),
  async run({ input }) {
    return runSocrataPartitionedCsvSnapshot({
      sourceId: input.options.sourceId,
      partitionField: input.options.partitionField,
      startDate: input.options.startDate,
      endDate: input.options.endDate,
      interval: input.options.interval,
      outputDir:
        input.options.outputDir === undefined ? undefined : fromCliPath(input.options.outputDir),
      select: input.options.select,
      where: input.options.where,
      orderBy: input.options.orderBy,
      limit: input.options.limit,
      maxChunks: input.options.maxChunks,
      force: input.options.force,
      retryCount: input.options.downloadRetryCount,
      retryDelayMs: input.options.downloadRetryDelayMs,
      progress: input.options.logProgress
        ? (event) => {
            console.error(
              JSON.stringify({
                event: "socrata_partitioned_csv_snapshot_progress",
                ...event,
              }),
            );
          }
        : undefined,
    });
  },
});
