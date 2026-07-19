import { Schema } from "effect";
import { CoverageWindowSchema } from "./shared.js";

/**
 * The per-route dossier summary (frontend §7.2 / hard-cutover C2).
 *
 * The series-shaped block that de-months the route detail response: sparkline
 * vectors at monthly grain, current value + 6-month movement + peer percentile,
 * the worst segment with persistence, and the treatment posture. Built by the
 * pipeline as a per-route projection (never computed in the Worker) and embedded
 * into the detail response by key — the same pattern as the capability manifest
 * (see ./route-capability.ts).
 *
 * Sparklines are decimated to monthly route-grain points (≤36); cell-grain data
 * stays in the lazy speed-history artifact. Each block carries its own `dataAsOf`
 * clock per ADR-0017.
 */

const MonthSchema = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/));

export function routeDossierSummaryKey(routeSlug: string): string {
  return `studio/v2/routes/${routeSlug}/dossier.json`;
}

export const RouteDossierSeriesPointSchema = Schema.Struct({
  month: MonthSchema,
  value: Schema.NullOr(Schema.Number),
});
export type RouteDossierSeriesPoint = typeof RouteDossierSeriesPointSchema.Type;

export const RouteDossierMetricSummarySchema = Schema.Struct({
  current: Schema.NullOr(Schema.Number),
  /** Percent change vs the value six months before `dataAsOf`; null when either end is missing. */
  movement6mPct: Schema.NullOr(Schema.Number),
  /** Citywide percentile of `current` among routes with the metric; null when unranked. */
  peerPercentile: Schema.NullOr(Schema.Number),
  /** Monthly route-grain series, oldest first, capped at 36 points. */
  sparkline: Schema.Array(RouteDossierSeriesPointSchema).check(Schema.isMaxLength(36)),
  dataAsOf: Schema.NullOr(MonthSchema),
});
export type RouteDossierMetricSummary = typeof RouteDossierMetricSummarySchema.Type;

export const RouteDossierWorstSegmentSchema = Schema.Struct({
  segmentId: Schema.String.check(Schema.isMinLength(1)),
  direction: Schema.String,
  label: Schema.String,
  averageSpeedMph: Schema.NullOr(Schema.Number),
  /** Consecutive trailing months (ending at dataAsOf) this segment was the route's slowest. */
  persistenceMonths: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  dataAsOf: MonthSchema,
});
export type RouteDossierWorstSegment = typeof RouteDossierWorstSegmentSchema.Type;

export const RouteDossierEventSchema = Schema.Struct({
  date: Schema.String,
  kind: Schema.String,
  label: Schema.String,
});
export type RouteDossierEvent = typeof RouteDossierEventSchema.Type;

export const RouteDossierTreatmentPostureSchema = Schema.Struct({
  aceActive: Schema.Boolean,
  aceSince: Schema.NullOr(Schema.String),
  busLaneMatchedLaneCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  /** Most recent intervention events, newest first, capped at 5. */
  latestEvents: Schema.Array(RouteDossierEventSchema).check(Schema.isMaxLength(5)),
  dataAsOf: Schema.NullOr(MonthSchema),
});
export type RouteDossierTreatmentPosture = typeof RouteDossierTreatmentPostureSchema.Type;

/** The authoritative artifact contract — what the pipeline builder emits per route. */
export const RouteDossierSummarySchema = Schema.Struct({
  artifactKind: Schema.Literal("studio_route_dossier_summary"),
  schemaVersion: Schema.Literal(2),
  generatedAt: Schema.String,
  routeId: Schema.String.check(Schema.isMinLength(1)),
  routeSlug: Schema.String.check(Schema.isMinLength(1)),
  releaseId: Schema.String,
  publishedAt: Schema.String,
  coverage: CoverageWindowSchema,
  /** Latest input month across all blocks; the page-level freshness anchor. */
  dataAsOf: Schema.NullOr(MonthSchema),
  speed: RouteDossierMetricSummarySchema,
  ridership: RouteDossierMetricSummarySchema,
  worstSegment: Schema.NullOr(RouteDossierWorstSegmentSchema),
  treatmentPosture: RouteDossierTreatmentPostureSchema,
});
export type RouteDossierSummary = typeof RouteDossierSummarySchema.Type;

/**
 * The light read-schema for the Worker join path — `.passthrough()` so
 * forward-compatible additions never break a deployed Worker.
 */
export const RouteDossierSummaryForDetailSchema = Schema.Struct({
  artifactKind: Schema.Literal("studio_route_dossier_summary"),
  schemaVersion: Schema.Literal(2),
  generatedAt: Schema.String,
  routeId: Schema.String,
  routeSlug: Schema.String,
  releaseId: Schema.String,
  publishedAt: Schema.String,
  coverage: CoverageWindowSchema,
  dataAsOf: Schema.NullOr(MonthSchema),
  speed: RouteDossierMetricSummarySchema,
  ridership: RouteDossierMetricSummarySchema,
  worstSegment: Schema.NullOr(RouteDossierWorstSegmentSchema),
  treatmentPosture: RouteDossierTreatmentPostureSchema,
});
export type RouteDossierSummaryForDetail = typeof RouteDossierSummaryForDetailSchema.Type;
