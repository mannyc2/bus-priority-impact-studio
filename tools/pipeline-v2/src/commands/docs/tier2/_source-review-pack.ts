import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import type {
  Tier2SourceDispositionQueueArtifact,
  Tier2SourceDispositionQueueItem,
} from "./_source-disposition-queue.ts";
import type { Tier2VocabMaterializedViewsArtifact } from "./_vocab-materialized-views.ts";

const ARTIFACT_KIND = "bp.tier2_source_review_pack_batch.v1";
const SUMMARY_KIND = "bp.tier2_source_review_pack_batch_summary.v1";

type MaterializedFeatureRow = Tier2VocabMaterializedViewsArtifact["detectorFeatureRows"][number];
type MaterializedRouteBundle = Tier2VocabMaterializedViewsArtifact["routeEvidenceBundles"][number];
type MaterializedUnresolvedItem =
  Tier2VocabMaterializedViewsArtifact["unresolvedReviewQueue"][number];

type MtaWikiSourceAlignmentRow = {
  queueRef: string;
  queueSourceId: string;
  mtaWikiGroupId: string;
  mtaWikiSourceId: string;
  mtaWikiSourceLabel: string;
  alignmentKind: "exact_normalized_source_key";
  alignmentKeys: string[];
  mtaWikiRouteIds: string[];
  projectIds: string[];
  eventIds: string[];
  treatmentComponentIds: string[];
  relationIds: string[];
  candidateRecordCount: number;
  evidenceRefCount: number;
  promotionReadiness: {
    status: "needs_manual_review";
    reasons: string[];
  };
};

type MtaWikiSourceAlignmentArtifact = {
  artifactKind: "bp.tier2_mta_wiki_source_alignment.v1";
  generatedAt: string;
  alignedSources: MtaWikiSourceAlignmentRow[];
};

type SourceReviewPackFeatureRow = Pick<
  MaterializedFeatureRow,
  | "featureId"
  | "featureUse"
  | "routeScope"
  | "routeIds"
  | "surfaceId"
  | "pageNumbers"
  | "surfaceKind"
  | "displayLabel"
  | "artifactPath"
  | "keyId"
  | "rawValue"
  | "canonicalLeafId"
  | "canonicalLeafLabel"
  | "coarseFamily"
  | "supportIds"
  | "evidencePointerIds"
>;

type SourceReviewPackRouteContext = {
  routeId: string;
  surfaceCount: number;
  timelineCandidateSurfaceCount: number;
  treatmentSurfaceCount: number;
  metricObservationSurfaceCount: number;
  claimSurfaceCount: number;
  evidencePointerCount: number;
  sourcePageNumbers: number[];
};

type SourceReviewPackUnresolvedItem = Pick<
  MaterializedUnresolvedItem,
  | "reviewItemId"
  | "keyId"
  | "decision"
  | "rawValue"
  | "reason"
  | "coarseFamily"
  | "rowCount"
  | "surfaceCount"
  | "routeIds"
  | "sourceIds"
  | "surfaceKindCounts"
  | "supportIds"
  | "evidencePointerIds"
  | "sampleSurfaces"
>;

type SourceReviewPackMtaWikiContext = {
  mtaWikiGroupId: string;
  mtaWikiSourceId: string;
  mtaWikiSourceLabel: string;
  alignmentKind: "exact_normalized_source_key";
  alignmentKeys: string[];
  routeIds: string[];
  projectIds: string[];
  eventIds: string[];
  treatmentComponentIds: string[];
  relationIds: string[];
  candidateRecordCount: number;
  evidenceRefCount: number;
  promotionReadiness: MtaWikiSourceAlignmentRow["promotionReadiness"];
};

