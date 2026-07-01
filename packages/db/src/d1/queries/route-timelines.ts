import { and, asc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import { routeTimelineIndex } from "../schema.js";
import { IsoMonthSchema } from "./shared.js";

const RouteTimelineSupportLevelSchema = z.enum([
  "timeline_ready",
  "timeline_sparse",
  "timeline_review_only",
  "invalid",
]);

const RouteTimelineIndexRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    support_level: RouteTimelineSupportLevelSchema,
    quality_flags_json: z.string(),
    default_event_count: z.number().int().nonnegative(),
    secondary_event_count: z.number().int().nonnegative(),
    review_only_event_count: z.number().int().nonnegative(),
    event_count: z.number().int().nonnegative(),
    source_backed_event_count: z.number().int().nonnegative(),
    date_assertion_backed_event_count: z.number().int().nonnegative(),
    unresolved_date_event_count: z.number().int().nonnegative(),
    low_confidence_event_count: z.number().int().nonnegative(),
    unaccounted_candidate_count: z.number().int().nonnegative(),
    validation_error_count: z.number().int().nonnegative(),
    validation_warning_count: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative().nullable(),
    default_events_json: z.string(),
    bundle_artifact_key: z.string().min(1),
    bundle_artifact_sha256: z.string().length(64),
    bundle_artifact_byte_length: z.number().int().nonnegative(),
    source_bundle_path: z.string().min(1),
    generated_at: z.string().min(1),
  })
  .strict();

export type RouteTimelineSupportLevel = z.output<typeof RouteTimelineSupportLevelSchema>;
export type RouteTimelineIndexRow = z.output<typeof RouteTimelineIndexRowSchema>;

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

function parseStringArrayJson(value: string, fieldName: string): string[] {
  try {
    return z.array(z.string()).parse(JSON.parse(value));
  } catch (error) {
    throw new Error(`Invalid ${fieldName} JSON in route_timeline_index: ${String(error)}`);
  }
}

function parseArrayJson(value: string, fieldName: string): unknown[] {
  try {
    return z.array(z.unknown()).parse(JSON.parse(value));
  } catch (error) {
    throw new Error(`Invalid ${fieldName} JSON in route_timeline_index: ${String(error)}`);
  }
}

function toRouteTimelineIndex(row: RouteTimelineIndexRow): RouteTimelineIndex {
  return {
    routeId: row.route_id,
    month: row.month,
    supportLevel: row.support_level,
    qualityFlags: parseStringArrayJson(row.quality_flags_json, "quality_flags_json"),
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
    defaultEvents: parseArrayJson(row.default_events_json, "default_events_json"),
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

export async function getRouteTimelineIndex(
  db: D1ServingDb,
  routeId: string,
  month: string,
): Promise<RouteTimelineIndex | null> {
  const rows = await db
    .select(routeTimelineIndexSelect)
    .from(routeTimelineIndex)
    .where(and(eq(routeTimelineIndex.routeId, routeId), eq(routeTimelineIndex.month, month)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : toRouteTimelineIndex(RouteTimelineIndexRowSchema.parse(row));
}

export async function listRouteTimelineIndex(
  db: D1ServingDb,
  month: string,
): Promise<RouteTimelineIndex[]> {
  const rows = await db
    .select(routeTimelineIndexSelect)
    .from(routeTimelineIndex)
    .where(eq(routeTimelineIndex.month, month))
    .orderBy(asc(routeTimelineIndex.routeId));

  return rows.map((row) => toRouteTimelineIndex(RouteTimelineIndexRowSchema.parse(row)));
}
