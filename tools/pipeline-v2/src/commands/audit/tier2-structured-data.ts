import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { DocumentInterventionRecordSchema } from "@bp/domain";
import { Glob } from "bun";
import { writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

type JsonRecord = Record<string, unknown>;

export type Tier2StructuredLayer =
  | "candidate_bundle"
  | "staging_events"
  | "manual_intervention_candidates"
  | "reviewed_intervention_records"
  | "intervention_record_tool_call"
  | "publishable_interventions"
  | "studio_route_projection"
  | "ocr_markdown_candidates"
  | "duplicate_review"
  | "duplicate_decisions"
  | "followup_curation"
  | "audit_report"
  | "llm_response_trace"
  | "unknown_json";

export type Tier2StructuredTrustTier =
  | "ideal_research_substrate"
  | "serving_projection"
  | "reviewed_seed"
  | "validated_staging"
  | "discovery_only"
  | "provenance_only"
  | "legacy_or_unknown";

export type Tier2StructuredArtifactSummary = {
  path: string;
  relativePath: string;
  layer: Tier2StructuredLayer;
  trustTier: Tier2StructuredTrustTier;
  useCase: string;
  byteLength: number;
  generatedAt: string | null;
  counts: {
    sourceCount: number | null;
    routeCount: number | null;
    recordCount: number | null;
    candidateCount: number | null;
    eventCount: number | null;
    publishableCount: number | null;
    validCurrentRecordSchemaCount: number | null;
    invalidCurrentRecordSchemaCount: number | null;
  };
  summary: JsonRecord | null;
  warnings: string[];
};

export type Tier2StructuredDataInventory = {
  schemaVersion: 1;
  generatedAt: string;
  docsRoot: string;
  outputPath: string;
  markdownPath: string | null;
  idealStructuredData: {
    canonicalResearchContract: "bp.document_intervention_record.v1";
    researchLayer: "reviewed_intervention_records";
    servingLayer: "publishable_interventions";
    discoveryLayer: "candidate_bundle";
    requiredCapabilities: string[];
    notes: string[];
  };
  summary: {
    artifactCount: number;
    reviewedResearchArtifactCount: number;
    publishableArtifactCount: number;
    candidateBundleArtifactCount: number;
    stagingEventArtifactCount: number;
    unknownArtifactCount: number;
    bestResearchArtifactPath: string | null;
    bestPublishableArtifactPath: string | null;
  };
  artifacts: Tier2StructuredArtifactSummary[];
  nextActions: string[];
};

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function uniqueStringCount(values: unknown[]): number {
  const set = new Set<string>();
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) set.add(value);
  }
  return set.size;
}

function flattenRouteValues(rows: unknown[]): string[] {
  const routes: string[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    const routeList = asArray(record["routes"]);
    for (const route of routeList) {
      if (typeof route === "string" && route.length > 0) routes.push(route);
    }
    const routeId = record["routeId"];
    if (typeof routeId === "string" && routeId.length > 0) routes.push(routeId);
  }
  return routes;
}