export type Tier2SourceReviewPack = {
  queueRef: string;
  sourceId: string;
  sourceTitle: string | null;
  sourceGroup: string | null;
  reviewLane: Tier2SourceDispositionQueueItem["reviewLane"];
  priority: Tier2SourceDispositionQueueItem["priority"];
  publicPromotionStatus: "not_ready";
  reviewReceiptStatus: "needs_review_receipt";
  reviewObjective: string;
  requiredOutputs: string[];
  sourceSummary: {
    surfaceCount: number;
    mappedFieldCount: number;
    unresolvedFieldCount: number;
    routeCount: number;
    routeIds: string[];
    evidencePointerCount: number;
    mtaWikiContextCount: number;
    mtaWikiCandidateRecordCount: number;
    candidateSignals: Tier2SourceDispositionQueueItem["candidateSignals"];
    reviewFlags: string[];
  };
  routeContexts: SourceReviewPackRouteContext[];
  featureRows: SourceReviewPackFeatureRow[];
  unresolvedItems: SourceReviewPackUnresolvedItem[];
  mtaWikiContext: SourceReviewPackMtaWikiContext[];
  sampleSurfaces: Tier2SourceDispositionQueueItem["sampleSurfaces"];
  receiptTemplate: {
    sourceId: string;
    queueRef: string;
    disposition:
      | "reviewed_records_authored"
      | "supporting_context_only"
      | "no_actionable_bus_priority_intervention"
      | "needs_more_source_review"
      | null;
    reviewedRecordIds: string[];
    rationale: string | null;
    reviewerId: string | null;
    reviewedAt: string | null;
    evidenceRefs: string[];
  };
  reviewInstructions: string[];
};

export type Tier2SourceReviewPackBatchArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceQueuePath: string;
  sourceQueueGeneratedAt: string;
  sourceMaterializedViewsPath: string;
  sourceMaterializedViewsGeneratedAt: string;
  mtaWikiAlignmentPath: string | null;
  mtaWikiAlignmentGeneratedAt: string | null;
  summary: {
    selectedSourceCount: number;
    queueSourceCount: number;
    recordCandidateReviewCount: number;
    sourceDispositionReviewCount: number;
    highPrioritySourceCount: number;
    publicPromotionStatus: "not_ready";
    reviewReceiptMissingCount: number;
    selectedMtaWikiAlignedSourceCount: number;
    selectedMtaWikiCandidateRecordCount: number;
    selectedSourceIds: string[];
    promotionBlockers: string[];
  };
  policy: {
    useCase: string;
    outputContract: string;
    publicPromotionRule: string;
  };
  packs: Tier2SourceReviewPack[];
};

export type BuildTier2SourceReviewPackBatchArgs = {
  queuePath: string;
  materializedViewsPath?: string;
  mtaWikiAlignmentPath?: string;
  outputPath?: string;
  markdownPath?: string;
  summaryPath?: string;
  generatedAt?: string;
  sourceIds?: string[];
  top?: number;
  reviewLane?: Tier2SourceDispositionQueueItem["reviewLane"];
  priority?: Tier2SourceDispositionQueueItem["priority"];
  maxFeatureRows?: number;
  maxUnresolvedItems?: number;
  maxRouteContexts?: number;
  maxMtaWikiContexts?: number;
};

