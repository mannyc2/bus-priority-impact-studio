import * as z from "zod";

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

const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

export function routeDossierSummaryKey(routeSlug: string): string {
  return `studio/v2/routes/${routeSlug}/dossier.json`;
}

export const RouteDossierSeriesPointSchema = z
  .object({
    month: MonthSchema,
    value: z.number().nullable(),
  })
  .strict();
export type RouteDossierSeriesPoint = z.output<typeof RouteDossierSeriesPointSchema>;

export const RouteDossierMetricSummarySchema = z
  .object({
    current: z.number().nullable(),
    /** Percent change vs the value six months before `dataAsOf`; null when either end is missing. */
    movement6mPct: z.number().nullable(),
    /** Citywide percentile of `current` among routes with the metric; null when unranked. */
    peerPercentile: z.number().nullable(),
    /** Monthly route-grain series, oldest first, capped at 36 points. */
    sparkline: z.array(RouteDossierSeriesPointSchema).max(36),
    dataAsOf: MonthSchema.nullable(),
  })
  .strict();
export type RouteDossierMetricSummary = z.output<typeof RouteDossierMetricSummarySchema>;

export const RouteDossierWorstSegmentSchema = z
  .object({
    segmentId: z.string().min(1),
    direction: z.string(),
    label: z.string(),
    averageSpeedMph: z.number().nullable(),
    /** Consecutive trailing months (ending at dataAsOf) this segment was the route's slowest. */
    persistenceMonths: z.number().int().positive(),
    dataAsOf: MonthSchema,
  })
  .strict();
export type RouteDossierWorstSegment = z.output<typeof RouteDossierWorstSegmentSchema>;

export const RouteDossierEventSchema = z
  .object({
    date: z.string(),
    kind: z.string(),
    label: z.string(),
  })
  .strict();
export type RouteDossierEvent = z.output<typeof RouteDossierEventSchema>;

export const RouteDossierTreatmentPostureSchema = z
  .object({
    aceActive: z.boolean(),
    aceSince: z.string().nullable(),
    busLaneMatchedLaneCount: z.number().int().nonnegative(),
    /** Most recent intervention events, newest first, capped at 5. */
    latestEvents: z.array(RouteDossierEventSchema).max(5),
    dataAsOf: MonthSchema.nullable(),
  })
  .strict();
export type RouteDossierTreatmentPosture = z.output<typeof RouteDossierTreatmentPostureSchema>;

/** The authoritative artifact contract — what the pipeline builder emits per route. */
export const RouteDossierSummarySchema = z
  .object({
    artifactKind: z.literal("studio_route_dossier_summary"),
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    routeId: z.string().min(1),
    routeSlug: z.string().min(1),
    releaseMonth: MonthSchema,
    /** Latest input month across all blocks; the page-level freshness anchor. */
    dataAsOf: MonthSchema.nullable(),
    speed: RouteDossierMetricSummarySchema,
    ridership: RouteDossierMetricSummarySchema,
    worstSegment: RouteDossierWorstSegmentSchema.nullable(),
    treatmentPosture: RouteDossierTreatmentPostureSchema,
  })
  .strict();
export type RouteDossierSummary = z.output<typeof RouteDossierSummarySchema>;

/**
 * The light read-schema for the Worker join path — `.passthrough()` so
 * forward-compatible additions never break a deployed Worker.
 */
export const RouteDossierSummaryForDetailSchema = z
  .object({
    artifactKind: z.literal("studio_route_dossier_summary"),
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    routeId: z.string(),
    routeSlug: z.string(),
    releaseMonth: MonthSchema,
    dataAsOf: MonthSchema.nullable(),
    speed: RouteDossierMetricSummarySchema.passthrough(),
    ridership: RouteDossierMetricSummarySchema.passthrough(),
    worstSegment: RouteDossierWorstSegmentSchema.passthrough().nullable(),
    treatmentPosture: RouteDossierTreatmentPostureSchema.passthrough(),
  })
  .passthrough();
export type RouteDossierSummaryForDetail = z.output<typeof RouteDossierSummaryForDetailSchema>;
