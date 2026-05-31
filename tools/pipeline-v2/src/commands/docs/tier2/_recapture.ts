// Tier 2 Wayback recapture step (Phase 1c), extracted from the former
// _shared.ts monolith during the per-step decomposition. Imports shared types,
// fetch/strip/hash helpers, capture-manifest writers, and CLI/path helpers from
// the core module; the core module never imports back here.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { writeJson } from "../../../lib/json.ts";
import {
  artifactKey,
  captureManifestPath,
  decodeUtf8,
  defaultFetch,
  latestDocsRunId,
  parseCliOptions,
  parseSourceIds,
  sha256,
  stripHtmlToText,
  summarizeCapture,
  writeSourceMetadata,
  type CliOption,
  type FetchLike,
  type Tier2CaptureManifest,
  type Tier2CapturedSource,
} from "./_shared.ts";

// ---------------------------------------------------------------------------
// Phase 1c: Wayback recapture for sources that failed initial capture
//
// Some MTA pages 403 even after the Chrome-UA fallback in defaultFetch. This
// job targets those sources, queries the Internet Archive's CDX API for the
// most recent successful snapshot, fetches the original HTML via the `id_`
// Wayback flavor (no IA UI chrome), strips it to text using the same
// stripHtmlToText helper the primary capture uses, and updates the capture
// manifest in place so the source can join the html_text normalizer.
// ---------------------------------------------------------------------------

export type RecaptureSourceStatus = "recaptured" | "no_snapshot" | "failed";

export type RecaptureSourceResult = {
  sourceId: string;
  sourceUrl: string;
  status: RecaptureSourceStatus;
  httpStatus: number | null;
  waybackTimestamp: string | null;
  waybackUrl: string | null;
  textLength: number;
  error: string | null;
};

export type RecaptureAudit = {
  version: 1;
  runId: string;
  generatedAt: string;
  captureManifestPath: string;
  outputPath: string | null;
  summary: {
    attempted: number;
    recaptured: number;
    noSnapshot: number;
    failed: number;
  };
  sources: RecaptureSourceResult[];
};

const WAYBACK_CDX_BASE = "https://web.archive.org/cdx/search/cdx";

