import { DocumentInterventionRecordSchema } from "@bp/domain/documents/intervention-records";

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

export type Tier2StructuredCounts = {
  sourceCount: number | null;
  routeCount: number | null;
  recordCount: number | null;
  candidateCount: number | null;
  eventCount: number | null;
  publishableCount: number | null;
  validCurrentRecordSchemaCount: number | null;
  invalidCurrentRecordSchemaCount: number | null;
};

export type Tier2StructuredArtifactClassification = {
  layer: Tier2StructuredLayer;
  trustTier: Tier2StructuredTrustTier;
  useCase: string;
};

export type Tier2StructuredArtifactValueSummary = Tier2StructuredArtifactClassification & {
  generatedAt: string | null;
  counts: Tier2StructuredCounts;
  summary: JsonRecord | null;
  warnings: string[];
};

export type Tier2StructuredArtifactSummary = Tier2StructuredArtifactValueSummary & {
  path: string;
  relativePath: string;
  byteLength: number;
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

function field(record: JsonRecord, key: string): unknown {
  return record[key];
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
    const routeList = asArray(field(record, "routes"));
    for (const route of routeList) {
      if (typeof route === "string" && route.length > 0) routes.push(route);
    }
    const routeId = field(record, "routeId");
    if (typeof routeId === "string" && routeId.length > 0) routes.push(routeId);
  }
  return routes;
}

