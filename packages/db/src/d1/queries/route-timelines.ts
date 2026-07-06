import { and, asc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { routeTimelineIndex } from "../schema.js";
import { parseJsonArray, parseJsonStringArray } from "./shared.js";

const routeTimelineSupportLevels = [
  "timeline_ready",
  "timeline_sparse",
  "timeline_review_only",
  "invalid",
] as const;

export type RouteTimelineSupportLevel = (typeof routeTimelineSupportLevels)[number];

export type RouteTimelineIndex = {
  routeId: string;
  month: string;
  supportLevel: RouteTimelineSupportLevel;
  qualityFlags: string[];
  defaultEventCount: number;
  secondaryEventCount: number;
  reviewOnlyEventCount: number;
  eventCount: number;
  sourceBackedEventCount: number;
  dateAssertionBackedEventCount: number;
  unresolvedDateEventCount: number;
  lowConfidenceEventCount: number;
  unaccountedCandidateCount: number;
  validationErrorCount: number;
  validationWarningCount: number;
  totalTokens: number | null;
  defaultEvents: unknown[];
  bundleArtifactKey: string;
  bundleArtifactSha256: string;
  bundleArtifactByteLength: number;
  sourceBundlePath: string;
  generatedAt: string;
};

function logInvalidTimelineJson(row: RouteTimelineIndexRow, fieldName: string): void {
  console.error("Skipping route_timeline_index row with invalid JSON.", {
    routeId: row.route_id,
    month: row.month,
    fieldName,
  });
}

function toRouteTimelineIndex(row: RouteTimelineIndexRow): RouteTimelineIndex | null {
  const qualityFlags = parseJsonStringArray(row.quality_flags_json);
  if (qualityFlags === null) {
    logInvalidTimelineJson(row, "quality_flags_json");
    return null;
  }

  const defaultEvents = parseJsonArray(row.default_events_json);
  if (defaultEvents === null) {
    logInvalidTimelineJson(row, "default_events_json");
    return null;
  }

  return {
    routeId: row.route_id,
    month: row.month,
    supportLevel: row.support_level,
    qualityFlags,
    defaultEventCount: row.default_event_count,
    secondaryEventCount: row.secondary_event_count,
    reviewOnlyEventCount: row.review_only_event_count,
    eventCount: row.event_count,
    sourceBackedEventCount: row.source_backed_event_count,
    dateAssertionBackedEventCount: row.date_assertion_backed_event_count,
    unresolvedDateEventCount: row.unresolved_date_event_count,
    lowConfidenceEventCount: row.low_confidence_event_count,
    unaccountedCandidateCount: row.unaccounted_candidate_count,
    validationErrorCount: row.validation_error_count,
    validationWarningCount: row.validation_warning_count,
    totalTokens: row.total_tokens,
    defaultEvents,
    bundleArtifactKey: row.bundle_artifact_key,
    bundleArtifactSha256: row.bundle_artifact_sha256,
    bundleArtifactByteLength: row.bundle_artifact_byte_length,
    sourceBundlePath: row.source_bundle_path,
    generatedAt: row.generated_at,
  };
}

const routeTimelineIndexSelect = {
  route_id: routeTimelineIndex.routeId,
  month: routeTimelineIndex.month,
  support_level: routeTimelineIndex.supportLevel,
  quality_flags_json: routeTimelineIndex.qualityFlagsJson,
  default_event_count: routeTimelineIndex.defaultEventCount,
  secondary_event_count: routeTimelineIndex.secondaryEventCount,
  review_only_event_count: routeTimelineIndex.reviewOnlyEventCount,
  event_count: routeTimelineIndex.eventCount,
  source_backed_event_count: routeTimelineIndex.sourceBackedEventCount,
  date_assertion_backed_event_count: routeTimelineIndex.dateAssertionBackedEventCount,
  unresolved_date_event_count: routeTimelineIndex.unresolvedDateEventCount,
  low_confidence_event_count: routeTimelineIndex.lowConfidenceEventCount,
  unaccounted_candidate_count: routeTimelineIndex.unaccountedCandidateCount,
  validation_error_count: routeTimelineIndex.validationErrorCount,
  validation_warning_count: routeTimelineIndex.validationWarningCount,
  total_tokens: routeTimelineIndex.totalTokens,
  default_events_json: routeTimelineIndex.defaultEventsJson,
  bundle_artifact_key: routeTimelineIndex.bundleArtifactKey,
  bundle_artifact_sha256: routeTimelineIndex.bundleArtifactSha256,
  bundle_artifact_byte_length: routeTimelineIndex.bundleArtifactByteLength,
  source_bundle_path: routeTimelineIndex.sourceBundlePath,
  generated_at: routeTimelineIndex.generatedAt,
};

async function selectRouteTimelineIndexRow(db: D1ServingDb, routeId: string, month: string) {
  return db
    .select(routeTimelineIndexSelect)
    .from(routeTimelineIndex)
    .where(and(eq(routeTimelineIndex.routeId, routeId), eq(routeTimelineIndex.month, month)))
    .limit(1);
}

async function selectRouteTimelineIndexRows(db: D1ServingDb, month: string) {
  return db
    .select(routeTimelineIndexSelect)
    .from(routeTimelineIndex)
    .where(eq(routeTimelineIndex.month, month))
    .orderBy(asc(routeTimelineIndex.routeId));
}

export type RouteTimelineIndexRow = Awaited<
  ReturnType<typeof selectRouteTimelineIndexRows>
>[number];

export async function getRouteTimelineIndex(
  db: D1ServingDb,
  routeId: string,
  month: string,
): Promise<RouteTimelineIndex | null> {
  const rows = await selectRouteTimelineIndexRow(db, routeId, month);
  const row = rows[0];
  return row === undefined ? null : toRouteTimelineIndex(row);
}

export async function listRouteTimelineIndex(
  db: D1ServingDb,
  month: string,
): Promise<RouteTimelineIndex[]> {
  const rows = await selectRouteTimelineIndexRows(db, month);
  return rows.flatMap((row) => {
    const timeline = toRouteTimelineIndex(row);
    return timeline === null ? [] : [timeline];
  });
}
