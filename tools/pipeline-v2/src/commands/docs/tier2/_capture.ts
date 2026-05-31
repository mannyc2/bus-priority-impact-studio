// Tier 2 capture step, extracted from the former _shared.ts monolith during the
// per-step decomposition. Fetches backlog source URLs, writes raw + extracted
// text artifacts, and emits the capture manifest. Imports shared types,
// fetch/hash/strip helpers, manifest writers, and path/CLI helpers from the core
// module; the core module never imports back here.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { writeJson } from "../../../lib/json.ts";
import {
  artifactKey,
  captureManifestPath,
  createRunId,
  decodeUtf8,
  DEFAULT_BACKLOG_PATH,
  defaultFetch,
  parseCliOptions,
  readBacklog,
  runArtifactRoot,
  sha256,
  stripHtmlToText,
  summarizeCapture,
  writeSourceMetadata,
  type CaptureCliArgs,
  type CaptureTier2DocsArgs,
  type ExpectedContentType,
  type FetchLike,
  type TextExtractionStatus,
  type Tier2BacklogSource,
  type Tier2CaptureManifest,
  type Tier2CapturedSource,
} from "./_shared.ts";

function detectContentType(input: {
  contentType: string | null;
  expected: ExpectedContentType;
  finalUrl: string;
  bytes: Uint8Array;
}): ExpectedContentType {
  const normalized = input.contentType?.toLowerCase() ?? "";
  const urlPath = input.finalUrl.toLowerCase().split("?")[0] ?? "";
  const preview = decodeUtf8(input.bytes.slice(0, 128)).trimStart().toLowerCase();

  if (input.expected !== "unknown") {
    return input.expected;
  }
  if (
    normalized.includes("application/pdf") ||
    urlPath.endsWith(".pdf") ||
    preview.startsWith("%pdf")
  ) {
    return "pdf";
  }
  if (
    normalized.includes("text/html") ||
    preview.startsWith("<!doctype") ||
    preview.startsWith("<html")
  ) {
    return "html";
  }
  if (normalized.includes("application/json") || normalized.includes("+json")) {
    return "json";
  }

  return "unknown";
}

function extensionForContentType(contentType: ExpectedContentType): string {
  if (contentType === "pdf") {
    return "pdf";
  }
  if (contentType === "json") {
    return "json";
  }
  if (contentType === "html") {
    return "html";
  }
  return "bin";
}

function textExtractionStatusFor(
  source: Tier2BacklogSource,
  contentType: ExpectedContentType,
): TextExtractionStatus {
  if (contentType === "html") {
    return "html_text";
  }
  if (contentType === "pdf" && source.ocrHint !== "not_needed") {
    return "ocr_required";
  }
  return "metadata_only";
}

async function writeRawArtifacts(input: {
  runRoot: string;
  source: Tier2BacklogSource;
  detectedContentType: ExpectedContentType;
  bytes: Uint8Array;
}): Promise<{ rawArtifactKey: string; textArtifactKey: string | null; textLength: number }> {
  const sourceRoot = join(input.runRoot, "sources", input.source.sourceId);
  await mkdir(sourceRoot, { recursive: true });

  const rawPath = join(sourceRoot, `source.${extensionForContentType(input.detectedContentType)}`);
  await Bun.write(rawPath, input.bytes);

  if (input.detectedContentType !== "html") {
    return {
      rawArtifactKey: artifactKey(rawPath, input.runRoot),
      textArtifactKey: null,
      textLength: 0,
    };
  }

  const text = stripHtmlToText(decodeUtf8(input.bytes));
  const textPath = join(sourceRoot, "text.txt");
  await Bun.write(textPath, `${text}\n`);

  return {
    rawArtifactKey: artifactKey(rawPath, input.runRoot),
    textArtifactKey: artifactKey(textPath, input.runRoot),
    textLength: text.length,
  };
}