export function classifyTier2StructuredArtifact(args: {
  fileName: string;
  value: unknown;
}): { layer: Tier2StructuredLayer; trustTier: Tier2StructuredTrustTier; useCase: string } {
  const record = asRecord(args.value);
  const fileName = args.fileName.toLowerCase();
  if (Array.isArray(record["documentInterventionRecords"])) {
    return {
      layer: "reviewed_intervention_records",
      trustTier: "ideal_research_substrate",
      useCase:
        "Canonical applied-research substrate: reviewed records with routes, dates, treatments, metrics, caveats, and evidence candidate IDs.",
    };
  }
  if (
    Array.isArray(record["interventionRecords"]) ||
    fileName.endsWith("intervention-records-tool-call.json")
  ) {
    return {
      layer: "intervention_record_tool_call",
      trustTier: "discovery_only",
      useCase:
        "Raw Phase 3 tool-call output. Useful as prompt/repair fixtures, but it must be persisted, repaired, and reviewed before research use.",
    };
  }
  if (Array.isArray(record["publishableInterventions"])) {
    return {
      layer: "publishable_interventions",
      trustTier: "serving_projection",
      useCase:
        "Public/Studio timeline projection. Useful for serving and sanity checks, but less complete than reviewed records.",
    };
  }
  if (record["interventionsByRoute"] !== undefined) {
    return {
      layer: "studio_route_projection",
      trustTier: "serving_projection",
      useCase:
        "Per-route Studio projection. Useful for website coverage, not as the research source of truth.",
    };
  }
  if (
    Array.isArray(record["documentSourceCandidates"]) ||
    Array.isArray(record["documentInterventionSeeds"]) ||
    Array.isArray(record["documentEntityLinkCandidates"])
  ) {
    return {
      layer: "candidate_bundle",
      trustTier: "discovery_only",
      useCase:
        "Broad extraction/candidate bundle. Useful for recall, extraction fixtures, and source-gap mining; not publishable without validation/review.",
    };
  }
  if (Array.isArray(record["events"]) && fileName.includes("intervention-events")) {
    return {
      layer: "staging_events",
      trustTier: "validated_staging",
      useCase:
        "Validated/promoted staging events. Useful as lineage and backlog input, but duplicate review and curation gates still matter.",
    };
  }
  if (Array.isArray(record["candidates"]) && fileName.includes("manual-intervention")) {
    return {
      layer: "manual_intervention_candidates",
      trustTier: "reviewed_seed",
      useCase:
        "Curated manual intervention candidates. Useful as reviewed seeds and evaluation labels.",
    };
  }
  if (Array.isArray(record["decisions"]) && fileName.includes("duplicate")) {
    return {
      layer: "duplicate_decisions",
      trustTier: "validated_staging",
      useCase:
        "Duplicate-review decision artifact. Useful for staging lineage, not intervention facts by itself.",
    };
  }
  if (Array.isArray(record["reviewGroups"]) || fileName.includes("duplicate-review")) {
    return {
      layer: "duplicate_review",
      trustTier: "validated_staging",
      useCase:
        "Duplicate-review queue/audit artifact. Useful for suppression lineage and unresolved manual-review blockers.",
    };
  }
  if (Array.isArray(record["items"]) && fileName.includes("followup-curation")) {
    return {
      layer: "followup_curation",
      trustTier: "reviewed_seed",
      useCase:
        "Follow-up OCR curation queue or decisions. Useful as extraction backlog and reviewed seed material.",
    };
  }
  if (
    fileName.endsWith("openrouter-response.json") ||
    fileName.endsWith("error.json") ||
    fileName.includes("llm")
  ) {
    return {
      layer: "llm_response_trace",
      trustTier: "provenance_only",
      useCase:
        "Model/provider trace. Useful for debugging and provenance; not structured intervention data.",
    };
  }
  if (
    fileName.includes("report") ||
    fileName.includes("audit") ||
    fileName.includes("verification")
  ) {
    return {
      layer: "audit_report",
      trustTier: "provenance_only",
      useCase:
        "Pipeline report or verification artifact. Useful for provenance; not a structured intervention corpus.",
    };
  }
  if (
    fileName.includes("ocr-markdown-candidates") ||
    Array.isArray(record["candidateDrafts"]) ||
    Array.isArray(record["evidenceCandidateDrafts"])
  ) {
    return {
      layer: "ocr_markdown_candidates",
      trustTier: "discovery_only",
      useCase:
        "OCR-page candidate draft output. Useful for prompt examples and recall mining; requires validation and promotion.",
    };
  }
  return {
    layer: "unknown_json",
    trustTier: "legacy_or_unknown",
    useCase:
      "Unclassified JSON artifact. Inspect manually before using as training, evaluation, or serving input.",
  };
}

