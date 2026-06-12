import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import type { Tier2VocabMaterializedViewsArtifact } from "./_vocab-materialized-views.ts";

const ARTIFACT_KIND = "bp.tier2_source_disposition_queue.v1";
const SUMMARY_KIND = "bp.tier2_source_disposition_queue_summary.v1";

type SourceCoverageRow = Tier2VocabMaterializedViewsArtifact["sourceCoverageRows"][number];

type ReviewLane = "record_candidate_review" | "source_disposition_review";
type ReviewPriority = "high" | "medium" | "low";
type SuggestedDisposition =
  | "author_reviewed_intervention_record"
  | "write_source_disposition_receipt";

type CandidateSignals = {
  eventCandidateSurfaceCount: number;
  serviceChangeCandidateSurfaceCount: number;
  treatmentComponentSurfaceCount: number;
  metricObservationSurfaceCount: number;
  claimSurfaceCount: number;
  contextSignalSurfaceCount: number;
  reviewQuestionSurfaceCount: number;
  tableSurfaceCount: number;
  eventTreatmentKeyCount: number;
  eventOrTreatmentSignalCount: number;
};

export type Tier2SourceDispositionQueueItem = {
  queueRef: string;
  sourceId: string;
  sourceTitle: string | null;
  sourceGroup: string | null;
  reviewLane: ReviewLane;
  priority: ReviewPriority;
  suggestedDisposition: SuggestedDisposition;
  reviewReceiptStatus: "needs_review_receipt";
  publicPromotionStatus: "not_ready";
  surfaceCount: number;
  mappedFieldCount: number;
  unresolvedFieldCount: number;
  routeCount: number;
  routeIds: string[];
  sampleRouteIds: string[];
  pageNumbers: number[];
  evidencePointerCount: number;
  evidencePointerIds: string[];
  candidateSignals: CandidateSignals;
  surfaceKindCounts: Record<string, number>;
  keyCounts: Record<string, number>;
  unresolvedByDecision: Record<string, number>;
  reviewFlags: string[];
  sampleSurfaces: SourceCoverageRow["sampleSurfaces"];
};

export type Tier2SourceDispositionQueueArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceMaterializedViewsPath: string;
  sourceMaterializedViewsGeneratedAt: string;
  summary: {
    sourceCount: number;
    reviewQueueItemCount: number;
    recordCandidateReviewCount: number;
    sourceDispositionReviewCount: number;
    highPrioritySourceCount: number;
    mediumPrioritySourceCount: number;
    lowPrioritySourceCount: number;
    routeLinkedSourceCount: number;
    uniqueRouteCount: number;
    evidencePointerSourceCount: number;
    eventOrTreatmentSourceCount: number;
    wideRouteFanoutSourceCount: number;
    unresolvedSourceCount: number;
    reviewReceiptMissingCount: number;
    reviewReceiptSatisfiedCount: 0;
    publicPromotionStatus: "not_ready";
    promotionBlockers: string[];
    sourceGroupCounts: Record<string, number>;
    topSourceRefs: Array<{
      queueRef: string;
      sourceId: string;
      reviewLane: ReviewLane;
      priority: ReviewPriority;
      routeCount: number;
      surfaceCount: number;
      eventOrTreatmentSignalCount: number;
      unresolvedFieldCount: number;
    }>;
  };
  policy: {
    useCase: string;
    reviewReceiptRequirement: string;
    publicPromotionRule: string;
  };
  items: Tier2SourceDispositionQueueItem[];
};

export type BuildTier2SourceDispositionQueueArgs = {
  materializedViewsPath: string;
  outputPath?: string;
  markdownPath?: string;
  summaryPath?: string;
  generatedAt?: string;
  maxRoutesPerSource?: number;
  maxMarkdownRows?: number;
};

type CliArgs = Partial<BuildTier2SourceDispositionQueueArgs>;