async function captureSource(input: {
  source: Tier2BacklogSource;
  fetcher: FetchLike;
  runRoot: string;
  retrievedAt: string;
}): Promise<Tier2CapturedSource> {
  const { source } = input;
  const base = {
    sourceId: source.sourceId,
    title: source.title,
    publisher: source.publisher,
    sourceGroup: source.sourceGroup,
    intendedUse: source.intendedUse,
    priority: source.priority,
    sourceUrl: source.url,
    documentDate: source.documentDate ?? null,
    retrievedAt: input.retrievedAt,
    ocrHint: source.ocrHint,
    termsNote: source.termsNote ?? null,
  };

  try {
    const response = await input.fetcher(source.url, { redirect: "follow" });
    const finalUrl = response.url.length > 0 ? response.url : source.url;
    const contentType = response.headers.get("content-type");

    if (!response.ok) {
      return {
        ...base,
        finalUrl,
        captureStatus: "failed",
        httpStatus: response.status,
        contentType,
        detectedContentType: source.expectedContentType,
        byteLength: 0,
        sha256: null,
        rawArtifactKey: null,
        textArtifactKey: null,
        textLength: 0,
        textExtractionStatus: "metadata_only",
        error: `HTTP ${response.status} ${response.statusText}`.trim(),
      };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const detectedContentType = detectContentType({
      contentType,
      expected: source.expectedContentType,
      finalUrl,
      bytes,
    });
    const artifacts = await writeRawArtifacts({
      runRoot: input.runRoot,
      source,
      detectedContentType,
      bytes,
    });

    return {
      ...base,
      finalUrl,
      captureStatus: "captured",
      httpStatus: response.status,
      contentType,
      detectedContentType,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
      rawArtifactKey: artifacts.rawArtifactKey,
      textArtifactKey: artifacts.textArtifactKey,
      textLength: artifacts.textLength,
      textExtractionStatus: textExtractionStatusFor(source, detectedContentType),
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      finalUrl: source.url,
      captureStatus: "failed",
      httpStatus: null,
      contentType: null,
      detectedContentType: source.expectedContentType,
      byteLength: 0,
      sha256: null,
      rawArtifactKey: null,
      textArtifactKey: null,
      textLength: 0,
      textExtractionStatus: "metadata_only",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function captureTier2Docs(
  args: CaptureTier2DocsArgs = {},
): Promise<Tier2CaptureManifest> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? createRunId();
  const generatedAt = args.fetchedAt ?? new Date().toISOString();
  const backlogPath = args.backlogPath ?? DEFAULT_BACKLOG_PATH;
  const runRoot = runArtifactRoot(artifactRoot, runId);
  const backlog = await readBacklog(backlogPath);
  const fetcher = args.fetcher ?? defaultFetch;

  const sources: Tier2CapturedSource[] = [];
  for (const source of backlog.sources.toSorted((left, right) => left.priority - right.priority)) {
    const capturedSource = await captureSource({
      source,
      fetcher,
      runRoot,
      retrievedAt: generatedAt,
    });
    await writeSourceMetadata(runRoot, capturedSource);
    sources.push(capturedSource);
  }

  const manifest: Tier2CaptureManifest = {
    version: 1,
    runId,
    generatedAt,
    backlogPath,
    artifactRoot,
    runArtifactRoot: runRoot,
    summary: summarizeCapture(sources),
    sources,
  };

  const outputPath = captureManifestPath(artifactRoot, runId);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, manifest);
  return manifest;
}

function parseCaptureCliArgs(args: string[]): CaptureCliArgs {
  return parseCliOptions<CaptureCliArgs>(args, {}, [
    {
      flags: ["--backlog"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.backlogPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.artifactRoot = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.runId = value;
        }
      },
    },
  ]);
}

export async function captureTier2DocsFromCli(args: string[]): Promise<Tier2CaptureManifest> {
  return captureTier2Docs(parseCaptureCliArgs(args));
}