function summarizeCounts(
  value: unknown,
  layer: Tier2StructuredLayer,
): Tier2StructuredArtifactSummary["counts"] {
  const record = asRecord(value);
  const reviewedRecords = asArray(record["documentInterventionRecords"]);
  const toolCallRecords = asArray(record["interventionRecords"]);
  const publishable = asArray(record["publishableInterventions"]);
  const events = asArray(record["events"]);
  const candidates = asArray(record["candidates"]);
  const sourceCandidates = asArray(record["documentSourceCandidates"]);
  const interventionSeeds = asArray(record["documentInterventionSeeds"]);
  const routeProjection = asRecord(record["interventionsByRoute"]);

  let validCurrentRecordSchemaCount: number | null = null;
  let invalidCurrentRecordSchemaCount: number | null = null;
  if (layer === "reviewed_intervention_records") {
    validCurrentRecordSchemaCount = 0;
    invalidCurrentRecordSchemaCount = 0;
    for (const interventionRecord of reviewedRecords) {
      const parsed = DocumentInterventionRecordSchema.safeParse(interventionRecord);
      if (parsed.success) validCurrentRecordSchemaCount += 1;
      else invalidCurrentRecordSchemaCount += 1;
    }
  }

  const projectedRouteKeys = Object.keys(routeProjection);
  const projectedRouteEntries = projectedRouteKeys.flatMap((route) =>
    asArray(routeProjection[route]),
  );
  const candidateCount =
    layer === "candidate_bundle"
      ? sourceCandidates.length + interventionSeeds.length
      : candidates.length || null;
  const recordCount = reviewedRecords.length || toolCallRecords.length || null;
  const publishableCount = publishable.length || null;
  const eventCount = events.length || null;
  const sourceCount =
    uniqueStringCount([
      ...reviewedRecords.map((row) => asRecord(row)["sourceId"]),
      ...publishable.map((row) => asRecord(row)["sourceId"]),
      ...events.map((row) => asRecord(row)["sourceId"]),
      ...sourceCandidates.map((row) => asRecord(row)["sourceId"]),
      ...candidates.map((row) => asRecord(row)["sourceId"]),
    ]) || null;
  const routeCount =
    uniqueStringCount([
      ...flattenRouteValues(reviewedRecords),
      ...flattenRouteValues(publishable),
      ...flattenRouteValues(events),
      ...flattenRouteValues(candidates),
      ...projectedRouteKeys,
      ...flattenRouteValues(projectedRouteEntries),
    ]) || null;

  return {
    sourceCount,
    routeCount,
    recordCount,
    candidateCount,
    eventCount,
    publishableCount,
    validCurrentRecordSchemaCount,
    invalidCurrentRecordSchemaCount,
  };
}

export async function summarizeTier2StructuredArtifact(args: {
  docsRoot: string;
  path: string;
}): Promise<Tier2StructuredArtifactSummary | null> {
  const file = Bun.file(args.path);
  if (!(await file.exists())) return null;
  let value: unknown;
  try {
    value = await file.json();
  } catch (error) {
    return {
      path: args.path,
      relativePath: relative(args.docsRoot, args.path),
      layer: "unknown_json",
      trustTier: "legacy_or_unknown",
      useCase: "Unreadable JSON artifact.",
      byteLength: file.size,
      generatedAt: null,
      counts: {
        sourceCount: null,
        routeCount: null,
        recordCount: null,
        candidateCount: null,
        eventCount: null,
        publishableCount: null,
        validCurrentRecordSchemaCount: null,
        invalidCurrentRecordSchemaCount: null,
      },
      summary: null,
      warnings: [`json_parse_failed: ${(error as Error).message}`],
    };
  }

  const classification = classifyTier2StructuredArtifact({
    fileName: args.path,
    value,
  });
  const counts = summarizeCounts(value, classification.layer);
  const record = asRecord(value);
  const warnings: string[] = [];
  if (
    counts.invalidCurrentRecordSchemaCount !== null &&
    counts.invalidCurrentRecordSchemaCount > 0
  ) {
    warnings.push(
      `${counts.invalidCurrentRecordSchemaCount} reviewed record(s) do not parse as bp.document_intervention_record.v1.`,
    );
  }
  if (classification.layer === "candidate_bundle") {
    warnings.push("candidate bundle is recall-oriented and must not be treated as reviewed facts");
  }
  if (classification.layer === "staging_events") {
    warnings.push("staging events require duplicate review/curation before public use");
  }
  if (classification.layer === "studio_route_projection") {
    warnings.push("route projection is lossy and should not be used as the research substrate");
  }

  return {
    path: args.path,
    relativePath: relative(args.docsRoot, args.path),
    layer: classification.layer,
    trustTier: classification.trustTier,
    useCase: classification.useCase,
    byteLength: file.size,
    generatedAt: stringValue(record["generatedAt"]),
    counts,
    summary:
      Object.keys(asRecord(record["summary"])).length > 0
        ? asRecord(record["summary"])
        : null,
    warnings,
  };
}

