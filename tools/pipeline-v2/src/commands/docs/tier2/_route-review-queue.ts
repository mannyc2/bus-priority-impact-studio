import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { latestDocsRunId, runArtifactRoot } from "./_shared.ts";
import type {
  EventRouteResolutionArtifact,
  EventRouteResolutionRow,
  InterventionFamily,
  RouteResolutionTier,
} from "./_event-route-resolution.ts";

const ARTIFACT_KIND = "bp.tier2_route_review_queue.v1";
const DEFAULT_SURFACES_DIR = "document-derived-surfaces-v1";
const DEFAULT_ROUTE_RESOLUTION_FILENAME = "document-event-route-resolution-v1.json";
const DEFAULT_OUTPUT_FILENAME = "document-route-review-queue-v1.json";

type ReviewPriorityBand = "high" | "medium" | "low";

type ReviewerDecisionOption =
  | "approve_for_route_timeline_candidate"
  | "approve_as_supporting_context"
  | "needs_historical_gtfs_date_validation"
  | "route_mismatch"
  | "not_an_intervention"
  | "duplicate_or_superseded"
  | "needs_manual_curation"
  | "reject";

export type Tier2RouteReviewQueueItem = {
  queueItemId: string;
  routeId: string;
  sourceEventSurfaceId: string;
  sourceId: string;
  sourceTitle: string | null;
  sourceGroup: string | null;
  title: string;
  displayLabel: string | null;
  dateText: string | null;
  eventStatus: string | null;
  eventKind: string;
  interventionFamily: InterventionFamily;
  routeResolutionTier: RouteResolutionTier;
  routeResolutionState: "resolved" | "ambiguous" | "unresolved";
  allResolvedRouteIds: string[];
  routeFanout: number;
  routeResolutionEvidence: EventRouteResolutionRow["routeResolutionEvidence"];
  routeIdentityValidationState: EventRouteResolutionRow["routeIdentityValidationState"];
  dateValidationState: EventRouteResolutionRow["dateValidationState"];
  reviewPriority: number;
  reviewPriorityBand: ReviewPriorityBand;
  reviewTasks: string[];
  reviewerDecisionOptions: ReviewerDecisionOption[];
  promotionCaveats: string[];
  evidenceRefs: EventRouteResolutionRow["evidenceRefs"];
};

export type Tier2RouteReviewQueueRoute = {
  routeId: string;
  itemCount: number;
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowPriorityCount: number;
  sourceCount: number;
  interventionFamilyCounts: Record<string, number>;
  routeResolutionTierCounts: Record<string, number>;
  items: Tier2RouteReviewQueueItem[];
};

export type Tier2RouteReviewQueueArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceRouteResolutionPath: string;
  routeResolutionGeneratedAt: string | null;
  summary: {
    routeCount: number;
    queueItemCount: number;
    sourceEventCount: number;
    sourceCount: number;
    highPriorityCount: number;
    mediumPriorityCount: number;
    lowPriorityCount: number;
    countsByInterventionFamily: Record<string, number>;
    countsByRouteResolutionTier: Record<string, number>;
    countsByReviewerDecisionDefault: Record<string, number>;
    excludedBacklog: {
      ambiguousInterventionCandidateCount: number;
      unresolvedInterventionCandidateCount: number;
      processOnlyEventCount: number;
      evaluationOrMonitoringEventCount: number;
      contextOnlyEventCount: number;
      needsReviewEventCount: number;
    };
  };
  routes: Tier2RouteReviewQueueRoute[];
};

export type RunTier2RouteReviewQueueArgs = {
  routeResolutionPath: string;
  outputPath: string;
  generatedAt?: string;
};

export type RunTier2RouteReviewQueueResult = {
  outputPath: string;
  artifact: Tier2RouteReviewQueueArtifact;
};

type CliArgs = {
  artifactRoot?: string;
  runId?: string;
  surfacesDir?: string;
  routeResolutionPath?: string;
  outputPath?: string;
  generatedAt?: string;
};

function shortHash(value: string, length = 16): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function addCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function displayTitle(row: EventRouteResolutionRow): string {
  return row.eventName ?? row.displayLabel ?? row.treatmentText ?? row.locationText ?? row.surfaceId;
}

