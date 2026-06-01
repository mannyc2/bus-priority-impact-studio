// Tier 2 OCR-plan step, extracted from the former _shared.ts monolith during
// the per-step decomposition. Selects captured PDF sources eligible for OCR and
// emits the OCR plan. Imports shared types, path/IO, and PDF helpers from the
// core module; the core module never imports back here.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import {
  type CliOption,
  captureManifestPath,
  DEFAULT_OCR_MODEL,
  latestDocsRunId,
  type OcrPlanCliArgs,
  ocrPlanPath,
  type PlanTier2OcrArgs,
  parseCliOptions,
  pdfInfoPageCount,
  type Tier2CapturedSource,
  type Tier2CaptureManifest,
  type Tier2OcrPlan,
  type Tier2OcrPlanSource,
} from "./_shared.ts";

function parseOcrPlanCliArgs(args: string[]): OcrPlanCliArgs {
  const options: CliOption<OcrPlanCliArgs>[] = [
    {
      flags: ["--capture-manifest"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.captureManifestPath = fromCliPath(value);
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
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.outputPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--model"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.model = value;
        }
      },
    },
    {
      flags: ["--default-page-range"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.defaultPageRange = value;
        }
      },
    },
  ];
  return parseCliOptions(args, {}, options);
}

function ensureCapturedOcrSource(source: Tier2CapturedSource): Tier2OcrPlanSource | null {
  if (
    source.captureStatus !== "captured" ||
    source.textExtractionStatus !== "ocr_required" ||
    source.rawArtifactKey === null ||
    source.sha256 === null
  ) {
    return null;
  }

  return {
    sourceId: source.sourceId,
    title: source.title,
    publisher: source.publisher,
    sourceGroup: source.sourceGroup,
    sourceUrl: source.sourceUrl,
    finalUrl: source.finalUrl,
    rawArtifactKey: source.rawArtifactKey,
    byteLength: source.byteLength,
    sha256: source.sha256,
    pageRange: "1-10",
    inputMode: "openrouter_pdf_file_or_rendered_pages",
    reviewState: "triage_ready",
    nextAction:
      "Run docs:ocr for first-10-page triage, then promote useful pages to focused extraction.",
  };
}

export async function planTier2Ocr(args: PlanTier2OcrArgs): Promise<Tier2OcrPlan> {
  const manifest = (await Bun.file(args.captureManifestPath).json()) as Tier2CaptureManifest;
  const model = args.model ?? process.env["OPENROUTER_OCR_MODEL"] ?? DEFAULT_OCR_MODEL;
  const manifestRunRoot = dirname(args.captureManifestPath);
  const sourcesAsync = await Promise.all(
    manifest.sources.map(async (source) => {
      const plannedSource = ensureCapturedOcrSource(source);
      if (plannedSource === null) {
        return null;
      }
      if (args.defaultPageRange !== undefined) {
        return { ...plannedSource, pageRange: args.defaultPageRange };
      }
      const pageCount = await pdfInfoPageCount(join(manifestRunRoot, plannedSource.rawArtifactKey));
      if (pageCount === null) {
        return null;
      }
      return { ...plannedSource, pageRange: `1-${pageCount}` };
    }),
  );
  const sources = sourcesAsync.filter((source): source is Tier2OcrPlanSource => source !== null);
  const totalBytes = sources.reduce((sum, source) => sum + source.byteLength, 0);

  const plan: Tier2OcrPlan = {
    version: 1,
    runId: manifest.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    captureManifestPath: args.captureManifestPath,
    outputPath: args.outputPath ?? null,
    runtime: "pi-mono",
    provider: "openrouter",
    model,
    api: "chat.completions",
    summary: {
      ocrRequiredSourceCount: sources.length,
      skippedSourceCount: manifest.sources.length - sources.length,
      totalBytes,
      totalMegabytes: Number((totalBytes / 1_000_000).toFixed(3)),
    },
    sources,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, plan);
  }

  return plan;
}

async function resolveOcrPlanPaths(args: OcrPlanCliArgs): Promise<{
  captureManifestPath: string;
  outputPath: string;
}> {
  if (args.captureManifestPath !== undefined) {
    return {
      captureManifestPath: args.captureManifestPath,
      outputPath: args.outputPath ?? join(dirname(args.captureManifestPath), "ocr-plan.json"),
    };
  }

  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --capture-manifest.");
  }

  return {
    captureManifestPath: captureManifestPath(artifactRoot, runId),
    outputPath: args.outputPath ?? ocrPlanPath(artifactRoot, runId),
  };
}

export async function planTier2OcrFromCli(args: string[]): Promise<Tier2OcrPlan> {
  const parsed = parseOcrPlanCliArgs(args);
  const paths = await resolveOcrPlanPaths(parsed);
  const planArgs: PlanTier2OcrArgs = { ...paths };
  if (parsed.model !== undefined) {
    planArgs.model = parsed.model;
  }
  if (parsed.defaultPageRange !== undefined) {
    planArgs.defaultPageRange = parsed.defaultPageRange;
  }
  return planTier2Ocr(planArgs);
}