function artifactRank(artifact: Tier2StructuredArtifactSummary): number {
  if (artifact.layer === "reviewed_intervention_records") {
    const reviewedBonus = artifact.relativePath.includes("reviewed") ? 20_000 : 0;
    const sanityBonus = artifact.relativePath.includes("sanity") ? -5_000 : 0;
    return 10_000 + reviewedBonus + sanityBonus + (artifact.counts.validCurrentRecordSchemaCount ?? 0);
  }
  if (artifact.layer === "publishable_interventions") {
    return 5_000 + (artifact.counts.publishableCount ?? 0);
  }
  return 0;
}

function nextActionsForInventory(inventory: Omit<Tier2StructuredDataInventory, "nextActions">): string[] {
  const actions: string[] = [];
  if (inventory.summary.bestResearchArtifactPath === null) {
    actions.push(
      "Create a reviewed full-corpus intervention-record artifact that conforms to bp.document_intervention_record.v1.",
    );
  }
  const candidateBundles = inventory.artifacts.filter(
    (artifact) => artifact.layer === "candidate_bundle",
  );
  const reviewed = inventory.artifacts.filter(
    (artifact) => artifact.layer === "reviewed_intervention_records",
  );
  if (candidateBundles.length > 0 && reviewed.length === 0) {
    actions.push("Promote candidate bundles through validation, duplicate review, and reviewed records.");
  }
  const fullCorpusReviewed = inventory.artifacts.find(
    (artifact) =>
      artifact.layer === "reviewed_intervention_records" &&
      artifact.relativePath.includes("tier2-full-corpus-2026-05-24-pass2"),
  );
  if (fullCorpusReviewed === undefined) {
    actions.push(
      "Backfill the full-corpus reviewed intervention-record layer; current reviewed records are from the smaller curated subset.",
    );
  }
  if (inventory.summary.bestPublishableArtifactPath === null) {
    actions.push("Generate the publishable intervention projection from the reviewed record corpus.");
  }
  if (actions.length === 0) {
    actions.push("No Tier 2 structured-data inventory gaps found for the scanned docs root.");
  }
  return actions;
}

