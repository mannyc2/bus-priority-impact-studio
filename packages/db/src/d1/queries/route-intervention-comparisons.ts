import { asc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { interventionEvent, routeInterventionComparison } from "../schema.js";

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

const routeInterventionComparisonSelect = {
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
  comparison_post_average_speed_mph: routeInterventionComparison.comparisonPostAverageSpeedMph,
  comparison_speed_delta_mph: routeInterventionComparison.comparisonSpeedDeltaMph,
  adjusted_speed_delta_mph: routeInterventionComparison.adjustedSpeedDeltaMph,
  comparison_pre_average_monthly_ridership:
    routeInterventionComparison.comparisonPreAverageMonthlyRidership,
  comparison_post_average_monthly_ridership:
    routeInterventionComparison.comparisonPostAverageMonthlyRidership,
  comparison_ridership_delta: routeInterventionComparison.comparisonRidershipDelta,
  adjusted_ridership_delta: routeInterventionComparison.adjustedRidershipDelta,
  caveat: routeInterventionComparison.caveat,
};

const interventionEventSelect = {
  event_id: interventionEvent.eventId,
  route_id: interventionEvent.routeId,
  intervention_type: interventionEvent.interventionType,
  source_id: interventionEvent.sourceId,
  program: interventionEvent.program,
  implementation_date: interventionEvent.implementationDate,
  implementation_month: interventionEvent.implementationMonth,
  event_status: interventionEvent.eventStatus,
  description: interventionEvent.description,
};

async function selectRouteInterventionComparisonRows(db: D1ServingDb, month: string) {
  return db
    .select(routeInterventionComparisonSelect)
    .from(routeInterventionComparison)
    .where(eq(routeInterventionComparison.month, month))
    .orderBy(asc(routeInterventionComparison.routeId), asc(routeInterventionComparison.eventId));
}

async function selectInterventionEventRows(db: D1ServingDb) {
  return db
    .select(interventionEventSelect)
    .from(interventionEvent)
    .orderBy(asc(interventionEvent.routeId), asc(interventionEvent.implementationDate));
}

export type InterventionEventRow = Awaited<ReturnType<typeof selectInterventionEventRows>>[number];
export type RouteInterventionComparisonRow = Awaited<
  ReturnType<typeof selectRouteInterventionComparisonRows>
>[number];

function parseComparisonRouteIds(row: RouteInterventionComparisonRow): string[] | null {
  const value = row.comparison_route_ids;
  if (value === null) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // fall through to the skip log below
  }

  console.error("Skipping route_intervention_comparison row with invalid comparison_route_ids.", {
    routeId: row.route_id,
    month: row.month,
    eventId: row.event_id,
  });
  return null;
}

function toRouteInterventionComparison(
  row: RouteInterventionComparisonRow,
  event: InterventionEventRow,
): RouteInterventionComparison | null {
  const comparisonRouteIds = parseComparisonRouteIds(row);
  if (comparisonRouteIds === null) return null;

  return {
    routeId: row.route_id,
    month: row.month,
    eventId: row.event_id,
    interventionType: row.intervention_type,
    sourceId: row.source_id,
    program: event.program,
    implementationDate: event.implementation_date,
    implementationMonth: event.implementation_month,
    eventStatus: event.event_status as RouteInterventionComparison["eventStatus"],
    description: event.description,
    evaluationLevel: row.evaluation_level as RouteInterventionComparison["evaluationLevel"],
    comparisonStatus: row.comparison_status as RouteInterventionComparison["comparisonStatus"],
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
    comparisonRouteIds,
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
    selectRouteInterventionComparisonRows(db, month),
    selectInterventionEventRows(db),
  ]);
  const eventsById = new Map(eventRows.map((row) => [row.event_id, row]));

  return comparisonRows.flatMap((comparison) => {
    const event = eventsById.get(comparison.event_id);
    if (event === undefined) {
      throw new Error(`Missing intervention event row for ${comparison.event_id}`);
    }

    const view = toRouteInterventionComparison(comparison, event);
    return view === null ? [] : [view];
  });
}