function count(record: Record<string, number>, key: string): number {
  return record[key] ?? 0;
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function finalizeRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function candidateSignalsFor(row: SourceCoverageRow): CandidateSignals {
  const eventCandidateSurfaceCount = count(row.surfaceKindCounts, "event_candidate");
  const serviceChangeCandidateSurfaceCount = count(
    row.surfaceKindCounts,
    "service_change_candidate",
  );
  const treatmentComponentSurfaceCount = count(row.surfaceKindCounts, "treatment_component");
  const metricObservationSurfaceCount = count(row.surfaceKindCounts, "metric_observation");
  const claimSurfaceCount =
    count(row.surfaceKindCounts, "claim") + count(row.surfaceKindCounts, "causal_claim");
  const contextSignalSurfaceCount = count(row.surfaceKindCounts, "context_signal");
  const reviewQuestionSurfaceCount = count(row.surfaceKindCounts, "review_question");
  const tableSurfaceCount = count(row.surfaceKindCounts, "table");
  const eventTreatmentKeyCount =
    count(row.keyCounts, "eventFamily") +
    count(row.keyCounts, "eventSubtype") +
    count(row.keyCounts, "eventTreatmentFamily");
  const eventOrTreatmentSignalCount =
    eventCandidateSurfaceCount +
    serviceChangeCandidateSurfaceCount +
    treatmentComponentSurfaceCount +
    eventTreatmentKeyCount;

  return {
    eventCandidateSurfaceCount,
    serviceChangeCandidateSurfaceCount,
    treatmentComponentSurfaceCount,
    metricObservationSurfaceCount,
    claimSurfaceCount,
    contextSignalSurfaceCount,
    reviewQuestionSurfaceCount,
    tableSurfaceCount,
    eventTreatmentKeyCount,
    eventOrTreatmentSignalCount,
  };
}

function reviewLaneFor(signals: CandidateSignals): ReviewLane {
  return signals.eventOrTreatmentSignalCount > 0
    ? "record_candidate_review"
    : "source_disposition_review";
}

function priorityFor(row: SourceCoverageRow, signals: CandidateSignals): ReviewPriority {
  if (signals.eventOrTreatmentSignalCount > 0 && row.routeCount > 0) return "high";
  if (
    signals.eventOrTreatmentSignalCount > 0 ||
    row.routeCount > 0 ||
    signals.metricObservationSurfaceCount > 0 ||
    signals.claimSurfaceCount > 0
  ) {
    return "medium";
  }
  return "low";
}

function suggestedDispositionFor(lane: ReviewLane): SuggestedDisposition {
  return lane === "record_candidate_review"
    ? "author_reviewed_intervention_record"
    : "write_source_disposition_receipt";
}

function reviewFlagsFor(row: SourceCoverageRow, signals: CandidateSignals): string[] {
  const flags: string[] = [];
  if (signals.eventOrTreatmentSignalCount > 0) flags.push("event_or_treatment_signal");
  if (row.routeCount >= 20) flags.push("wide_route_fanout");
  if (row.routeCount === 0) flags.push("no_route_links");
  if (row.evidencePointerCount === 0) flags.push("no_evidence_pointers");
  if (row.unresolvedFieldCount > 0) flags.push("unresolved_fields_present");
  if (
    signals.eventOrTreatmentSignalCount === 0 &&
    (signals.contextSignalSurfaceCount > 0 ||
      signals.reviewQuestionSurfaceCount > 0 ||
      signals.tableSurfaceCount > 0)
  ) {
    flags.push("context_or_process_heavy");
  }
  return flags;
}

const priorityRank: Record<ReviewPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const laneRank: Record<ReviewLane, number> = {
  record_candidate_review: 0,
  source_disposition_review: 1,
};

function compareItems(
  left: Omit<Tier2SourceDispositionQueueItem, "queueRef">,
  right: Omit<Tier2SourceDispositionQueueItem, "queueRef">,
): number {
  return (
    priorityRank[left.priority] - priorityRank[right.priority] ||
    laneRank[left.reviewLane] - laneRank[right.reviewLane] ||
    right.candidateSignals.eventOrTreatmentSignalCount -
      left.candidateSignals.eventOrTreatmentSignalCount ||
    right.routeCount - left.routeCount ||
    right.surfaceCount - left.surfaceCount ||
    right.evidencePointerCount - left.evidencePointerCount ||
    left.sourceId.localeCompare(right.sourceId)
  );
}

function buildQueue(input: {
  materializedViews: Tier2VocabMaterializedViewsArtifact;
  materializedViewsPath: string;
  generatedAt: string;
  maxRoutesPerSource: number;
}): Tier2SourceDispositionQueueArtifact {
  const baseItems = input.materializedViews.sourceCoverageRows.map(
    (source): Omit<Tier2SourceDispositionQueueItem, "queueRef"> => {
      const candidateSignals = candidateSignalsFor(source);
      const reviewLane = reviewLaneFor(candidateSignals);
      const priority = priorityFor(source, candidateSignals);
      return {
        sourceId: source.sourceId,
        sourceTitle: source.sourceTitle,
        sourceGroup: source.sourceGroup,
        reviewLane,
        priority,
        suggestedDisposition: suggestedDispositionFor(reviewLane),
        reviewReceiptStatus: "needs_review_receipt",
        publicPromotionStatus: "not_ready",
        surfaceCount: source.surfaceCount,
        mappedFieldCount: source.mappedFieldCount,
        unresolvedFieldCount: source.unresolvedFieldCount,
        routeCount: source.routeCount,
        routeIds: source.routeIds,
        sampleRouteIds: source.routeIds.slice(0, input.maxRoutesPerSource),
        pageNumbers: source.pageNumbers,
        evidencePointerCount: source.evidencePointerCount,
        evidencePointerIds: source.evidencePointerIds,
        candidateSignals,
        surfaceKindCounts: source.surfaceKindCounts,
        keyCounts: source.keyCounts,
        unresolvedByDecision: source.unresolvedByDecision,
        reviewFlags: reviewFlagsFor(source, candidateSignals),
        sampleSurfaces: source.sampleSurfaces,
      };
    },
  );

  const items: Tier2SourceDispositionQueueItem[] = baseItems
    .sort(compareItems)
    .map((item, index) => ({
      queueRef: `s${String(index + 1).padStart(3, "0")}`,
      ...item,
    }));

  const sourceGroupCounts: Record<string, number> = {};
  const uniqueRouteIds = new Set<string>();
  for (const item of items) {
    increment(sourceGroupCounts, item.sourceGroup ?? "unknown_source_group");
    for (const routeId of item.routeIds) uniqueRouteIds.add(routeId);
  }

  const summary: Tier2SourceDispositionQueueArtifact["summary"] = {
    sourceCount: items.length,
    reviewQueueItemCount: items.length,
    recordCandidateReviewCount: items.filter(
      (item) => item.reviewLane === "record_candidate_review",
    ).length,
    sourceDispositionReviewCount: items.filter(
      (item) => item.reviewLane === "source_disposition_review",
    ).length,
    highPrioritySourceCount: items.filter((item) => item.priority === "high").length,
    mediumPrioritySourceCount: items.filter((item) => item.priority === "medium").length,
    lowPrioritySourceCount: items.filter((item) => item.priority === "low").length,
    routeLinkedSourceCount: items.filter((item) => item.routeCount > 0).length,
    uniqueRouteCount: uniqueRouteIds.size,
    evidencePointerSourceCount: items.filter((item) => item.evidencePointerCount > 0).length,
    eventOrTreatmentSourceCount: items.filter(
      (item) => item.candidateSignals.eventOrTreatmentSignalCount > 0,
    ).length,
    wideRouteFanoutSourceCount: items.filter((item) =>
      item.reviewFlags.includes("wide_route_fanout"),
    ).length,
    unresolvedSourceCount: items.filter((item) => item.unresolvedFieldCount > 0).length,
    reviewReceiptMissingCount: items.length,
    reviewReceiptSatisfiedCount: 0,
    publicPromotionStatus: "not_ready",
    promotionBlockers: [
      "source-level review receipts have not been written",
      "reviewed bp.document_intervention_record.v1 records have not been backfilled for the full corpus",
      "publishable interventions must be generated only from reviewed records",
    ],
    sourceGroupCounts: finalizeRecord(sourceGroupCounts),
    topSourceRefs: items.slice(0, 20).map((item) => ({
      queueRef: item.queueRef,
      sourceId: item.sourceId,
      reviewLane: item.reviewLane,
      priority: item.priority,
      routeCount: item.routeCount,
      surfaceCount: item.surfaceCount,
      eventOrTreatmentSignalCount: item.candidateSignals.eventOrTreatmentSignalCount,
      unresolvedFieldCount: item.unresolvedFieldCount,
    })),
  };

  return {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    sourceMaterializedViewsPath: input.materializedViewsPath,
    sourceMaterializedViewsGeneratedAt: input.materializedViews.generatedAt,
    summary,
    policy: {
      useCase:
        "Deterministic source-level queue for assigning each full-corpus source either reviewed intervention records or an explicit source disposition receipt.",
      reviewReceiptRequirement:
        "Every source row needs at least one reviewed bp.document_intervention_record.v1 record or an explicit sourceDisposition receipt before it can be counted as closed.",
      publicPromotionRule:
        "This queue is not a public fact layer. Public intervention projections must be generated from reviewed records after dispositions are complete.",
    },
    items,
  };
}

function markdownEscape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderSourceDispositionQueueMarkdown(
  artifact: Tier2SourceDispositionQueueArtifact,
  args: { maxRows?: number } = {},
): string {
  const maxRows = args.maxRows ?? 50;
  const lines: string[] = [];
  lines.push("# Tier 2 Source Disposition Queue");
  lines.push("");
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Sources: ${artifact.summary.sourceCount}`);
  lines.push(`- Record-candidate review: ${artifact.summary.recordCandidateReviewCount}`);
  lines.push(`- Source-disposition review: ${artifact.summary.sourceDispositionReviewCount}`);
  lines.push(`- High priority: ${artifact.summary.highPrioritySourceCount}`);
  lines.push(`- Route-linked sources: ${artifact.summary.routeLinkedSourceCount}`);
  lines.push(`- Unique routes mentioned: ${artifact.summary.uniqueRouteCount}`);
  lines.push(`- Sources with unresolved fields: ${artifact.summary.unresolvedSourceCount}`);
  lines.push(`- Review receipts missing: ${artifact.summary.reviewReceiptMissingCount}`);
  lines.push(`- Public promotion status: ${artifact.summary.publicPromotionStatus}`);
  lines.push("");
  lines.push("## Policy");
  lines.push("");
  lines.push(`- ${artifact.policy.reviewReceiptRequirement}`);
  lines.push(`- ${artifact.policy.publicPromotionRule}`);
  lines.push("");
  lines.push("## Top Queue Items");
  lines.push("");
  lines.push("| Ref | Priority | Lane | Source | Routes | Surfaces | Signals | Unresolved | Flags |");
  lines.push("|---|---|---|---|---:|---:|---:|---:|---|");
  for (const item of artifact.items.slice(0, maxRows)) {
    const title = item.sourceTitle === null ? item.sourceId : `${item.sourceId}: ${item.sourceTitle}`;
    lines.push(
      `| ${item.queueRef} | ${item.priority} | ${item.reviewLane} | ${markdownEscape(title)} | ${item.routeCount} | ${item.surfaceCount} | ${item.candidateSignals.eventOrTreatmentSignalCount} | ${item.unresolvedFieldCount} | ${item.reviewFlags.join(", ")} |`,
    );
  }
  lines.push("");
  lines.push("## Promotion Blockers");
  lines.push("");
  for (const blocker of artifact.summary.promotionBlockers) {
    lines.push(`- ${blocker}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function buildTier2SourceDispositionQueue(
  args: BuildTier2SourceDispositionQueueArgs,
): Promise<Tier2SourceDispositionQueueArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const materializedViewsPath = fromCliPath(args.materializedViewsPath);
  const materializedViews = (await Bun.file(
    materializedViewsPath,
  ).json()) as Tier2VocabMaterializedViewsArtifact;
  if (materializedViews.artifactKind !== "bp.tier2_vocab_materialized_views.v1") {
    throw new Error(
      `Expected bp.tier2_vocab_materialized_views.v1 artifact: ${materializedViewsPath}`,
    );
  }
  if (!Array.isArray(materializedViews.sourceCoverageRows)) {
    throw new Error(`Materialized views has no sourceCoverageRows array: ${materializedViewsPath}`);
  }
  return buildQueue({
    materializedViews,
    materializedViewsPath,
    generatedAt,
    maxRoutesPerSource: args.maxRoutesPerSource ?? 20,
  });
}

export async function runTier2SourceDispositionQueue(
  args: BuildTier2SourceDispositionQueueArgs,
): Promise<{
  artifact: Tier2SourceDispositionQueueArtifact;
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
}> {
  const artifact = await buildTier2SourceDispositionQueue(args);
  const outputPath = fromCliPath(
    args.outputPath ??
      join(defaultArtifactRootPath(), "docs", "tier2-source-disposition-queue", "source-disposition-queue.json"),
  );
  const markdownPath =
    args.markdownPath === undefined ? outputPath.replace(/\.json$/, ".md") : fromCliPath(args.markdownPath);
  const summaryPath =
    args.summaryPath === undefined
      ? outputPath.replace(/\.json$/, "-summary.json")
      : fromCliPath(args.summaryPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  const markdownOptions =
    args.maxMarkdownRows === undefined ? {} : { maxRows: args.maxMarkdownRows };
  await Bun.write(
    markdownPath,
    renderSourceDispositionQueueMarkdown(artifact, markdownOptions),
  );
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

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--materialized-views") {
      if (value === undefined) throw new Error("--materialized-views requires a value.");
      args.materializedViewsPath = value;
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
    } else if (arg === "--max-routes-per-source") {
      if (value === undefined) throw new Error("--max-routes-per-source requires a value.");
      args.maxRoutesPerSource = parseNonNegativeInteger(value, "--max-routes-per-source");
      index += 1;
    } else if (arg === "--max-markdown-rows") {
      if (value === undefined) throw new Error("--max-markdown-rows requires a value.");
      args.maxMarkdownRows = parseNonNegativeInteger(value, "--max-markdown-rows");
      index += 1;
    } else {
      throw new Error(`Unknown docs tier2 source-disposition-queue option: ${arg}`);
    }
  }
  return args;
}

export async function runTier2SourceDispositionQueueFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.materializedViewsPath === undefined) {
    throw new Error("Provide --materialized-views.");
  }
  const result = await runTier2SourceDispositionQueue({
    materializedViewsPath: args.materializedViewsPath,
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
    ...(args.maxRoutesPerSource === undefined
      ? {}
      : { maxRoutesPerSource: args.maxRoutesPerSource }),
    ...(args.maxMarkdownRows === undefined ? {} : { maxMarkdownRows: args.maxMarkdownRows }),
  });
  console.log(
    `tier2-source-disposition-queue: sources=${result.artifact.summary.sourceCount} recordReview=${result.artifact.summary.recordCandidateReviewCount} dispositionReview=${result.artifact.summary.sourceDispositionReviewCount}`,
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
