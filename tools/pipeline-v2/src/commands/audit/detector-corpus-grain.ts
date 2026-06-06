import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  detectDetectorSpecificScoreVectorIds,
  detectorCorpusGrainAuditMarkdownPath,
  detectorCorpusGrainAuditPath,
  routeMonthShadowAuditPath,
} from "@bp/applied-research/artifacts";
import {
  DATA_PRODUCT_MANIFEST,
  parseDataProductManifestText,
} from "@bp/applied-research/data-products";
import {
  buildDetectorCorpusGrainAudit,
  type DetectorCorpusGrainAudit,
  type RouteMonthShadowAuditArtifact,
  renderDetectorCorpusGrainAuditMarkdown,
} from "@bp/applied-research/evaluation";
import { loadDetectorCorpusGrainLocalDbRows } from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

export {
  detectorCorpusGrainAuditMarkdownPath,
  detectorCorpusGrainAuditPath,
} from "@bp/applied-research/artifacts";
export {
  buildDetectorCorpusGrainAudit,
  renderDetectorCorpusGrainAuditMarkdown,
} from "@bp/applied-research/evaluation";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

async function readOptionalJson(path: string | null): Promise<unknown | null> {
  if (path === null) return null;
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return await file.json();
}

function asRouteMonthShadowAudit(value: unknown): RouteMonthShadowAuditArtifact | null {
  if (
    value !== null &&
    typeof value === "object" &&
    "artifactKind" in value &&
    value.artifactKind === "route_month_false_negative_shadow_audit"
  ) {
    return value as RouteMonthShadowAuditArtifact;
  }
  return null;
}

export default defineCommand({
  path: ["audit", "detector-corpus-grain"],
  summary: "Audit detector feature grains against data products and release coverage rows.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Release calendar year"),
      month: arg.positiveInt().default(3).describe("Release calendar month, 1-12"),
      historyStartMonth: z
        .string()
        .default("2023-04")
        .describe("Start month for historical detector corpus coverage"),
      runId: z.string().optional().describe("Detector/evidence run id"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      manifest: z.string().optional().describe("Optional JSON data-product manifest path"),
      dataProductCompleteness: z
        .string()
        .optional()
        .describe("Optional data-product completeness JSON to attach product statuses"),
      routeMonthShadowAudit: z
        .string()
        .optional()
        .describe("Optional route-month false-negative shadow audit JSON"),
      output: z.string().optional().describe("Override output path for grain audit JSON"),
      markdownOutput: z
        .string()
        .optional()
        .describe("Override output path for grain audit Markdown"),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    historyStartMonth: z.string(),
    runId: z.string(),
    outputPath: z.string(),
    markdownOutputPath: z.string(),
    detectorCount: z.number().int().nonnegative(),
    completeDetectorCount: z.number().int().nonnegative(),
    partialDetectorCount: z.number().int().nonnegative(),
    missingDetectorCount: z.number().int().nonnegative(),
    blockedDetectorCount: z.number().int().nonnegative(),
    registryOnlyDetectorCount: z.number().int().nonnegative(),
    detectorsUsingScreeningFeatureCount: z.number().int().nonnegative(),
    highGranularityRiskDetectorCount: z.number().int().nonnegative(),
    coverageAuditedDetectorCount: z.number().int().nonnegative(),
    grainPolicyWarningDetectorCount: z.number().int().nonnegative(),
    releaseGateWarnDetectorCount: z.number().int().nonnegative(),
    releaseGateBlockDetectorCount: z.number().int().nonnegative(),
    falseNegativeShadowAuditRequiredDetectorCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const historyStartMonth = input.options.historyStartMonth;
    const runId = input.options.runId ?? `bus-observatory-${releaseMonth}`;
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? detectorCorpusGrainAuditPath({ artifactRoot, historyStartMonth, releaseMonth })
        : fromCliPath(input.options.output);
    const markdownPath =
      input.options.markdownOutput === undefined
        ? detectorCorpusGrainAuditMarkdownPath({ artifactRoot, historyStartMonth, releaseMonth })
        : fromCliPath(input.options.markdownOutput);
    const manifest =
      input.options.manifest === undefined
        ? DATA_PRODUCT_MANIFEST
        : parseDataProductManifestText(await Bun.file(fromCliPath(input.options.manifest)).text());
    const dataProductCompletenessPath =
      input.options.dataProductCompleteness === undefined
        ? null
        : fromCliPath(input.options.dataProductCompleteness);
    const productCompleteness = await readOptionalJson(dataProductCompletenessPath);
    const routeMonthShadowPath =
      input.options.routeMonthShadowAudit === undefined
        ? routeMonthShadowAuditPath({ artifactRoot, releaseMonth })
        : fromCliPath(input.options.routeMonthShadowAudit);
    const routeMonthShadowAudit = asRouteMonthShadowAudit(
      await readOptionalJson(routeMonthShadowPath),
    );
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const detectorSpecificScoreVectorIds = await detectDetectorSpecificScoreVectorIds({
      artifactRoot,
      historyStartMonth,
      releaseMonth,
    });
    const sqlite = new BunDatabase(dbPath, { readonly: true });

    let audit: DetectorCorpusGrainAudit;
    try {
      sqlite.exec("PRAGMA busy_timeout = 30000");
      const localRows = loadDetectorCorpusGrainLocalDbRows({
        sqlite,
        releaseMonth,
      });
      audit = buildDetectorCorpusGrainAudit({
        candidateCounts: localRows.candidateCounts,
        coverageCounts: localRows.coverageCounts,
        manifest,
        productCompleteness,
        releaseMonth,
        historyStartMonth,
        runId,
        generatedAt: new Date().toISOString(),
        dbPath,
        artifactPath: outputPath,
        markdownPath,
        displayRoot: repoRoot,
        dataProductCompletenessPath,
        routeMonthShadowAudit,
        routeMonthShadowAuditPath: routeMonthShadowAudit === null ? null : routeMonthShadowPath,
        detectorSpecificScoreVectorIds,
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await mkdir(dirname(markdownPath), { recursive: true });
    await writeJson(outputPath, audit);
    await Bun.write(markdownPath, renderDetectorCorpusGrainAuditMarkdown(audit));

    return {
      releaseMonth,
      historyStartMonth,
      runId,
      outputPath: repoDisplayPath(outputPath),
      markdownOutputPath: repoDisplayPath(markdownPath),
      detectorCount: audit.summary.detectorCount,
      completeDetectorCount: audit.summary.completeDetectorCount,
      partialDetectorCount: audit.summary.partialDetectorCount,
      missingDetectorCount: audit.summary.missingDetectorCount,
      blockedDetectorCount: audit.summary.blockedDetectorCount,
      registryOnlyDetectorCount: audit.summary.registryOnlyDetectorCount,
      detectorsUsingScreeningFeatureCount: audit.summary.detectorsUsingScreeningFeatureCount,
      highGranularityRiskDetectorCount: audit.summary.highGranularityRiskDetectorCount,
      coverageAuditedDetectorCount: audit.summary.coverageAuditedDetectorCount,
      grainPolicyWarningDetectorCount: audit.summary.grainPolicyWarningDetectorCount,
      releaseGateWarnDetectorCount: audit.summary.releaseGateWarnDetectorCount,
      releaseGateBlockDetectorCount: audit.summary.releaseGateBlockDetectorCount,
      falseNegativeShadowAuditRequiredDetectorCount:
        audit.summary.falseNegativeShadowAuditRequiredDetectorCount,
    };
  },
});
