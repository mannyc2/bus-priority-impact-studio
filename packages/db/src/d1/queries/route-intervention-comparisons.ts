import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import { interventionEvent, routeInterventionComparison } from "../schema.js";
import { IsoMonthSchema } from "./shared.js";

const InterventionEventRowSchema = z
  .object({
    event_id: z.string().min(1),
    route_id: z.string().min(1),
    intervention_type: z.string().min(1),
    source_id: z.string().min(1),
    program: z.string().min(1),
    implementation_date: z.string().min(1),
    implementation_month: IsoMonthSchema,
    event_status: z.enum(["implemented", "future", "source_gap"]),
    description: z.string().min(1),
  })
  .strict();

const RouteInterventionComparisonRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    event_id: z.string().min(1),
    intervention_type: z.string().min(1),
    source_id: z.string().min(1),
    evaluation_level: z.enum([
      "descriptive_before_after",
      "peer_adjusted_before_after",
      "insufficient_trend_data",
      "not_evaluated_future",
      "not_evaluated_source_gap",
    ]),
    comparison_status: z.enum([
      "evaluated",
      "future_intervention",
      "insufficient_pre_data",
      "insufficient_post_data",
      "source_gap_missing_implementation_date",
    ]),
    pre_start_month: IsoMonthSchema.nullable(),
    pre_end_month: IsoMonthSchema.nullable(),
    post_start_month: IsoMonthSchema.nullable(),
    post_end_month: IsoMonthSchema.nullable(),
    requested_pre_month_count: z.number().int().nonnegative(),
    requested_post_month_count: z.number().int().nonnegative(),
    pre_sample_month_count: z.number().int().nonnegative(),
    post_sample_month_count: z.number().int().nonnegative(),
    pre_speed_observation_count: z.number().int().nonnegative(),
    post_speed_observation_count: z.number().int().nonnegative(),
    pre_average_speed_mph: z.number().nonnegative().nullable(),
    post_average_speed_mph: z.number().nonnegative().nullable(),
    speed_delta_mph: z.number().nullable(),
    pre_average_monthly_ridership: z.number().nonnegative().nullable(),
    post_average_monthly_ridership: z.number().nonnegative().nullable(),
    ridership_delta: z.number().nullable(),
    comparison_route_count: z.number().int().nonnegative(),
    comparison_route_ids: z.string().nullable(),
    comparison_pre_average_speed_mph: z.number().nonnegative().nullable(),
    comparison_post_average_speed_mph: z.number().nonnegative().nullable(),
    comparison_speed_delta_mph: z.number().nullable(),
    adjusted_speed_delta_mph: z.number().nullable(),
    comparison_pre_average_monthly_ridership: z.number().nonnegative().nullable(),
    comparison_post_average_monthly_ridership: z.number().nonnegative().nullable(),
    comparison_ridership_delta: z.number().nullable(),
    adjusted_ridership_delta: z.number().nullable(),
    caveat: z.string().min(1),
  })
  .strict();

export type InterventionEventRow = z.output<typeof InterventionEventRowSchema>;
export type RouteInterventionComparisonRow = z.output<typeof RouteInterventionComparisonRowSchema>;