type CliArgs = Partial<BuildTier2SourceReviewPackBatchArgs> & {
  sourceIdsText?: string;
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function featureRowRank(row: MaterializedFeatureRow): number {
  if (row.featureUse === "event_or_treatment_feature") return 0;
  if (row.featureUse === "metric_feature") return 1;
  if (row.featureUse === "claim_feature") return 2;
  if (row.featureUse === "document_context_feature") return 3;
  if (row.featureUse === "entity_feature") return 4;
  return 5;
}

function routeContextForSource(input: {
  bundle: MaterializedRouteBundle;
  sourceId: string;
}): SourceReviewPackRouteContext | null {
  const ref = input.bundle.sourcePageRefs.find(
    (sourceRef) => sourceRef.sourceId === input.sourceId,
  );
  if (ref === undefined) return null;
  return {
    routeId: input.bundle.routeId,
    surfaceCount: input.bundle.surfaceCount,
    timelineCandidateSurfaceCount: input.bundle.timelineCandidateSurfaceCount,
    treatmentSurfaceCount: input.bundle.treatmentSurfaceCount,
    metricObservationSurfaceCount: input.bundle.metricObservationSurfaceCount,
    claimSurfaceCount: input.bundle.claimSurfaceCount,
    evidencePointerCount: input.bundle.evidencePointerCount,
    sourcePageNumbers: ref.pageNumbers,
  };
}

function reviewObjectiveFor(item: Tier2SourceDispositionQueueItem): string {
  if (item.reviewLane === "record_candidate_review") {
    return "Author reviewed bp.document_intervention_record.v1 records for source-supported bus-priority interventions, or write an explicit source disposition if no actionable intervention survives review.";
  }
  return "Write an explicit source disposition receipt explaining why this source is supporting context only or has no actionable bus-priority intervention record.";
}

function requiredOutputsFor(item: Tier2SourceDispositionQueueItem): string[] {
  if (item.reviewLane === "record_candidate_review") {
    return [
      "one or more reviewed bp.document_intervention_record.v1 records, when source evidence supports them",
      "a sourceDisposition receipt for every source that produces no reviewed records",
      "manual publishability dispositions before any serving projection is generated",
    ];
  }
  return [
    "one sourceDisposition receipt with rationale",
    "review notes for any source-gap or supporting-context evidence worth preserving",
  ];
}

function reviewInstructionsFor(item: Tier2SourceDispositionQueueItem): string[] {
  const instructions = [
    "Use source page and artifact refs as pointers back to evidence; do not treat this pack as the evidence itself.",
    "Preserve route fanout caveats when a source mentions many routes or corridor-wide planning material.",
    "Do not promote source-stated metrics or intervention claims without a reviewed record and manual disposition.",
  ];
  if (item.reviewFlags.includes("wide_route_fanout")) {
    instructions.push(
      "Wide route fanout is present; split corridor/program context from route-specific operational records.",
    );
  }
  if (item.reviewFlags.includes("unresolved_fields_present")) {
    instructions.push(
      "Unresolved vocab fields remain; keep raw source wording when canonical mapping is uncertain.",
    );
  }
  if (item.reviewLane === "source_disposition_review") {
    instructions.push(
      "Prefer a disposition receipt over inventing an intervention record when the source is process/context heavy.",
    );
  }
  return instructions;
}

function mtaWikiContextForRow(row: MtaWikiSourceAlignmentRow): SourceReviewPackMtaWikiContext {
  return {
    mtaWikiGroupId: row.mtaWikiGroupId,
    mtaWikiSourceId: row.mtaWikiSourceId,
    mtaWikiSourceLabel: row.mtaWikiSourceLabel,
    alignmentKind: row.alignmentKind,
    alignmentKeys: row.alignmentKeys,
    routeIds: row.mtaWikiRouteIds,
    projectIds: row.projectIds,
    eventIds: row.eventIds,
    treatmentComponentIds: row.treatmentComponentIds,
    relationIds: row.relationIds,
    candidateRecordCount: row.candidateRecordCount,
    evidenceRefCount: row.evidenceRefCount,
    promotionReadiness: row.promotionReadiness,
  };
}

function indexMtaWikiAlignments(
  alignment: MtaWikiSourceAlignmentArtifact | null,
): Map<string, MtaWikiSourceAlignmentRow[]> {
  const bySource = new Map<string, MtaWikiSourceAlignmentRow[]>();
  if (alignment === null) return bySource;
  for (const row of alignment.alignedSources) {
    const existing = bySource.get(row.queueSourceId);
    if (existing === undefined) bySource.set(row.queueSourceId, [row]);
    else existing.push(row);
  }
  for (const rows of bySource.values()) {
    rows.sort(
      (left, right) =>
        right.candidateRecordCount - left.candidateRecordCount ||
        right.evidenceRefCount - left.evidenceRefCount ||
        left.mtaWikiGroupId.localeCompare(right.mtaWikiGroupId),
    );
  }
  return bySource;
}

function buildPack(input: {
  item: Tier2SourceDispositionQueueItem;
  materializedViews: Tier2VocabMaterializedViewsArtifact;
  mtaWikiAlignmentsBySource: Map<string, MtaWikiSourceAlignmentRow[]>;
  maxFeatureRows: number;
  maxUnresolvedItems: number;
  maxRouteContexts: number;
  maxMtaWikiContexts: number;
}): Tier2SourceReviewPack {
  const featureRows = input.materializedViews.detectorFeatureRows
    .filter((row) => row.sourceId === input.item.sourceId)
    .sort(
      (left, right) =>
        featureRowRank(left) - featureRowRank(right) ||
        right.evidencePointerIds.length - left.evidencePointerIds.length ||
        left.surfaceId.localeCompare(right.surfaceId) ||
        left.keyId.localeCompare(right.keyId) ||
        left.featureId.localeCompare(right.featureId),
    )
    .slice(0, input.maxFeatureRows)
    .map(
      (row): SourceReviewPackFeatureRow => ({
        featureId: row.featureId,
        featureUse: row.featureUse,
        routeScope: row.routeScope,
        routeIds: row.routeIds,
        surfaceId: row.surfaceId,
        pageNumbers: row.pageNumbers,
        surfaceKind: row.surfaceKind,
        displayLabel: row.displayLabel,
        artifactPath: row.artifactPath,
        keyId: row.keyId,
        rawValue: row.rawValue,
        canonicalLeafId: row.canonicalLeafId,
        canonicalLeafLabel: row.canonicalLeafLabel,
        coarseFamily: row.coarseFamily,
        supportIds: row.supportIds,
        evidencePointerIds: row.evidencePointerIds,
      }),
    );
  const unresolvedItems = input.materializedViews.unresolvedReviewQueue
    .filter((item) => item.sourceIds.includes(input.item.sourceId))
    .sort(
      (left, right) =>
        right.rowCount - left.rowCount ||
        right.surfaceCount - left.surfaceCount ||
        left.keyId.localeCompare(right.keyId) ||
        left.rawValue.localeCompare(right.rawValue),
    )
    .slice(0, input.maxUnresolvedItems)
    .map(
      (item): SourceReviewPackUnresolvedItem => ({
        reviewItemId: item.reviewItemId,
        keyId: item.keyId,
        decision: item.decision,
        rawValue: item.rawValue,
        reason: item.reason,
        coarseFamily: item.coarseFamily,
        rowCount: item.rowCount,
        surfaceCount: item.surfaceCount,
        routeIds: item.routeIds,
        sourceIds: item.sourceIds,
        surfaceKindCounts: item.surfaceKindCounts,
        supportIds: item.supportIds,
        evidencePointerIds: item.evidencePointerIds,
        sampleSurfaces: item.sampleSurfaces,
      }),
    );
  const routeContexts = input.materializedViews.routeEvidenceBundles
    .flatMap((bundle) => routeContextForSource({ bundle, sourceId: input.item.sourceId }) ?? [])
    .sort(
      (left, right) =>
        right.timelineCandidateSurfaceCount - left.timelineCandidateSurfaceCount ||
        right.treatmentSurfaceCount - left.treatmentSurfaceCount ||
        right.surfaceCount - left.surfaceCount ||
        left.routeId.localeCompare(right.routeId),
    )
    .slice(0, input.maxRouteContexts);
  const mtaWikiContext = (input.mtaWikiAlignmentsBySource.get(input.item.sourceId) ?? [])
    .slice(0, input.maxMtaWikiContexts)
    .map(mtaWikiContextForRow);
  const reviewInstructions = reviewInstructionsFor(input.item);
  if (mtaWikiContext.length > 0) {
    reviewInstructions.push(
      "Use mta-wiki aligned rows as supplementary authoring context only; verify every promoted fact against Bus Studio source evidence before writing records.",
    );
  }

  return {
    queueRef: input.item.queueRef,
    sourceId: input.item.sourceId,
    sourceTitle: input.item.sourceTitle,
    sourceGroup: input.item.sourceGroup,
    reviewLane: input.item.reviewLane,
    priority: input.item.priority,
    publicPromotionStatus: "not_ready",
    reviewReceiptStatus: "needs_review_receipt",
    reviewObjective: reviewObjectiveFor(input.item),
    requiredOutputs: requiredOutputsFor(input.item),
    sourceSummary: {
      surfaceCount: input.item.surfaceCount,
      mappedFieldCount: input.item.mappedFieldCount,
      unresolvedFieldCount: input.item.unresolvedFieldCount,
      routeCount: input.item.routeCount,
      routeIds: input.item.routeIds,
      evidencePointerCount: input.item.evidencePointerCount,
      mtaWikiContextCount: mtaWikiContext.length,
      mtaWikiCandidateRecordCount: mtaWikiContext.reduce(
        (sum, row) => sum + row.candidateRecordCount,
        0,
      ),
      candidateSignals: input.item.candidateSignals,
      reviewFlags: input.item.reviewFlags,
    },
    routeContexts,
    featureRows,
    unresolvedItems,
    mtaWikiContext,
    sampleSurfaces: input.item.sampleSurfaces,
    receiptTemplate: {
      sourceId: input.item.sourceId,
      queueRef: input.item.queueRef,
      disposition: null,
      reviewedRecordIds: [],
      rationale: null,
      reviewerId: null,
      reviewedAt: null,
      evidenceRefs: [],
    },
    reviewInstructions,
  };
}

function selectQueueItems(input: {
  queue: Tier2SourceDispositionQueueArtifact;
  sourceIds: string[];
  top: number | null;
  reviewLane: Tier2SourceDispositionQueueItem["reviewLane"] | null;
  priority: Tier2SourceDispositionQueueItem["priority"] | null;
}): Tier2SourceDispositionQueueItem[] {
  const sourceIdSet = new Set(input.sourceIds);
  const selected = input.queue.items.filter((item) => {
    if (sourceIdSet.size > 0 && !sourceIdSet.has(item.sourceId)) return false;
    if (input.reviewLane !== null && item.reviewLane !== input.reviewLane) return false;
    if (input.priority !== null && item.priority !== input.priority) return false;
    return true;
  });
  return input.top === null ? selected : selected.slice(0, input.top);
}

function buildBatch(input: {
  queue: Tier2SourceDispositionQueueArtifact;
  queuePath: string;
  materializedViews: Tier2VocabMaterializedViewsArtifact;
  materializedViewsPath: string;
  mtaWikiAlignment: MtaWikiSourceAlignmentArtifact | null;
  mtaWikiAlignmentPath: string | null;
  generatedAt: string;
  sourceIds: string[];
  top: number | null;
  reviewLane: Tier2SourceDispositionQueueItem["reviewLane"] | null;
  priority: Tier2SourceDispositionQueueItem["priority"] | null;
  maxFeatureRows: number;
  maxUnresolvedItems: number;
  maxRouteContexts: number;
  maxMtaWikiContexts: number;
}): Tier2SourceReviewPackBatchArtifact {
  const selectedItems = selectQueueItems(input);
  const mtaWikiAlignmentsBySource = indexMtaWikiAlignments(input.mtaWikiAlignment);
  const packs = selectedItems.map((item) =>
    buildPack({
      item,
      materializedViews: input.materializedViews,
      mtaWikiAlignmentsBySource,
      maxFeatureRows: input.maxFeatureRows,
      maxUnresolvedItems: input.maxUnresolvedItems,
      maxRouteContexts: input.maxRouteContexts,
      maxMtaWikiContexts: input.maxMtaWikiContexts,
    }),
  );
  const selectedMtaWikiCandidateRecordCount = packs.reduce(
    (sum, pack) => sum + pack.sourceSummary.mtaWikiCandidateRecordCount,
    0,
  );

  return {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    sourceQueuePath: input.queuePath,
    sourceQueueGeneratedAt: input.queue.generatedAt,
    sourceMaterializedViewsPath: input.materializedViewsPath,
    sourceMaterializedViewsGeneratedAt: input.materializedViews.generatedAt,
    mtaWikiAlignmentPath: input.mtaWikiAlignmentPath,
    mtaWikiAlignmentGeneratedAt: input.mtaWikiAlignment?.generatedAt ?? null,
    summary: {
      selectedSourceCount: packs.length,
      queueSourceCount: input.queue.summary.sourceCount,
      recordCandidateReviewCount: packs.filter(
        (pack) => pack.reviewLane === "record_candidate_review",
      ).length,
      sourceDispositionReviewCount: packs.filter(
        (pack) => pack.reviewLane === "source_disposition_review",
      ).length,
      highPrioritySourceCount: packs.filter((pack) => pack.priority === "high").length,
      publicPromotionStatus: "not_ready",
      reviewReceiptMissingCount: packs.length,
      selectedMtaWikiAlignedSourceCount: packs.filter((pack) => pack.mtaWikiContext.length > 0)
        .length,
      selectedMtaWikiCandidateRecordCount,
      selectedSourceIds: packs.map((pack) => pack.sourceId),
      promotionBlockers: [
        "source review packs are authoring handoffs, not reviewed intervention records",
        "review receipt templates are blank until a reviewer or agent writes a disposition",
        "mta-wiki aligned rows are supplementary review context and do not close source receipts",
        "publishable intervention projections must be generated from reviewed records plus manual dispositions",
      ],
    },
    policy: {
      useCase:
        "Batch of source-scoped review packs for converting Tier 2 source queue items into reviewed intervention records or source disposition receipts.",
      outputContract:
        "Each selected source must produce either reviewed bp.document_intervention_record.v1 records or a completed sourceDisposition receipt before it is closed.",
      publicPromotionRule:
        "Do not publish facts from this pack. It only collects evidence pointers and review instructions for authoring.",
    },
    packs,
  };
}

function markdownEscape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderMarkdown(artifact: Tier2SourceReviewPackBatchArtifact): string {
  const lines: string[] = [];
  lines.push("# Tier 2 Source Review Pack Batch");
  lines.push("");
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Selected sources: ${artifact.summary.selectedSourceCount}`);
  lines.push(`- Record-candidate review packs: ${artifact.summary.recordCandidateReviewCount}`);
  lines.push(`- Source-disposition review packs: ${artifact.summary.sourceDispositionReviewCount}`);
  lines.push(`- High priority packs: ${artifact.summary.highPrioritySourceCount}`);
  lines.push(`- Review receipts missing: ${artifact.summary.reviewReceiptMissingCount}`);
  lines.push(
    `- Packs with mta-wiki context: ${artifact.summary.selectedMtaWikiAlignedSourceCount}`,
  );
  lines.push(
    `- mta-wiki candidate records in selected packs: ${artifact.summary.selectedMtaWikiCandidateRecordCount}`,
  );
  lines.push(`- Public promotion status: ${artifact.summary.publicPromotionStatus}`);
  lines.push("");
  lines.push("## Source Packs");
  lines.push("");
  lines.push(
    "| Ref | Priority | Lane | Source | Routes | Features | Unresolved | mta-wiki candidates | Flags |",
  );
  lines.push("|---|---|---|---|---:|---:|---:|---:|---|");
  for (const pack of artifact.packs) {
    const title =
      pack.sourceTitle === null ? pack.sourceId : `${pack.sourceId}: ${pack.sourceTitle}`;
    lines.push(
      `| ${pack.queueRef} | ${pack.priority} | ${pack.reviewLane} | ${markdownEscape(title)} | ${pack.sourceSummary.routeCount} | ${pack.featureRows.length} | ${pack.unresolvedItems.length} | ${pack.sourceSummary.mtaWikiCandidateRecordCount} | ${pack.sourceSummary.reviewFlags.join(", ")} |`,
    );
  }
  lines.push("");
  lines.push("## Required Output Contract");
  lines.push("");
  lines.push(`- ${artifact.policy.outputContract}`);
  lines.push(`- ${artifact.policy.publicPromotionRule}`);
  lines.push("");
  lines.push("## Promotion Blockers");
  lines.push("");
  for (const blocker of artifact.summary.promotionBlockers) lines.push(`- ${blocker}`);
  return `${lines.join("\n")}\n`;
}

export async function buildTier2SourceReviewPackBatch(
  args: BuildTier2SourceReviewPackBatchArgs,
): Promise<Tier2SourceReviewPackBatchArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const queuePath = fromCliPath(args.queuePath);
  const queue = (await Bun.file(queuePath).json()) as Tier2SourceDispositionQueueArtifact;
  if (queue.artifactKind !== "bp.tier2_source_disposition_queue.v1") {
    throw new Error(`Expected bp.tier2_source_disposition_queue.v1 artifact: ${queuePath}`);
  }
  const materializedViewsPath = fromCliPath(
    args.materializedViewsPath ?? queue.sourceMaterializedViewsPath,
  );
  const materializedViews = (await Bun.file(
    materializedViewsPath,
  ).json()) as Tier2VocabMaterializedViewsArtifact;
  if (materializedViews.artifactKind !== "bp.tier2_vocab_materialized_views.v1") {
    throw new Error(
      `Expected bp.tier2_vocab_materialized_views.v1 artifact: ${materializedViewsPath}`,
    );
  }
  if (!Array.isArray(queue.items)) throw new Error(`Queue has no items array: ${queuePath}`);
  if (!Array.isArray(materializedViews.detectorFeatureRows)) {
    throw new Error(
      `Materialized views has no detectorFeatureRows array: ${materializedViewsPath}`,
    );
  }
  const mtaWikiAlignmentPath =
    args.mtaWikiAlignmentPath === undefined ? null : fromCliPath(args.mtaWikiAlignmentPath);
  const mtaWikiAlignment =
    mtaWikiAlignmentPath === null
      ? null
      : ((await Bun.file(mtaWikiAlignmentPath).json()) as MtaWikiSourceAlignmentArtifact);
  if (
    mtaWikiAlignment !== null &&
    mtaWikiAlignment.artifactKind !== "bp.tier2_mta_wiki_source_alignment.v1"
  ) {
    throw new Error(
      `Expected bp.tier2_mta_wiki_source_alignment.v1 artifact: ${mtaWikiAlignmentPath}`,
    );
  }
  if (mtaWikiAlignment !== null && !Array.isArray(mtaWikiAlignment.alignedSources)) {
    throw new Error(
      `mta-wiki source alignment has no alignedSources array: ${mtaWikiAlignmentPath}`,
    );
  }
  return buildBatch({
    queue,
    queuePath,
    materializedViews,
    materializedViewsPath,
    mtaWikiAlignment,
    mtaWikiAlignmentPath,
    generatedAt,
    sourceIds: args.sourceIds ?? [],
    top: args.top ?? 20,
    reviewLane: args.reviewLane ?? null,
    priority: args.priority ?? null,
    maxFeatureRows: args.maxFeatureRows ?? 80,
    maxUnresolvedItems: args.maxUnresolvedItems ?? 25,
    maxRouteContexts: args.maxRouteContexts ?? 30,
    maxMtaWikiContexts: args.maxMtaWikiContexts ?? 5,
  });
}

export async function runTier2SourceReviewPackBatch(
  args: BuildTier2SourceReviewPackBatchArgs,
): Promise<{
  artifact: Tier2SourceReviewPackBatchArtifact;
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
}> {
  const artifact = await buildTier2SourceReviewPackBatch(args);
  const outputPath = fromCliPath(
    args.outputPath ??
      join(
        defaultArtifactRootPath(),
        "docs",
        "tier2-source-review-packs",
        "source-review-pack-batch.json",
      ),
  );
  const markdownPath =
    args.markdownPath === undefined
      ? outputPath.replace(/\.json$/, ".md")
      : fromCliPath(args.markdownPath);
  const summaryPath =
    args.summaryPath === undefined
      ? outputPath.replace(/\.json$/, "-summary.json")
      : fromCliPath(args.summaryPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  await Bun.write(markdownPath, renderMarkdown(artifact));
  await writeJson(summaryPath, {
    artifactKind: SUMMARY_KIND,
    schemaVersion: 1,
    generatedAt: artifact.generatedAt,
    sourceArtifactPath: outputPath,
    summary: artifact.summary,
  });
  return { artifact, outputPath, markdownPath, summaryPath };
}

function parseNonNegativeInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} requires a non-negative integer.`);
  }
  return parsed;
}