function defaultDecision(item: Pick<Tier2RouteReviewQueueItem, "dateValidationState">): ReviewerDecisionOption {
  switch (item.dateValidationState) {
    case "source_stated_operational_date":
    case "source_stated_planned_date":
      return "approve_for_route_timeline_candidate";
    case "non_operational_milestone":
      return "approve_as_supporting_context";
    default:
      return "needs_manual_curation";
  }
}

function priorityForRow(row: EventRouteResolutionRow): number {
  let score = 20;
  switch (row.routeResolutionTier) {
    case "direct_event_text":
      score += 35;
      break;
    case "source_single_route_context":
      score += 25;
      break;
    case "corridor_gazetteer":
      score += 20;
      break;
    default:
      score += 0;
  }

  const status = (row.eventStatus ?? "").toLowerCase();
  if (status === "implemented") score += 18;
  else if (status === "planned" || status === "approved") score += 12;
  else if (status === "proposed") score += 8;

  if (row.dateText !== null && row.dateText.trim().length > 0) score += 10;
  if (row.evidenceRefs.length >= 2) score += 5;

  if (row.interventionFamily !== "none" && row.interventionFamily !== "other_bus_priority") {
    score += 12;
  } else if (row.interventionFamily === "other_bus_priority") {
    score += 5;
  }

  if (row.routeCount <= 2) score += 5;
  else if (row.routeCount <= 6) score += 2;

  return Math.max(0, Math.min(100, score));
}

function priorityBand(score: number): ReviewPriorityBand {
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  return "low";
}

function reviewTasksForRow(row: EventRouteResolutionRow): string[] {
  const tasks = [
    "Confirm the cited document text supports the event description.",
    "Confirm this is an intervention timeline candidate, not only outreach/process/context.",
    "Confirm the resolved route identity is appropriate for this event.",
    "Check for duplicates or superseding events before promotion.",
  ];
  if (row.dateValidationState === "source_stated_planned_date") {
    tasks.push(
      "Confirm via historical GTFS route/service exposure that the source's planned/scheduled date was realized (the source-stated date itself is trusted unless contradicted).",
    );
  } else if (
    row.dateValidationState === "needs_review" ||
    row.dateValidationState === "operational_without_date"
  ) {
    tasks.push(
      "Resolve the operational-date ambiguity: confirm from the source whether this is an operational/launch date, and locate the effective date if it is missing.",
    );
  }
  if (row.routeResolutionTier !== "direct_event_text") {
    tasks.push("Review the weaker route-resolution path because the event text did not directly name this route.");
  }
  return tasks;
}

function decisionOptionsForRow(row: EventRouteResolutionRow): ReviewerDecisionOption[] {
  const options: ReviewerDecisionOption[] = [
    "needs_historical_gtfs_date_validation",
    "approve_for_route_timeline_candidate",
    "approve_as_supporting_context",
    "route_mismatch",
    "not_an_intervention",
    "duplicate_or_superseded",
    "needs_manual_curation",
    "reject",
  ];
  const gtfsExposureRelevant =
    row.dateValidationState === "source_stated_planned_date" ||
    row.dateValidationState === "needs_review" ||
    row.dateValidationState === "operational_without_date";
  if (!gtfsExposureRelevant) {
    return options.filter((option) => option !== "needs_historical_gtfs_date_validation");
  }
  return options;
}

function queueItemForRoute(row: EventRouteResolutionRow, routeId: string): Tier2RouteReviewQueueItem {
  const reviewPriority = priorityForRow(row);
  return {
    queueItemId: `tier2_route_review_${shortHash(`${routeId}|${row.surfaceId}`)}`,
    routeId,
    sourceEventSurfaceId: row.surfaceId,
    sourceId: row.sourceId,
    sourceTitle: row.sourceTitle,
    sourceGroup: row.sourceGroup,
    title: displayTitle(row),
    displayLabel: row.displayLabel,
    dateText: row.dateText,
    eventStatus: row.eventStatus,
    eventKind: row.eventKind,
    interventionFamily: row.interventionFamily,
    routeResolutionTier: row.routeResolutionTier,
    routeResolutionState: row.routeResolutionState,
    allResolvedRouteIds: row.routeIds,
    routeFanout: row.routeCount,
    routeResolutionEvidence: row.routeResolutionEvidence,
    routeIdentityValidationState: row.routeIdentityValidationState,
    dateValidationState: row.dateValidationState,
    reviewPriority,
    reviewPriorityBand: priorityBand(reviewPriority),
    reviewTasks: reviewTasksForRow(row),
    reviewerDecisionOptions: decisionOptionsForRow(row),
    promotionCaveats: row.promotionCaveats,
    evidenceRefs: row.evidenceRefs,
  };
}

