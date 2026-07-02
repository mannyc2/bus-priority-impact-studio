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
  | "mta_wiki_canonical_bridge"
  | "mta_wiki_source_alignment"
  | "materialized_research_views"
  | "source_review_packs"
  | "source_disposition_queue"
  | "source_disposition_receipts"
  | "source_receipt_closure_audit"
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
    materializedResearchViewArtifactCount: number;
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
  if (field(record, "mtaWikiCanonicalBridge") === true) {
    return {
      layer: "mta_wiki_canonical_bridge",
      trustTier: "discovery_only",
      useCase:
        "External mta-wiki canonical graph bridge. Useful for review-queue seeding and coverage expansion, but not publishable until collapsed into reviewed intervention records.",
    };
  }
  if (
    field(record, "artifactKind") === "bp.tier2_mta_wiki_source_alignment.v1" ||
    fileName.includes("mta-wiki-source-alignment")
  ) {
    return {
      layer: "mta_wiki_source_alignment",
      trustTier: "discovery_only",
      useCase:
        "Exact-key source alignment between the Tier 2 source queue and mta-wiki review groups. Useful as authoring context only; it does not close source receipts or create publishable facts.",
    };
  }
  if (
    field(record, "artifactKind") === "bp.tier2_vocab_materialized_views.v1" ||
    fileName.includes("vocab-materialized-views")
  ) {
    return {
      layer: "materialized_research_views",
      trustTier: "validated_staging",
      useCase:
        "Machine-built full-corpus research/review views over canonical Tier 2 surfaces. Useful for detector features, route evidence bundles, and review queues; not reviewed or publishable intervention facts.",
    };
  }
  if (
    field(record, "artifactKind") === "bp.tier2_source_disposition_queue.v1" ||
    fileName.includes("source-disposition-queue")
  ) {
    return {
      layer: "source_disposition_queue",
      trustTier: "validated_staging",
      useCase:
        "Source-level review/disposition queue over full-corpus Tier 2 materialized views. Useful for review receipt tracking and reviewed-record generation; not reviewed or publishable intervention facts.",
    };
  }
  if (
    field(record, "artifactKind") === "bp.tier2_source_review_pack_batch.v1" ||
    fileName.includes("source-review-packs")
  ) {
    return {
      layer: "source_review_packs",
      trustTier: "validated_staging",
      useCase:
        "Source-scoped review pack batch over the full-corpus Tier 2 queue. Useful as authoring handoff for reviewed records and dispositions; not reviewed or publishable intervention facts.",
    };
  }
  if (
    field(record, "artifactKind") === "bp.tier2_source_disposition_receipts.v1" ||
    fileName.includes("source-disposition-receipts")
  ) {
    return {
      layer: "source_disposition_receipts",
      trustTier: "validated_staging",
      useCase:
        "Explicit source-disposition receipt artifact. Useful for closing source review accounting; not reviewed or publishable intervention facts.",
    };
  }
  if (
    field(record, "artifactKind") === "bp.tier2_source_receipt_closure_audit.v1" ||
    fileName.includes("source-receipt-closure")
  ) {
    return {
      layer: "source_receipt_closure_audit",
      trustTier: "validated_staging",
      useCase:
        "Source-level receipt closure audit over the Tier 2 source queue, reviewed records, and disposition receipts. Useful as a promotion gate; not reviewed or publishable intervention facts.",
    };
  }
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
  const reviewGroups = asArray(field(record, "reviewGroups"));
  const sourceReviewPacks = asArray(field(record, "packs"));
  const sourceDispositionItems = asArray(field(record, "items"));
  const sourceDispositionReceipts = asArray(field(record, "receipts"));
  const sourceClosureRows = asArray(field(record, "sourceClosures"));
  const alignedSources = asArray(field(record, "alignedSources"));
  const summary = asRecord(field(record, "summary"));
  const isMaterializedResearchViews = input.layer === "materialized_research_views";
  const isSourceReviewPacks = input.layer === "source_review_packs";
  const isSourceDispositionQueue = input.layer === "source_disposition_queue";
  const isSourceDispositionReceipts = input.layer === "source_disposition_receipts";
  const isSourceReceiptClosureAudit = input.layer === "source_receipt_closure_audit";
  const isMtaWikiSourceAlignment = input.layer === "mta_wiki_source_alignment";

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
    input.layer === "mta_wiki_canonical_bridge"
      ? typeof summary["interventionCandidateRecordCount"] === "number"
        ? summary["interventionCandidateRecordCount"]
        : null
      : isMtaWikiSourceAlignment &&
          typeof summary["alignedInterventionCandidateRecordCount"] === "number"
        ? summary["alignedInterventionCandidateRecordCount"]
        : isSourceReviewPacks && typeof summary["selectedMtaWikiCandidateRecordCount"] === "number"
          ? summary["selectedMtaWikiCandidateRecordCount"]
          : input.layer === "candidate_bundle"
            ? sourceCandidates.length + interventionSeeds.length
            : candidates.length || null;

  return {
    sourceCount:
      isMaterializedResearchViews && typeof summary["sourceCoverageRowCount"] === "number"
        ? summary["sourceCoverageRowCount"]
        : isSourceReviewPacks && typeof summary["selectedSourceCount"] === "number"
          ? summary["selectedSourceCount"]
          : isSourceDispositionQueue && typeof summary["sourceCount"] === "number"
            ? summary["sourceCount"]
            : isSourceDispositionReceipts && typeof summary["receiptCount"] === "number"
              ? summary["receiptCount"]
              : isSourceReceiptClosureAudit && typeof summary["queueSourceCount"] === "number"
                ? summary["queueSourceCount"]
                : isMtaWikiSourceAlignment && typeof summary["queueSourceCount"] === "number"
                  ? summary["queueSourceCount"]
                  : input.layer === "mta_wiki_canonical_bridge" &&
                      typeof summary["sourceCount"] === "number"
                    ? summary["sourceCount"]
                    : uniqueStringCount([
                        ...reviewedRecords.map((row) => field(asRecord(row), "sourceId")),
                        ...publishable.map((row) => field(asRecord(row), "sourceId")),
                        ...events.map((row) => field(asRecord(row), "sourceId")),
                        ...sourceCandidates.map((row) => field(asRecord(row), "sourceId")),
                        ...candidates.map((row) => field(asRecord(row), "sourceId")),
                        ...reviewGroups.map((row) => field(asRecord(row), "sourceId")),
                      ]) || null,
    routeCount:
      isMaterializedResearchViews && typeof summary["routeEvidenceBundleCount"] === "number"
        ? summary["routeEvidenceBundleCount"]
        : isSourceReviewPacks
          ? uniqueStringCount([
              ...sourceReviewPacks.flatMap((row) =>
                asArray(field(asRecord(field(asRecord(row), "sourceSummary")), "routeIds")),
              ),
              ...sourceReviewPacks.flatMap((row) =>
                asArray(field(asRecord(row), "routeContexts")).flatMap((context) => {
                  const contextRecord = asRecord(context);
                  return [
                    field(contextRecord, "routeId"),
                    ...asArray(field(contextRecord, "routeIds")),
                  ];
                }),
              ),
            ]) || null
          : isSourceDispositionQueue && typeof summary["uniqueRouteCount"] === "number"
            ? summary["uniqueRouteCount"]
            : input.layer === "mta_wiki_canonical_bridge" &&
                typeof summary["routeCount"] === "number"
              ? summary["routeCount"]
              : isMtaWikiSourceAlignment
                ? uniqueStringCount([
                    ...alignedSources.flatMap((row) =>
                      asArray(field(asRecord(row), "queueRouteIds")),
                    ),
                    ...alignedSources.flatMap((row) =>
                      asArray(field(asRecord(row), "mtaWikiRouteIds")),
                    ),
                  ]) || null
                : uniqueStringCount([
                    ...flattenRouteValues(reviewedRecords),
                    ...flattenRouteValues(publishable),
                    ...flattenRouteValues(events),
                    ...flattenRouteValues(candidates),
                    ...projectedRouteKeys,
                    ...flattenRouteValues(projectedRouteEntries),
                    ...reviewGroups.flatMap((row) => asArray(field(asRecord(row), "routeIds"))),
                  ]) || null,
    recordCount:
      isMaterializedResearchViews && typeof summary["detectorFeatureRowCount"] === "number"
        ? summary["detectorFeatureRowCount"]
        : isSourceReviewPacks && typeof summary["selectedSourceCount"] === "number"
          ? summary["selectedSourceCount"]
          : isSourceDispositionQueue && typeof summary["reviewQueueItemCount"] === "number"
            ? summary["reviewQueueItemCount"]
            : isSourceDispositionReceipts && typeof summary["receiptCount"] === "number"
              ? summary["receiptCount"]
              : isSourceReceiptClosureAudit && typeof summary["queueSourceCount"] === "number"
                ? summary["queueSourceCount"]
                : input.layer === "mta_wiki_canonical_bridge" &&
                    typeof summary["interventionCandidateRecordCount"] === "number"
                  ? summary["interventionCandidateRecordCount"]
                  : isMtaWikiSourceAlignment
                    ? alignedSources.length || null
                    : reviewedRecords.length ||
                      toolCallRecords.length ||
                      sourceReviewPacks.length ||
                      sourceDispositionItems.length ||
                      sourceDispositionReceipts.length ||
                      sourceClosureRows.length ||
                      null,
    candidateCount,
    eventCount:
      input.layer === "mta_wiki_canonical_bridge" && typeof summary["eventCount"] === "number"
        ? summary["eventCount"]
        : events.length || null,
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
  if (classification.layer === "mta_wiki_canonical_bridge") {
    warnings.push(
      "mta-wiki bridge is an external review queue and must not be treated as reviewed or publishable intervention facts",
    );
  }
  if (classification.layer === "mta_wiki_source_alignment") {
    warnings.push(
      "mta-wiki source alignment is authoring context and must not be treated as reviewed or publishable intervention facts",
    );
  }
  if (classification.layer === "materialized_research_views") {
    warnings.push(
      "materialized research views are machine-built review substrate and must not be treated as reviewed or publishable intervention facts",
    );
  }
  if (classification.layer === "source_review_packs") {
    warnings.push(
      "source review packs are authoring handoffs and must not be treated as reviewed or publishable intervention facts",
    );
  }
  if (classification.layer === "source_disposition_queue") {
    warnings.push(
      "source disposition queue is review scaffolding and must not be treated as reviewed or publishable intervention facts",
    );
  }
  if (classification.layer === "source_disposition_receipts") {
    warnings.push(
      "source disposition receipts close source accounting only and must not be treated as reviewed or publishable intervention facts",
    );
  }
  if (classification.layer === "source_receipt_closure_audit") {
    warnings.push(
      "source receipt closure audit is a promotion gate and must not be treated as reviewed or publishable intervention facts",
    );
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
  const fullCorpusMaterializedViews = inventory.artifacts.find(
    (artifact) =>
      artifact.layer === "materialized_research_views" &&
      artifact.relativePath.includes("full-authority-qv1-qv10"),
  );
  if (fullCorpusMaterializedViews !== undefined && fullCorpusReviewed === undefined) {
    actions.push(
      "Use the full-corpus qv1-qv10 materialized research views to drive source dispositions and reviewed-record generation; do not promote them directly.",
    );
  }
  const sourceReceiptClosureAudit = inventory.artifacts.find(
    (artifact) =>
      artifact.layer === "source_receipt_closure_audit" &&
      artifact.relativePath.includes("source-receipt-closure-full-authority-qv1-qv10"),
  );
  if (
    sourceReceiptClosureAudit !== undefined &&
    sourceReceiptClosureAudit.summary?.["sourceReceiptClosureStatus"] !== "complete"
  ) {
    const openSourceCount = sourceReceiptClosureAudit.summary?.["openSourceCount"];
    actions.push(
      typeof openSourceCount === "number"
        ? `Close the full-corpus source receipt audit; ${openSourceCount} source(s) still need valid reviewed records or source disposition receipts.`
        : "Close the full-corpus source receipt audit before promoting Tier 2 intervention records.",
    );
  }
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
      materializedResearchViewArtifactCount: artifacts.filter(
        (artifact) => artifact.layer === "materialized_research_views",
      ).length,
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
    `- materialized research view artifacts: ${inventory.summary.materializedResearchViewArtifactCount}`,
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