export async function buildTier2StructuredDataInventory(args: {
  docsRoot?: string | undefined;
  output?: string | undefined;
  markdown?: string | undefined;
}): Promise<Tier2StructuredDataInventory> {
  const artifactRoot = defaultArtifactRootPath();
  const docsRoot = args.docsRoot ?? join(artifactRoot, "docs");
  const outputPath =
    args.output ?? join(artifactRoot, "audits", "tier2-structured-data-inventory.json");
  const markdownPath =
    args.markdown ?? join(artifactRoot, "audits", "tier2-structured-data-inventory.md");
  const glob = new Glob("**/*.json");
  const artifacts: Tier2StructuredArtifactSummary[] = [];

  for await (const relativePath of glob.scan({ cwd: docsRoot })) {
    const lower = relativePath.toLowerCase();
    if (
      !lower.includes("intervention") &&
      !lower.includes("candidate-bundle") &&
      !lower.includes("ocr-markdown-candidates") &&
      !lower.includes("followup-curation")
    ) {
      continue;
    }
    const summary = await summarizeTier2StructuredArtifact({
      docsRoot,
      path: join(docsRoot, relativePath),
    });
      if (summary !== null) artifacts.push(summary);
  }

  artifacts.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const bestResearchArtifact =
    artifacts
      .filter((artifact) => artifact.layer === "reviewed_intervention_records")
      .toSorted((left, right) => artifactRank(right) - artifactRank(left))[0] ?? null;
  const bestPublishableArtifact =
    artifacts
      .filter((artifact) => artifact.layer === "publishable_interventions")
      .toSorted((left, right) => artifactRank(right) - artifactRank(left))[0] ?? null;

  const inventoryWithoutActions = {
    schemaVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    docsRoot,
    outputPath,
    markdownPath,
    idealStructuredData: {
      canonicalResearchContract: "bp.document_intervention_record.v1" as const,
      researchLayer: "reviewed_intervention_records" as const,
      servingLayer: "publishable_interventions" as const,
      discoveryLayer: "candidate_bundle" as const,
      requiredCapabilities: [
        "source URL/final URL/date/provenance",
        "route IDs and service mode",
        "corridor streets/endpoints/intersections",
        "effective date with precision and status history",
        "primary treatment families and treatment components",
        "source-stated metrics and caveats",
        "evidence candidate IDs traceable to cited source spans",
        "review/disposition state before serving projection",
      ],
      notes: [
        "Candidate bundles maximize recall and are not final facts.",
        "Reviewed intervention records are the best substrate for applied research, causal screening, and detector evidence.",
        "Publishable projections are intentionally smaller and lossy so they should not be used as the research source of truth.",
      ],
    },
    summary: {
      artifactCount: artifacts.length,
      reviewedResearchArtifactCount: artifacts.filter(
        (artifact) => artifact.layer === "reviewed_intervention_records",
      ).length,
      publishableArtifactCount: artifacts.filter(
        (artifact) => artifact.layer === "publishable_interventions",
      ).length,
      candidateBundleArtifactCount: artifacts.filter(
        (artifact) => artifact.layer === "candidate_bundle",
      ).length,
      stagingEventArtifactCount: artifacts.filter(
        (artifact) => artifact.layer === "staging_events",
      ).length,
      unknownArtifactCount: artifacts.filter((artifact) => artifact.layer === "unknown_json")
        .length,
      bestResearchArtifactPath: bestResearchArtifact?.relativePath ?? null,
      bestPublishableArtifactPath: bestPublishableArtifact?.relativePath ?? null,
    },
    artifacts,
  };
  const inventory: Tier2StructuredDataInventory = {
    ...inventoryWithoutActions,
    nextActions: nextActionsForInventory(inventoryWithoutActions),
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, inventory);
  if (markdownPath.length > 0) {
    await mkdir(dirname(markdownPath), { recursive: true });
    await Bun.write(markdownPath, renderTier2StructuredDataInventoryMarkdown(inventory));
  }
  return inventory;
}