function parseSourceIds(value: string | undefined): string[] {
  if (value === undefined || value.length === 0) return [];
  return uniqueSorted(
    value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );
}

function parseReviewLane(value: string): Tier2SourceDispositionQueueItem["reviewLane"] {
  if (value === "record_candidate_review" || value === "source_disposition_review") return value;
  throw new Error(`--review-lane must be record_candidate_review or source_disposition_review.`);
}

function parsePriority(value: string): Tier2SourceDispositionQueueItem["priority"] {
  if (value === "high" || value === "medium" || value === "low") return value;
  throw new Error(`--priority must be high, medium, or low.`);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--queue") {
      if (value === undefined) throw new Error("--queue requires a value.");
      args.queuePath = value;
      index += 1;
    } else if (arg === "--materialized-views") {
      if (value === undefined) throw new Error("--materialized-views requires a value.");
      args.materializedViewsPath = value;
      index += 1;
    } else if (arg === "--mta-wiki-alignment") {
      if (value === undefined) throw new Error("--mta-wiki-alignment requires a value.");
      args.mtaWikiAlignmentPath = value;
      index += 1;
    } else if (arg === "--output") {
      if (value === undefined) throw new Error("--output requires a value.");
      args.outputPath = value;
      index += 1;
    } else if (arg === "--markdown") {
      if (value === undefined) throw new Error("--markdown requires a value.");
      args.markdownPath = value;
      index += 1;
    } else if (arg === "--summary") {
      if (value === undefined) throw new Error("--summary requires a value.");
      args.summaryPath = value;
      index += 1;
    } else if (arg === "--generated-at") {
      if (value === undefined) throw new Error("--generated-at requires a value.");
      args.generatedAt = value;
      index += 1;
    } else if (arg === "--source-ids") {
      if (value === undefined) throw new Error("--source-ids requires a value.");
      args.sourceIdsText = value;
      index += 1;
    } else if (arg === "--top") {
      if (value === undefined) throw new Error("--top requires a value.");
      args.top = parseNonNegativeInteger(value, "--top");
      index += 1;
    } else if (arg === "--review-lane") {
      if (value === undefined) throw new Error("--review-lane requires a value.");
      args.reviewLane = parseReviewLane(value);
      index += 1;
    } else if (arg === "--priority") {
      if (value === undefined) throw new Error("--priority requires a value.");
      args.priority = parsePriority(value);
      index += 1;
    } else if (arg === "--max-feature-rows") {
      if (value === undefined) throw new Error("--max-feature-rows requires a value.");
      args.maxFeatureRows = parseNonNegativeInteger(value, "--max-feature-rows");
      index += 1;
    } else if (arg === "--max-unresolved-items") {
      if (value === undefined) throw new Error("--max-unresolved-items requires a value.");
      args.maxUnresolvedItems = parseNonNegativeInteger(value, "--max-unresolved-items");
      index += 1;
    } else if (arg === "--max-route-contexts") {
      if (value === undefined) throw new Error("--max-route-contexts requires a value.");
      args.maxRouteContexts = parseNonNegativeInteger(value, "--max-route-contexts");
      index += 1;
    } else if (arg === "--max-mta-wiki-contexts") {
      if (value === undefined) throw new Error("--max-mta-wiki-contexts requires a value.");
      args.maxMtaWikiContexts = parseNonNegativeInteger(value, "--max-mta-wiki-contexts");
      index += 1;
    } else {
      throw new Error(`Unknown docs tier2 source-review-pack option: ${arg}`);
    }
  }
  args.sourceIds = parseSourceIds(args.sourceIdsText);
  return args;
}