export type RouteInterventionComparison = {
  routeId: string;
  month: string;
  eventId: string;
  interventionType: string;
  sourceId: string;
  program: string;
  implementationDate: string;
  implementationMonth: string;
  eventStatus: "implemented" | "future" | "source_gap";
  description: string;
  evaluationLevel:
    | "descriptive_before_after"
    | "peer_adjusted_before_after"
    | "insufficient_trend_data"
    | "not_evaluated_future"
    | "not_evaluated_source_gap";
  comparisonStatus:
    | "evaluated"
    | "future_intervention"
    | "insufficient_pre_data"
    | "insufficient_post_data"
    | "source_gap_missing_implementation_date";
  preStartMonth: string | null;
  preEndMonth: string | null;
  postStartMonth: string | null;
  postEndMonth: string | null;
  requestedPreMonthCount: number;
  requestedPostMonthCount: number;
  preSampleMonthCount: number;
  postSampleMonthCount: number;
  preSpeedObservationCount: number;
  postSpeedObservationCount: number;
  preAverageSpeedMph: number | null;
  postAverageSpeedMph: number | null;
  speedDeltaMph: number | null;
  preAverageMonthlyRidership: number | null;
  postAverageMonthlyRidership: number | null;
  ridershipDelta: number | null;
  comparisonRouteCount: number;
  comparisonRouteIds: string[];
  comparisonPreAverageSpeedMph: number | null;
  comparisonPostAverageSpeedMph: number | null;
  comparisonSpeedDeltaMph: number | null;
  adjustedSpeedDeltaMph: number | null;
  comparisonPreAverageMonthlyRidership: number | null;
  comparisonPostAverageMonthlyRidership: number | null;
  comparisonRidershipDelta: number | null;
  adjustedRidershipDelta: number | null;
  caveat: string;
};

function parseComparisonRouteIds(value: string | null): string[] {
  if (value === null) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Invalid intervention comparison route ID payload");
  }

  return parsed;
}

function toRouteInterventionComparison(
  row: RouteInterventionComparisonRow,
  event: InterventionEventRow,
): RouteInterventionComparison {
  return {
    routeId: row.route_id,
    month: row.month,
    eventId: row.event_id,
    interventionType: row.intervention_type,
    sourceId: row.source_id,
    program: event.program,
    implementationDate: event.implementation_date,
    implementationMonth: event.implementation_month,
    eventStatus: event.event_status,
    description: event.description,
    evaluationLevel: row.evaluation_level,
    comparisonStatus: row.comparison_status,
    preStartMonth: row.pre_start_month,
    preEndMonth: row.pre_end_month,
    postStartMonth: row.post_start_month,
    postEndMonth: row.post_end_month,
    requestedPreMonthCount: row.requested_pre_month_count,
    requestedPostMonthCount: row.requested_post_month_count,
    preSampleMonthCount: row.pre_sample_month_count,
    postSampleMonthCount: row.post_sample_month_count,
    preSpeedObservationCount: row.pre_speed_observation_count,
    postSpeedObservationCount: row.post_speed_observation_count,
    preAverageSpeedMph: row.pre_average_speed_mph,
    postAverageSpeedMph: row.post_average_speed_mph,
    speedDeltaMph: row.speed_delta_mph,
    preAverageMonthlyRidership: row.pre_average_monthly_ridership,
    postAverageMonthlyRidership: row.post_average_monthly_ridership,
    ridershipDelta: row.ridership_delta,
    comparisonRouteCount: row.comparison_route_count,
    comparisonRouteIds: parseComparisonRouteIds(row.comparison_route_ids),
    comparisonPreAverageSpeedMph: row.comparison_pre_average_speed_mph,
    comparisonPostAverageSpeedMph: row.comparison_post_average_speed_mph,
    comparisonSpeedDeltaMph: row.comparison_speed_delta_mph,
    adjustedSpeedDeltaMph: row.adjusted_speed_delta_mph,
    comparisonPreAverageMonthlyRidership: row.comparison_pre_average_monthly_ridership,
    comparisonPostAverageMonthlyRidership: row.comparison_post_average_monthly_ridership,
    comparisonRidershipDelta: row.comparison_ridership_delta,
    adjustedRidershipDelta: row.adjusted_ridership_delta,
    caveat: row.caveat,
  };
}