export function renderTier2StructuredDataInventoryMarkdown(
  inventory: Tier2StructuredDataInventory,
): string {
  const lines = [
    "# Tier 2 Structured Data Inventory",
    "",
    `Generated: ${inventory.generatedAt}`,
    `Docs root: \`${inventory.docsRoot}\``,
    "",
    "## Ideal Structured Data",
    "",
    `Canonical research contract: \`${inventory.idealStructuredData.canonicalResearchContract}\``,
    `Research layer: \`${inventory.idealStructuredData.researchLayer}\``,
    `Serving layer: \`${inventory.idealStructuredData.servingLayer}\``,
    "",
    "Required capabilities:",
    ...inventory.idealStructuredData.requiredCapabilities.map((capability) => `- ${capability}`),
    "",
    "Notes:",
    ...inventory.idealStructuredData.notes.map((note) => `- ${note}`),
    "",
    "## Summary",
    "",
    `- artifacts: ${inventory.summary.artifactCount}`,
    `- reviewed research artifacts: ${inventory.summary.reviewedResearchArtifactCount}`,
    `- publishable artifacts: ${inventory.summary.publishableArtifactCount}`,
    `- candidate bundles: ${inventory.summary.candidateBundleArtifactCount}`,
    `- staging event artifacts: ${inventory.summary.stagingEventArtifactCount}`,
    `- unknown artifacts: ${inventory.summary.unknownArtifactCount}`,
    `- best research artifact: \`${inventory.summary.bestResearchArtifactPath ?? "none"}\``,
    `- best publishable artifact: \`${inventory.summary.bestPublishableArtifactPath ?? "none"}\``,
    "",
    "## Artifacts",
    "",
    "| Artifact | Layer | Trust | Records | Candidates | Events | Publishable | Routes | Sources | Warnings |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];

  for (const artifact of inventory.artifacts) {
    lines.push(
      [
        `\`${artifact.relativePath}\``,
        `\`${artifact.layer}\``,
        `\`${artifact.trustTier}\``,
        artifact.counts.recordCount ?? "-",
        artifact.counts.candidateCount ?? "-",
        artifact.counts.eventCount ?? "-",
        artifact.counts.publishableCount ?? "-",
        artifact.counts.routeCount ?? "-",
        artifact.counts.sourceCount ?? "-",
        artifact.warnings.length > 0 ? artifact.warnings.join("; ") : "-",
      ].join(" | "),
    );
  }

  lines.push("", "## Next Actions", "");
  for (const action of inventory.nextActions) lines.push(`- ${action}`);
  lines.push("");
  return `${lines.join("\n")}`;
}

export default defineCommand({
  path: ["audit", "tier2-structured-data"],
  summary:
    "Inventory Tier 2 structured-document artifacts and identify the best current research/serving substrates.",
  input: {
    options: z.object({
      docsRoot: z
        .string()
        .optional()
        .describe("Docs artifact root. Defaults to data/artifacts/docs."),
      output: z.string().optional().describe("Override output path for inventory JSON."),
      markdown: z.string().optional().describe("Override output path for inventory Markdown."),
      minArtifacts: arg
        .positiveInt()
        .default(1)
        .describe("Fail if fewer than this many structured artifacts are found."),
    }),
  },
  output: z.object({
    outputPath: z.string(),
    markdownPath: z.string().nullable(),
    artifactCount: z.number(),
    bestResearchArtifactPath: z.string().nullable(),
    bestPublishableArtifactPath: z.string().nullable(),
    nextActions: z.array(z.string()),
  }),
  async run({ input }) {
    const inventory = await buildTier2StructuredDataInventory({
      docsRoot: input.options.docsRoot === undefined ? undefined : fromCliPath(input.options.docsRoot),
      output: input.options.output === undefined ? undefined : fromCliPath(input.options.output),
      markdown:
        input.options.markdown === undefined ? undefined : fromCliPath(input.options.markdown),
    });
    if (inventory.summary.artifactCount < input.options.minArtifacts) {
      throw new Error(
        `Expected at least ${input.options.minArtifacts} Tier 2 structured artifact(s), found ${inventory.summary.artifactCount}.`,
      );
    }
    return {
      outputPath: inventory.outputPath,
      markdownPath: inventory.markdownPath,
      artifactCount: inventory.summary.artifactCount,
      bestResearchArtifactPath: inventory.summary.bestResearchArtifactPath,
      bestPublishableArtifactPath: inventory.summary.bestPublishableArtifactPath,
      nextActions: inventory.nextActions,
    };
  },
});