export function classifyTier2StructuredArtifact(args: {
  fileName: string;
  value: unknown;
}): Tier2StructuredArtifactClassification {
  const record = asRecord(args.value);
  const fileName = args.fileName.toLowerCase();
  if (Array.isArray(field(record, "documentInterventionRecords"))) {
    return {
      layer: "reviewed_intervention_records",
      trustTier: "ideal_research_substrate",
      useCase:
        "Canonical applied-research substrate: reviewed records with routes, dates, treatments, metrics, caveats, and evidence candidate IDs.",
    };
  }
  if (
    Array.isArray(field(record, "interventionRecords")) ||
    fileName.endsWith("intervention-records-tool-call.json")
  ) {
    return {
      layer: "intervention_record_tool_call",
      trustTier: "discovery_only",
      useCase:
        "Raw Phase 3 tool-call output. Useful as prompt/repair fixtures, but it must be persisted, repaired, and reviewed before research use.",
    };
  }
  if (Array.isArray(field(record, "publishableInterventions"))) {
    return {
      layer: "publishable_interventions",
      trustTier: "serving_projection",
      useCase:
        "Public/Studio timeline projection. Useful for serving and sanity checks, but less complete than reviewed records.",
    };
  }
  if (field(record, "interventionsByRoute") !== undefined) {
    return {
      layer: "studio_route_projection",
      trustTier: "serving_projection",
      useCase:
        "Per-route Studio projection. Useful for website coverage, not as the research source of truth.",
    };
  }
  if (
    Array.isArray(field(record, "documentSourceCandidates")) ||
    Array.isArray(field(record, "documentInterventionSeeds")) ||
    Array.isArray(field(record, "documentEntityLinkCandidates"))
  ) {
    return {
      layer: "candidate_bundle",
      trustTier: "discovery_only",
      useCase:
        "Broad extraction/candidate bundle. Useful for recall, extraction fixtures, and source-gap mining; not publishable without validation/review.",
    };
  }
  if (Array.isArray(field(record, "events")) && fileName.includes("intervention-events")) {
    return {
      layer: "staging_events",
      trustTier: "validated_staging",
      useCase:
        "Validated/promoted staging events. Useful as lineage and backlog input, but duplicate review and curation gates still matter.",
    };
  }
  if (Array.isArray(field(record, "candidates")) && fileName.includes("manual-intervention")) {
    return {
      layer: "manual_intervention_candidates",
      trustTier: "reviewed_seed",
      useCase:
        "Curated manual intervention candidates. Useful as reviewed seeds and evaluation labels.",
    };
  }
  if (Array.isArray(field(record, "decisions")) && fileName.includes("duplicate")) {
    return {
      layer: "duplicate_decisions",
      trustTier: "validated_staging",
      useCase:
        "Duplicate-review decision artifact. Useful for staging lineage, not intervention facts by itself.",
    };
  }
  if (Array.isArray(field(record, "reviewGroups")) || fileName.includes("duplicate-review")) {
    return {
      layer: "duplicate_review",
      trustTier: "validated_staging",
      useCase:
        "Duplicate-review queue/audit artifact. Useful for suppression lineage and unresolved manual-review blockers.",
    };
  }
  if (Array.isArray(field(record, "items")) && fileName.includes("followup-curation")) {
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
    Array.isArray(field(record, "candidateDrafts")) ||
    Array.isArray(field(record, "evidenceCandidateDrafts"))
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

export function summarizeTier2StructuredCounts(input: {
  value: unknown;
  layer: Tier2StructuredLayer;
}): Tier2StructuredCounts {
  const record = asRecord(input.value);
  const reviewedRecords = asArray(field(record, "documentInterventionRecords"));
  const toolCallRecords = asArray(field(record, "interventionRecords"));
  const publishable = asArray(field(record, "publishableInterventions"));
  const events = asArray(field(record, "events"));
  const candidates = asArray(field(record, "candidates"));
  const sourceCandidates = asArray(field(record, "documentSourceCandidates"));
  const interventionSeeds = asArray(field(record, "documentInterventionSeeds"));
  const routeProjection = asRecord(field(record, "interventionsByRoute"));

  let validCurrentRecordSchemaCount: number | null = null;
  let invalidCurrentRecordSchemaCount: number | null = null;
  if (input.layer === "reviewed_intervention_records") {
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
    input.layer === "candidate_bundle"
      ? sourceCandidates.length + interventionSeeds.length
      : candidates.length || null;

  return {
    sourceCount:
      uniqueStringCount([
        ...reviewedRecords.map((row) => field(asRecord(row), "sourceId")),
        ...publishable.map((row) => field(asRecord(row), "sourceId")),
        ...events.map((row) => field(asRecord(row), "sourceId")),
        ...sourceCandidates.map((row) => field(asRecord(row), "sourceId")),
        ...candidates.map((row) => field(asRecord(row), "sourceId")),
      ]) || null,
    routeCount:
      uniqueStringCount([
        ...flattenRouteValues(reviewedRecords),
        ...flattenRouteValues(publishable),
        ...flattenRouteValues(events),
        ...flattenRouteValues(candidates),
        ...projectedRouteKeys,
        ...flattenRouteValues(projectedRouteEntries),
      ]) || null,
    recordCount: reviewedRecords.length || toolCallRecords.length || null,
    candidateCount,
    eventCount: events.length || null,
    publishableCount: publishable.length || null,
    validCurrentRecordSchemaCount,
    invalidCurrentRecordSchemaCount,
  };
}

export function summarizeTier2StructuredArtifactValue(input: {
  fileName: string;
  value: unknown;
}): Tier2StructuredArtifactValueSummary {
  const classification = classifyTier2StructuredArtifact(input);
  const counts = summarizeTier2StructuredCounts({
    value: input.value,
    layer: classification.layer,
  });
  const record = asRecord(input.value);
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
    ...classification,
    generatedAt: stringValue(field(record, "generatedAt")),
    counts,
    summary:
      Object.keys(asRecord(field(record, "summary"))).length > 0
        ? asRecord(field(record, "summary"))
        : null,
    warnings,
  };
}

function artifactRank(artifact: Tier2StructuredArtifactSummary): number {
  if (artifact.layer === "reviewed_intervention_records") {
    const reviewedBonus = artifact.relativePath.includes("reviewed") ? 20_000 : 0;
    const sanityBonus = artifact.relativePath.includes("sanity") ? -5_000 : 0;
    return (
      10_000 + reviewedBonus + sanityBonus + (artifact.counts.validCurrentRecordSchemaCount ?? 0)
    );
  }
  if (artifact.layer === "publishable_interventions") {
    return 5_000 + (artifact.counts.publishableCount ?? 0);
  }
  return 0;
}

function nextActionsForInventory(
  inventory: Omit<Tier2StructuredDataInventory, "nextActions">,
): string[] {
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
    actions.push(
      "Promote candidate bundles through validation, duplicate review, and reviewed records.",
    );
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
    actions.push(
      "Generate the publishable intervention projection from the reviewed record corpus.",
    );
  }
  if (actions.length === 0) {
    actions.push("No Tier 2 structured-data inventory gaps found for the scanned docs root.");
  }
  return actions;
}

export function buildTier2StructuredDataInventoryFromArtifacts(input: {
  generatedAt: string;
  docsRoot: string;
  outputPath: string;
  markdownPath: string | null;
  artifacts: readonly Tier2StructuredArtifactSummary[];
}): Tier2StructuredDataInventory {
  const artifacts = [...input.artifacts].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
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
    generatedAt: input.generatedAt,
    docsRoot: input.docsRoot,
    outputPath: input.outputPath,
    markdownPath: input.markdownPath,
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
      stagingEventArtifactCount: artifacts.filter((artifact) => artifact.layer === "staging_events")
        .length,
      unknownArtifactCount: artifacts.filter((artifact) => artifact.layer === "unknown_json")
        .length,
      bestResearchArtifactPath: bestResearchArtifact?.relativePath ?? null,
      bestPublishableArtifactPath: bestPublishableArtifact?.relativePath ?? null,
    },
    artifacts,
  };

  return {
    ...inventoryWithoutActions,
    nextActions: nextActionsForInventory(inventoryWithoutActions),
  };
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
  return lines.join("\n");
}
