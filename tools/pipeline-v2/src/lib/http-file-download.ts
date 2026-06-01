import { once } from "node:events";
import { createWriteStream, existsSync, statSync, type WriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { SocrataFetch } from "@bp/sources";

export type HttpFileDownloadProgressEvent =
  | {
      kind: "download_started";
      url: string;
      outputPath: string;
      attempt: number;
      maxAttempts: number;
    }
  | {
      kind: "download_progress";
      url: string;
      outputPath: string;
      downloadedBytes: number;
      totalBytes: number | null;
      attempt: number;
      maxAttempts: number;
    }
  | {
      kind: "download_attempt_failed";
      url: string;
      outputPath: string;
      attempt: number;
      maxAttempts: number;
      message: string;
    }
  | {
      kind: "download_completed" | "download_reused";
      url: string;
      outputPath: string;
      downloadedBytes: number;
    };

export type HttpFileDownloadInputs = {
  url: string;
  outputPath: string;
  requestInit?: RequestInit | undefined;
  expectedStatuses?: readonly number[] | undefined;
  force?: boolean | undefined;
  retryCount?: number | undefined;
  retryDelayMs?: number | undefined;
  progressByteInterval?: number | undefined;
  fetcher?: SocrataFetch | undefined;
  progress?: ((event: HttpFileDownloadProgressEvent) => void) | undefined;
};

export type HttpFileDownloadResult = {
  downloaded: boolean;
  bytes: number;
};

const defaultProgressByteInterval = 50 * 1024 * 1024;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function existingFileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeStreamChunk(stream: WriteStream, chunk: Uint8Array): Promise<void> {
  if (!stream.write(chunk)) {
    await once(stream, "drain");
  }
}

async function closeStream(stream: WriteStream): Promise<void> {
  if (stream.destroyed) return;
  stream.end();
  await once(stream, "finish");
}

async function downloadAttempt(
  input: HttpFileDownloadInputs,
  tmpPath: string,
  attempt: number,
  maxAttempts: number,
): Promise<number> {
  input.progress?.({
    kind: "download_started",
    url: input.url,
    outputPath: input.outputPath,
    attempt,
    maxAttempts,
  });

  const response = await (input.fetcher ?? fetch)(input.url, input.requestInit);
  const statusAccepted =
    input.expectedStatuses === undefined
      ? response.ok
      : input.expectedStatuses.includes(response.status);
  if (!statusAccepted) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status}`);
  }
  if (response.body === null) {
    throw new Error("download response had no body");
  }

  const totalHeader = Number(response.headers.get("content-length"));
  const totalBytes = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null;
  const progressByteInterval = input.progressByteInterval ?? defaultProgressByteInterval;
  const stream = createWriteStream(tmpPath, { flags: "w" });
  let downloadedBytes = 0;
  let nextProgress = progressByteInterval;

  try {
    for await (const chunk of response.body) {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      downloadedBytes += bytes.byteLength;
      await writeStreamChunk(stream, bytes);
      if (downloadedBytes >= nextProgress) {
        nextProgress = downloadedBytes + progressByteInterval;
        input.progress?.({
          kind: "download_progress",
          url: input.url,
          outputPath: input.outputPath,
          downloadedBytes,
          totalBytes,
          attempt,
          maxAttempts,
        });
      }
    }
    await closeStream(stream);
  } catch (error) {
    stream.destroy();
    throw error;
  }

  return downloadedBytes;
}

export async function downloadHttpFile(
  input: HttpFileDownloadInputs,
): Promise<HttpFileDownloadResult> {
  if (!input.force && existsSync(input.outputPath)) {
    const bytes = existingFileSize(input.outputPath);
    input.progress?.({
      kind: "download_reused",
      url: input.url,
      outputPath: input.outputPath,
      downloadedBytes: bytes,
    });
    return { downloaded: false, bytes };
  }

  await mkdir(dirname(input.outputPath), { recursive: true });
  const maxAttempts = Math.max(1, Math.floor((input.retryCount ?? 0) + 1));
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const tmpPath = `${input.outputPath}.tmp-${process.pid}-${Date.now()}-${attempt}`;
    try {
      const downloadedBytes = await downloadAttempt(input, tmpPath, attempt, maxAttempts);
      await rename(tmpPath, input.outputPath);
      input.progress?.({
        kind: "download_completed",
        url: input.url,
        outputPath: input.outputPath,
        downloadedBytes,
      });
      return { downloaded: true, bytes: downloadedBytes };
    } catch (error) {
      lastError = error;
      await rm(tmpPath, { force: true });
      if (attempt < maxAttempts) {
        input.progress?.({
          kind: "download_attempt_failed",
          url: input.url,
          outputPath: input.outputPath,
          attempt,
          maxAttempts,
          message: errorMessage(error),
        });
        await sleep(input.retryDelayMs ?? 1_000);
      }
    }
  }

  throw lastError;
}
