import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { defineCommand, z } from "@liche/core";
import { readJsonIfExists, writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";
import {
  buildTier2SourceCoverage,
  renderTier2SourceCoverageMarkdown,
  type Tier2BacklogSource,
  type Tier2CaptureSource,
  type Tier2DerivedSurfacesSummary,
  type Tier2PublishableRef,
  type Tier2RecordRef,
  type Tier2SourceCoverageArtifact,
  type Tier2VerifiedCoverageRow,
} from "./_tier2-source-coverage.ts";

export {
  buildTier2SourceCoverage,
  MEDIA_CONTENT_TYPES,
  renderTier2SourceCoverageMarkdown,
  type Tier2SourceCoverageArtifact,
  type Tier2SourceCoverageRow,
} from "./_tier2-source-coverage.ts";

function display(path: string): string {
  const rel = relative(repoRoot, path);
  return rel.startsWith("..") ? path : rel;
}

const DEFAULTS = {
  backlog: "docs/tier2-ocr-preservation-20260531/tier2-full-corpus-augmented-backlog.json",
  captureManifest: "docs/tier2-full-corpus-2026-05-24-pass2/capture-manifest.json",
  verifiedCoverage:
    "docs/agentic-runs-20260604/vocab-materialized-views-v1-20260606/vocab-materialized-views.json",
  derivedSurfacesManifest:
    "docs/tier2-full-corpus-2026-05-24-pass2/document-derived-surfaces-v1/manifest.json",
  reviewedRecords:
    "docs/gap-roadmap-docs-2026-05-25/intervention-records-corpus-v3-reviewed-2026-05-27.json",
  publishable: "docs/gap-roadmap-docs-2026-05-25/intervention-publishable-v1.json",
} as const;

export default defineCommand({
  path: ["audit", "tier2-source-coverage"],
  summary:
    "Inventory the Tier 2 source corpus at source grain: what is available (backlog) vs what we have (captured → extracted → reviewed → promoted), with an explicit media lane.",
  input: {
    options: z.object({
      backlog: z.string().optional().describe("Source backlog (available universe) JSON."),
      captureManifest: z.string().optional().describe("Capture manifest JSON."),
      verifiedCoverage: z
        .string()
        .optional()
        .describe("Vocab materialized views JSON (per-source verified surface coverage)."),
      derivedSurfacesManifest: z
        .string()
        .optional()
        .describe("Document-derived-surfaces manifest JSON (corpus extraction totals)."),
      reviewedRecords: z.string().optional().describe("Reviewed intervention-records corpus JSON."),
      publishable: z.string().optional().describe("Publishable interventions JSON."),
      output: z.string().optional().describe("Override output path for the coverage JSON."),
      markdown: z.string().optional().describe("Override output path for the coverage Markdown."),
    }),
  },
  output: z.object({
    outputPath: z.string(),
    markdownPath: z.string(),
    totalSources: z.number(),
    captured: z.number(),
    ocrDerivedSources: z.number(),
    extractedSources: z.number(),
    promotedSources: z.number(),
    knownMediaSources: z.number(),
  }),
  async run({ input }) {
    const artifactRoot = defaultArtifactRootPath();
    const resolve = (override: string | undefined, fallback: string): string =>
      override === undefined ? join(artifactRoot, fallback) : fromCliPath(override);

    const backlogPath = resolve(input.options.backlog, DEFAULTS.backlog);
    const captureManifestPath = resolve(input.options.captureManifest, DEFAULTS.captureManifest);
    const verifiedCoveragePath = resolve(input.options.verifiedCoverage, DEFAULTS.verifiedCoverage);
    const derivedSurfacesManifestPath = resolve(
      input.options.derivedSurfacesManifest,
      DEFAULTS.derivedSurfacesManifest,
    );
    const reviewedRecordsPath = resolve(input.options.reviewedRecords, DEFAULTS.reviewedRecords);
    const publishablePath = resolve(input.options.publishable, DEFAULTS.publishable);

    const outputPath =
      input.options.output === undefined
        ? join(artifactRoot, "audits", "tier2-source-coverage.json")
        : fromCliPath(input.options.output);
    const markdownPath =
      input.options.markdown === undefined
        ? join(artifactRoot, "audits", "tier2-source-coverage.md")
        : fromCliPath(input.options.markdown);

    const backlogDoc = await readJsonIfExists<{ sources?: Tier2BacklogSource[] }>(backlogPath);
    const captureDoc = await readJsonIfExists<{ sources?: Tier2CaptureSource[] }>(
      captureManifestPath,
    );
    const verifiedDoc = await readJsonIfExists<{ sourceCoverageRows?: Tier2VerifiedCoverageRow[] }>(
      verifiedCoveragePath,
    );
    const derivedDoc = await readJsonIfExists<{
      summary?: Tier2DerivedSurfacesSummary;
      surfaceFiles?: Array<{ path?: string }>;
    }>(derivedSurfacesManifestPath);

    // The OCR-derived layer (document-derived-surfaces-v1) does not list its
    // sources in the manifest, so collect the distinct sourceIds from the surface
    // .jsonl files it references. This is the "OCR'd" signal, a superset of the
    // verified/materialized sources. Degrades to empty if the files are absent.
    const derivedSurfaceSourceIds = new Set<string>();
    for (const file of derivedDoc?.surfaceFiles ?? []) {
      if (file.path === undefined) continue;
      const handle = Bun.file(file.path);
      if (!(await handle.exists())) continue;
      const text = await handle.text();
      for (const match of text.matchAll(/"sourceId":"([^"]+)"/g)) {
        if (match[1] !== undefined) derivedSurfaceSourceIds.add(match[1]);
      }
    }
    const reviewedDoc = await readJsonIfExists<{ documentInterventionRecords?: Tier2RecordRef[] }>(
      reviewedRecordsPath,
    );
    const publishableDoc = await readJsonIfExists<{
      publishableInterventions?: Tier2PublishableRef[];
    }>(publishablePath);

    if (backlogDoc === null && captureDoc === null) {
      throw new Error(
        `No backlog or capture manifest found (looked at ${display(backlogPath)} and ${display(captureManifestPath)}).`,
      );
    }

    const artifact: Tier2SourceCoverageArtifact = buildTier2SourceCoverage({
      generatedAt: new Date().toISOString(),
      paths: {
        backlogPath: backlogDoc === null ? null : display(backlogPath),
        captureManifestPath: captureDoc === null ? null : display(captureManifestPath),
        verifiedCoveragePath: verifiedDoc === null ? null : display(verifiedCoveragePath),
        derivedSurfacesManifestPath:
          derivedDoc === null ? null : display(derivedSurfacesManifestPath),
        reviewedRecordsPath: reviewedDoc === null ? null : display(reviewedRecordsPath),
        publishablePath: publishableDoc === null ? null : display(publishablePath),
      },
      backlog: backlogDoc?.sources ?? [],
      capture: captureDoc?.sources ?? [],
      verifiedCoverage: verifiedDoc?.sourceCoverageRows ?? [],
      derivedSurfaceSourceIds: [...derivedSurfaceSourceIds],
      derivedSurfacesSummary: derivedDoc?.summary ?? null,
      reviewedRecords: reviewedDoc?.documentInterventionRecords ?? [],
      publishableInterventions: publishableDoc?.publishableInterventions ?? [],
    });

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    await mkdir(dirname(markdownPath), { recursive: true });
    await Bun.write(markdownPath, renderTier2SourceCoverageMarkdown(artifact));

    return {
      outputPath: display(outputPath),
      markdownPath: display(markdownPath),
      totalSources: artifact.summary.totalSources,
      captured: artifact.summary.captured,
      ocrDerivedSources: artifact.summary.ocrDerivedSources,
      extractedSources: artifact.summary.extractedSources,
      promotedSources: artifact.summary.promotedSources,
      knownMediaSources: artifact.mediaLane.knownMediaSources,
    };
  },
});