async function findWaybackSnapshot(input: {
  sourceUrl: string;
  fetcher: FetchLike;
}): Promise<{ timestamp: string; originalUrl: string } | null> {
  const params = new URLSearchParams({
    url: input.sourceUrl,
    output: "json",
    limit: "-1",
    filter: "statuscode:200",
  });
  const response = await input.fetcher(`${WAYBACK_CDX_BASE}?${params.toString()}`, {
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Wayback CDX HTTP ${response.status} ${response.statusText}`.trim());
  }
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body) || body.length < 2) {
    return null;
  }
  const header = body[0];
  if (!Array.isArray(header)) return null;
  const timestampIndex = header.indexOf("timestamp");
  const originalIndex = header.indexOf("original");
  if (timestampIndex === -1 || originalIndex === -1) return null;
  const latest = body[body.length - 1];
  if (!Array.isArray(latest)) return null;
  const timestamp = latest[timestampIndex];
  const originalUrl = latest[originalIndex];
  if (typeof timestamp !== "string" || typeof originalUrl !== "string") return null;
  return { timestamp, originalUrl };
}

function waybackContentUrl(snapshot: { timestamp: string; originalUrl: string }): string {
  return `https://web.archive.org/web/${snapshot.timestamp}id_/${snapshot.originalUrl}`;
}

async function recaptureSource(input: {
  source: Tier2CapturedSource;
  fetcher: FetchLike;
  runRoot: string;
  retrievedAt: string;
}): Promise<{ result: RecaptureSourceResult; updated: Tier2CapturedSource }> {
  const baseResult: RecaptureSourceResult = {
    sourceId: input.source.sourceId,
    sourceUrl: input.source.sourceUrl,
    status: "failed",
    httpStatus: null,
    waybackTimestamp: null,
    waybackUrl: null,
    textLength: 0,
    error: null,
  };

  try {
    const snapshot = await findWaybackSnapshot({
      sourceUrl: input.source.sourceUrl,
      fetcher: input.fetcher,
    });
    if (snapshot === null) {
      return {
        result: { ...baseResult, status: "no_snapshot" },
        updated: input.source,
      };
    }
    const contentUrl = waybackContentUrl(snapshot);
    const response = await input.fetcher(contentUrl, { redirect: "follow" });
    if (!response.ok) {
      return {
        result: {
          ...baseResult,
          status: "failed",
          httpStatus: response.status,
          waybackTimestamp: snapshot.timestamp,
          waybackUrl: contentUrl,
          error: `Wayback content HTTP ${response.status} ${response.statusText}`.trim(),
        },
        updated: input.source,
      };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sourceRoot = join(input.runRoot, "sources", input.source.sourceId);
    await mkdir(sourceRoot, { recursive: true });
    const rawPath = join(sourceRoot, "source.html");
    await Bun.write(rawPath, bytes);
    const text = stripHtmlToText(decodeUtf8(bytes));
    const textPath = join(sourceRoot, "text.txt");
    await Bun.write(textPath, `${text}\n`);
    const recapturePath = join(sourceRoot, "recapture-metadata.json");
    await writeJson(recapturePath, {
      captureSource: "wayback",
      waybackTimestamp: snapshot.timestamp,
      waybackUrl: contentUrl,
      originalUrl: snapshot.originalUrl,
      retrievedAt: input.retrievedAt,
      textLength: text.length,
    });

    const updated: Tier2CapturedSource = {
      ...input.source,
      finalUrl: contentUrl,
      captureStatus: "captured",
      httpStatus: response.status,
      contentType: response.headers.get("content-type"),
      detectedContentType: "html",
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
      rawArtifactKey: artifactKey(rawPath, input.runRoot),
      textArtifactKey: artifactKey(textPath, input.runRoot),
      textLength: text.length,
      textExtractionStatus: "html_text",
      retrievedAt: input.retrievedAt,
      error: null,
    };
    return {
      result: {
        ...baseResult,
        status: "recaptured",
        httpStatus: response.status,
        waybackTimestamp: snapshot.timestamp,
        waybackUrl: contentUrl,
        textLength: text.length,
      },
      updated,
    };
  } catch (error) {
    return {
      result: {
        ...baseResult,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      },
      updated: input.source,
    };
  }
}

export type RecaptureFailedSourcesArgs = {
  captureManifestPath: string;
  sourceIds?: string[];
  fetcher?: FetchLike;
  outputPath?: string;
  generatedAt?: string;
};

export async function recaptureFailedSources(
  args: RecaptureFailedSourcesArgs,
): Promise<RecaptureAudit> {
  const manifest = (await Bun.file(args.captureManifestPath).json()) as Tier2CaptureManifest;
  const runRoot = dirname(args.captureManifestPath);
  const fetcher = args.fetcher ?? defaultFetch;
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const filterSet = args.sourceIds === undefined ? null : new Set(args.sourceIds);

  const results: RecaptureSourceResult[] = [];
  for (let index = 0; index < manifest.sources.length; index += 1) {
    const source = manifest.sources[index]!;
    const isFailed = source.captureStatus === "failed";
    const inFilter = filterSet === null || filterSet.has(source.sourceId);
    if (!isFailed || !inFilter) continue;
    const { result, updated } = await recaptureSource({
      source,
      fetcher,
      runRoot,
      retrievedAt: generatedAt,
    });
    results.push(result);
    if (result.status === "recaptured") {
      manifest.sources[index] = updated;
      await writeSourceMetadata(runRoot, updated);
    }
  }

  manifest.summary = summarizeCapture(manifest.sources);
  await writeJson(args.captureManifestPath, manifest);

  const outputPath = args.outputPath ?? join(runRoot, "capture-recapture-audit.json");
  const audit: RecaptureAudit = {
    version: 1,
    runId: manifest.runId,
    generatedAt,
    captureManifestPath: args.captureManifestPath,
    outputPath,
    summary: {
      attempted: results.length,
      recaptured: results.filter((result) => result.status === "recaptured").length,
      noSnapshot: results.filter((result) => result.status === "no_snapshot").length,
      failed: results.filter((result) => result.status === "failed").length,
    },
    sources: results,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, audit);
  return audit;
}

type RecaptureCliArgs = {
  captureManifestPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  sourceIds?: string[];
};

function parseRecaptureCliArgs(args: string[]): RecaptureCliArgs {
  const options: CliOption<RecaptureCliArgs>[] = [
    {
      flags: ["--capture-manifest"],
      apply: (output, value) => {
        if (value !== undefined) output.captureManifestPath = fromCliPath(value);
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--run-id", "--run"],
      apply: (output, value) => {
        if (value !== undefined) output.runId = value;
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--sources"],
      apply: (output, value) => {
        const parsed = parseSourceIds(value);
        if (parsed !== undefined) output.sourceIds = parsed;
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveRecapturePaths(
  parsed: RecaptureCliArgs,
): Promise<{ captureManifestPath: string }> {
  if (parsed.captureManifestPath !== undefined) {
    return { captureManifestPath: parsed.captureManifestPath };
  }
  const artifactRoot = parsed.artifactRoot ?? defaultArtifactRootPath();
  const runId = parsed.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --capture-manifest.");
  }
  return { captureManifestPath: captureManifestPath(artifactRoot, runId) };
}

export async function recaptureFailedSourcesFromCli(
  args: string[],
): Promise<RecaptureAudit> {
  const parsed = parseRecaptureCliArgs(args);
  const paths = await resolveRecapturePaths(parsed);
  return recaptureFailedSources({
    captureManifestPath: paths.captureManifestPath,
    ...(parsed.outputPath !== undefined ? { outputPath: parsed.outputPath } : {}),
    ...(parsed.sourceIds !== undefined ? { sourceIds: parsed.sourceIds } : {}),
  });
}