function sortItems(a: Tier2RouteReviewQueueItem, b: Tier2RouteReviewQueueItem): number {
  if (b.reviewPriority !== a.reviewPriority) return b.reviewPriority - a.reviewPriority;
  const dateCompare = (a.dateText ?? "").localeCompare(b.dateText ?? "");
  if (dateCompare !== 0) return dateCompare;
  return a.queueItemId.localeCompare(b.queueItemId);
}

function buildRouteQueue(routeId: string, items: Tier2RouteReviewQueueItem[]): Tier2RouteReviewQueueRoute {
  const sourceIds = new Set<string>();
  const interventionFamilyCounts: Record<string, number> = {};
  const routeResolutionTierCounts: Record<string, number> = {};
  let highPriorityCount = 0;
  let mediumPriorityCount = 0;
  let lowPriorityCount = 0;

  for (const item of items) {
    sourceIds.add(item.sourceId);
    addCount(interventionFamilyCounts, item.interventionFamily);
    addCount(routeResolutionTierCounts, item.routeResolutionTier);
    if (item.reviewPriorityBand === "high") highPriorityCount += 1;
    else if (item.reviewPriorityBand === "medium") mediumPriorityCount += 1;
    else lowPriorityCount += 1;
  }

  return {
    routeId,
    itemCount: items.length,
    highPriorityCount,
    mediumPriorityCount,
    lowPriorityCount,
    sourceCount: sourceIds.size,
    interventionFamilyCounts,
    routeResolutionTierCounts,
    items: items.toSorted(sortItems),
  };
}

function buildSummary(input: {
  routeQueues: readonly Tier2RouteReviewQueueRoute[];
  sourceRows: readonly EventRouteResolutionRow[];
}): Tier2RouteReviewQueueArtifact["summary"] {
  const sourceIds = new Set<string>();
  const sourceEventSurfaceIds = new Set<string>();
  const countsByInterventionFamily: Record<string, number> = {};
  const countsByRouteResolutionTier: Record<string, number> = {};
  const countsByReviewerDecisionDefault: Record<string, number> = {};
  let highPriorityCount = 0;
  let mediumPriorityCount = 0;
  let lowPriorityCount = 0;
  let queueItemCount = 0;

  for (const routeQueue of input.routeQueues) {
    queueItemCount += routeQueue.itemCount;
    for (const item of routeQueue.items) {
      sourceIds.add(item.sourceId);
      sourceEventSurfaceIds.add(item.sourceEventSurfaceId);
      addCount(countsByInterventionFamily, item.interventionFamily);
      addCount(countsByRouteResolutionTier, item.routeResolutionTier);
      addCount(countsByReviewerDecisionDefault, defaultDecision(item));
      if (item.reviewPriorityBand === "high") highPriorityCount += 1;
      else if (item.reviewPriorityBand === "medium") mediumPriorityCount += 1;
      else lowPriorityCount += 1;
    }
  }

  return {
    routeCount: input.routeQueues.length,
    queueItemCount,
    sourceEventCount: sourceEventSurfaceIds.size,
    sourceCount: sourceIds.size,
    highPriorityCount,
    mediumPriorityCount,
    lowPriorityCount,
    countsByInterventionFamily,
    countsByRouteResolutionTier,
    countsByReviewerDecisionDefault,
    excludedBacklog: {
      ambiguousInterventionCandidateCount: input.sourceRows.filter(
        (row) =>
          row.timelineEligibility === "intervention_timeline_candidate" &&
          row.routeResolutionState === "ambiguous",
      ).length,
      unresolvedInterventionCandidateCount: input.sourceRows.filter(
        (row) =>
          row.timelineEligibility === "intervention_timeline_candidate" &&
          row.routeResolutionState === "unresolved",
      ).length,
      processOnlyEventCount: input.sourceRows.filter((row) => row.timelineEligibility === "process_only").length,
      evaluationOrMonitoringEventCount: input.sourceRows.filter(
        (row) => row.timelineEligibility === "evaluation_or_monitoring",
      ).length,
      contextOnlyEventCount: input.sourceRows.filter((row) => row.timelineEligibility === "context_only").length,
      needsReviewEventCount: input.sourceRows.filter((row) => row.timelineEligibility === "needs_review").length,
    },
  };
}