export async function listRouteInterventionComparisons(
  db: D1ServingDb,
  month: string,
): Promise<RouteInterventionComparison[]> {
  const [comparisonRows, eventRows] = await Promise.all([
    db
      .select({
        route_id: routeInterventionComparison.routeId,
        month: routeInterventionComparison.month,
        event_id: routeInterventionComparison.eventId,
        intervention_type: routeInterventionComparison.interventionType,
        source_id: routeInterventionComparison.sourceId,
        evaluation_level: routeInterventionComparison.evaluationLevel,
        comparison_status: routeInterventionComparison.comparisonStatus,
        pre_start_month: routeInterventionComparison.preStartMonth,
        pre_end_month: routeInterventionComparison.preEndMonth,
        post_start_month: routeInterventionComparison.postStartMonth,
        post_end_month: routeInterventionComparison.postEndMonth,
        requested_pre_month_count: routeInterventionComparison.requestedPreMonthCount,
        requested_post_month_count: routeInterventionComparison.requestedPostMonthCount,
        pre_sample_month_count: routeInterventionComparison.preSampleMonthCount,
        post_sample_month_count: routeInterventionComparison.postSampleMonthCount,
        pre_speed_observation_count: routeInterventionComparison.preSpeedObservationCount,
        post_speed_observation_count: routeInterventionComparison.postSpeedObservationCount,
        pre_average_speed_mph: routeInterventionComparison.preAverageSpeedMph,
        post_average_speed_mph: routeInterventionComparison.postAverageSpeedMph,
        speed_delta_mph: routeInterventionComparison.speedDeltaMph,
        pre_average_monthly_ridership: routeInterventionComparison.preAverageMonthlyRidership,
        post_average_monthly_ridership: routeInterventionComparison.postAverageMonthlyRidership,
        ridership_delta: routeInterventionComparison.ridershipDelta,
        comparison_route_count: routeInterventionComparison.comparisonRouteCount,
        comparison_route_ids: routeInterventionComparison.comparisonRouteIds,
        comparison_pre_average_speed_mph: routeInterventionComparison.comparisonPreAverageSpeedMph,
        comparison_post_average_speed_mph:
          routeInterventionComparison.comparisonPostAverageSpeedMph,
        comparison_speed_delta_mph: routeInterventionComparison.comparisonSpeedDeltaMph,
        adjusted_speed_delta_mph: routeInterventionComparison.adjustedSpeedDeltaMph,
        comparison_pre_average_monthly_ridership:
          routeInterventionComparison.comparisonPreAverageMonthlyRidership,
        comparison_post_average_monthly_ridership:
          routeInterventionComparison.comparisonPostAverageMonthlyRidership,
        comparison_ridership_delta: routeInterventionComparison.comparisonRidershipDelta,
        adjusted_ridership_delta: routeInterventionComparison.adjustedRidershipDelta,
        caveat: routeInterventionComparison.caveat,
      })
      .from(routeInterventionComparison)
      .where(eq(routeInterventionComparison.month, month))
      .orderBy(asc(routeInterventionComparison.routeId), asc(routeInterventionComparison.eventId)),
    db
      .select({
        event_id: interventionEvent.eventId,
        route_id: interventionEvent.routeId,
        intervention_type: interventionEvent.interventionType,
        source_id: interventionEvent.sourceId,
        program: interventionEvent.program,
        implementation_date: interventionEvent.implementationDate,
        implementation_month: interventionEvent.implementationMonth,
        event_status: interventionEvent.eventStatus,
        description: interventionEvent.description,
      })
      .from(interventionEvent)
      .orderBy(asc(interventionEvent.routeId), asc(interventionEvent.implementationDate)),
  ]);
  const eventsById = new Map(
    eventRows.map((row) => {
      const parsed = InterventionEventRowSchema.parse(row);
      return [parsed.event_id, parsed];
    }),
  );

  return comparisonRows.map((row) => {
    const comparison = RouteInterventionComparisonRowSchema.parse(row);
    const event = eventsById.get(comparison.event_id);
    if (event === undefined) {
      throw new Error(`Missing intervention event row for ${comparison.event_id}`);
    }

    return toRouteInterventionComparison(comparison, event);
  });
}