export async function runTier2SourceReviewPackBatchFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.queuePath === undefined) throw new Error("Provide --queue.");
  const result = await runTier2SourceReviewPackBatch({
    queuePath: args.queuePath,
    ...(args.materializedViewsPath === undefined
      ? {}
      : { materializedViewsPath: args.materializedViewsPath }),
    ...(args.mtaWikiAlignmentPath === undefined
      ? {}
      : { mtaWikiAlignmentPath: args.mtaWikiAlignmentPath }),
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
    ...(args.sourceIds === undefined ? {} : { sourceIds: args.sourceIds }),
    ...(args.top === undefined ? {} : { top: args.top }),
    ...(args.reviewLane === undefined ? {} : { reviewLane: args.reviewLane }),
    ...(args.priority === undefined ? {} : { priority: args.priority }),
    ...(args.maxFeatureRows === undefined ? {} : { maxFeatureRows: args.maxFeatureRows }),
    ...(args.maxUnresolvedItems === undefined
      ? {}
      : { maxUnresolvedItems: args.maxUnresolvedItems }),
    ...(args.maxRouteContexts === undefined ? {} : { maxRouteContexts: args.maxRouteContexts }),
    ...(args.maxMtaWikiContexts === undefined
      ? {}
      : { maxMtaWikiContexts: args.maxMtaWikiContexts }),
  });
  console.log(
    `tier2-source-review-pack: selected=${result.artifact.summary.selectedSourceCount} recordReview=${result.artifact.summary.recordCandidateReviewCount} dispositionReview=${result.artifact.summary.sourceDispositionReviewCount}`,
  );
  return {
    artifactKind: result.artifact.artifactKind,
    schemaVersion: result.artifact.schemaVersion,
    generatedAt: result.artifact.generatedAt,
    outputPath: result.outputPath,
    markdownPath: result.markdownPath,
    summaryPath: result.summaryPath,
    summary: result.artifact.summary,
  };
}