export function buildTier2RouteReviewQueue(
  routeResolution: EventRouteResolutionArtifact,
  input: {
    routeResolutionPath: string;
    generatedAt: string;
  },
): Tier2RouteReviewQueueArtifact {
  const itemsByRoute = new Map<string, Tier2RouteReviewQueueItem[]>();
  for (const row of routeResolution.rows) {
    if (!row.promotableToRouteReviewQueue) continue;
    for (const routeId of row.routeIds) {
      const item = queueItemForRoute(row, routeId);
      const items = itemsByRoute.get(routeId) ?? [];
      items.push(item);
      itemsByRoute.set(routeId, items);
    }
  }

  const routes = Array.from(itemsByRoute.entries())
    .map(([routeId, items]) => buildRouteQueue(routeId, items))
    .toSorted((a, b) => {
      if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
      return a.routeId.localeCompare(b.routeId);
    });

  return {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    sourceRouteResolutionPath: input.routeResolutionPath,
    routeResolutionGeneratedAt: routeResolution.generatedAt ?? null,
    summary: buildSummary({ routeQueues: routes, sourceRows: routeResolution.rows }),
    routes,
  };
}

export async function runTier2RouteReviewQueue(
  args: RunTier2RouteReviewQueueArgs,
): Promise<RunTier2RouteReviewQueueResult> {
  const routeResolution =
    (await Bun.file(args.routeResolutionPath).json()) as EventRouteResolutionArtifact;
  const artifact = buildTier2RouteReviewQueue(routeResolution, {
    routeResolutionPath: args.routeResolutionPath,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
  });

  await mkdir(dirname(args.outputPath), { recursive: true });
  await writeJson(args.outputPath, artifact);
  return { outputPath: args.outputPath, artifact };
}

function parseCliOptions(args: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !flag.startsWith("--")) throw new Error(`Unknown argument: ${flag ?? ""}`);
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    index += 1;
    switch (flag) {
      case "--artifact-root":
        parsed.artifactRoot = value;
        break;
      case "--run-id":
        parsed.runId = value;
        break;
      case "--surfaces-dir":
        parsed.surfacesDir = value;
        break;
      case "--route-resolution":
        parsed.routeResolutionPath = value;
        break;
      case "--output":
        parsed.outputPath = value;
        break;
      case "--generated-at":
        parsed.generatedAt = value;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return parsed;
}

export async function runTier2RouteReviewQueueFromCli(args: string[]) {
  const parsed = parseCliOptions(args);
  const artifactRoot = parsed.artifactRoot ? fromCliPath(parsed.artifactRoot) : defaultArtifactRootPath();
  const runId = parsed.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null && parsed.surfacesDir === undefined && parsed.routeResolutionPath === undefined) {
    throw new Error("No Tier 2 run found. Pass --route-resolution, --surfaces-dir, or --run-id.");
  }
  const surfacesDir =
    parsed.surfacesDir !== undefined
      ? fromCliPath(parsed.surfacesDir)
      : join(runArtifactRoot(artifactRoot, runId ?? ""), DEFAULT_SURFACES_DIR);
  const routeResolutionPath =
    parsed.routeResolutionPath !== undefined
      ? fromCliPath(parsed.routeResolutionPath)
      : join(surfacesDir, DEFAULT_ROUTE_RESOLUTION_FILENAME);
  const outputPath =
    parsed.outputPath !== undefined
      ? fromCliPath(parsed.outputPath)
      : join(surfacesDir, DEFAULT_OUTPUT_FILENAME);
  return runTier2RouteReviewQueue({
    routeResolutionPath,
    outputPath,
    ...(parsed.generatedAt ? { generatedAt: parsed.generatedAt } : {}),
  });
}
