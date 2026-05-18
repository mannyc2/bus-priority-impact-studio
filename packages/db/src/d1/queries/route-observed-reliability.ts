import { asc, desc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import { routeObservedReliabilitySummary } from "../schema.js";
import { IsoMonthSchema } from "./shared.js";
import { groupSourceStatuses, listRouteMonthSourceStatuses } from "./source-statuses.js";

const RouteObservedReliabilitySummaryRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    run_id: z.string().min(1),
    reliability_status: z.enum(["observed", "insufficient_gtfs_rt_samples"]),
    min_sample_threshold: z.number().int().nonnegative(),
    sample_count: z.number().int().nonnegative(),
    stop_count: z.number().int().nonnegative(),
    direction_count: z.number().int().nonnegative(),
    average_observed_headway_minutes: z.number().nonnegative().nullable(),
    median_observed_headway_minutes: z.number().nonnegative().nullable(),
    p90_observed_headway_minutes: z.number().nonnegative().nullable(),
    max_observed_headway_minutes: z.number().nonnegative().nullable(),
    scheduled_median_headway_minutes: z.number().nonnegative().nullable(),
    bunching_threshold_minutes: z.number().nonnegative().nullable(),
    long_gap_threshold_minutes: z.number().nonnegative().nullable(),
    observed_bunching_share: z.number().nonnegative().nullable(),
    observed_long_gap_share: z.number().nonnegative().nullable(),
    expected_wait_minutes: z.number().nonnegative().nullable(),
    scheduled_expected_wait_minutes: z.number().nonnegative().nullable(),
    excess_wait_minutes: z.number().nullable(),
    wait_reliability_ratio: z.number().nonnegative().nullable(),
  })
  .strict();

export type RouteObservedReliabilitySummaryRow = z.output<
  typeof RouteObservedReliabilitySummaryRowSchema
>;

export type RouteObservedReliabilitySummary = {
  routeId: string;
  month: string;
  runId: string;
  reliabilityStatus: "observed" | "insufficient_gtfs_rt_samples";
  minSampleThreshold: number;
  sampleCount: number;
  stopCount: number;
  directionCount: number;
  averageObservedHeadwayMinutes: number | null;
  medianObservedHeadwayMinutes: number | null;
  p90ObservedHeadwayMinutes: number | null;
  maxObservedHeadwayMinutes: number | null;
  scheduledMedianHeadwayMinutes: number | null;
  bunchingThresholdMinutes: number | null;
  longGapThresholdMinutes: number | null;
  observedBunchingShare: number | null;
  observedLongGapShare: number | null;
  expectedWaitMinutes: number | null;
  scheduledExpectedWaitMinutes: number | null;
  excessWaitMinutes: number | null;
  waitReliabilityRatio: number | null;
  sourceStatus: Record<string, string>;
};

function key(routeId: string, month: string): string {
  return `${routeId}::${month}`;
}

function toRouteObservedReliabilitySummary(
  row: RouteObservedReliabilitySummaryRow,
  statuses: Map<string, Record<string, string>>,
): RouteObservedReliabilitySummary {
  return {
    routeId: row.route_id,
    month: row.month,
    runId: row.run_id,
    reliabilityStatus: row.reliability_status,
    minSampleThreshold: row.min_sample_threshold,
    sampleCount: row.sample_count,
    stopCount: row.stop_count,
    directionCount: row.direction_count,
    averageObservedHeadwayMinutes: row.average_observed_headway_minutes,
    medianObservedHeadwayMinutes: row.median_observed_headway_minutes,
    p90ObservedHeadwayMinutes: row.p90_observed_headway_minutes,
    maxObservedHeadwayMinutes: row.max_observed_headway_minutes,
    scheduledMedianHeadwayMinutes: row.scheduled_median_headway_minutes,
    bunchingThresholdMinutes: row.bunching_threshold_minutes,
    longGapThresholdMinutes: row.long_gap_threshold_minutes,
    observedBunchingShare: row.observed_bunching_share,
    observedLongGapShare: row.observed_long_gap_share,
    expectedWaitMinutes: row.expected_wait_minutes,
    scheduledExpectedWaitMinutes: row.scheduled_expected_wait_minutes,
    excessWaitMinutes: row.excess_wait_minutes,
    waitReliabilityRatio: row.wait_reliability_ratio,
    sourceStatus: statuses.get(key(row.route_id, row.month)) ?? {},
  };
}

export async function listRouteObservedReliabilitySummaries(
  db: D1ServingDb,
  month: string,
): Promise<RouteObservedReliabilitySummary[]> {
  const rows = await db
    .select({
      route_id: routeObservedReliabilitySummary.routeId,
      month: routeObservedReliabilitySummary.month,
      run_id: routeObservedReliabilitySummary.runId,
      reliability_status: routeObservedReliabilitySummary.reliabilityStatus,
      min_sample_threshold: routeObservedReliabilitySummary.minSampleThreshold,
      sample_count: routeObservedReliabilitySummary.sampleCount,
      stop_count: routeObservedReliabilitySummary.stopCount,
      direction_count: routeObservedReliabilitySummary.directionCount,
      average_observed_headway_minutes:
        routeObservedReliabilitySummary.averageObservedHeadwayMinutes,
      median_observed_headway_minutes: routeObservedReliabilitySummary.medianObservedHeadwayMinutes,
      p90_observed_headway_minutes: routeObservedReliabilitySummary.p90ObservedHeadwayMinutes,
      max_observed_headway_minutes: routeObservedReliabilitySummary.maxObservedHeadwayMinutes,
      scheduled_median_headway_minutes:
        routeObservedReliabilitySummary.scheduledMedianHeadwayMinutes,
      bunching_threshold_minutes: routeObservedReliabilitySummary.bunchingThresholdMinutes,
      long_gap_threshold_minutes: routeObservedReliabilitySummary.longGapThresholdMinutes,
      observed_bunching_share: routeObservedReliabilitySummary.observedBunchingShare,
      observed_long_gap_share: routeObservedReliabilitySummary.observedLongGapShare,
      expected_wait_minutes: routeObservedReliabilitySummary.expectedWaitMinutes,
      scheduled_expected_wait_minutes: routeObservedReliabilitySummary.scheduledExpectedWaitMinutes,
      excess_wait_minutes: routeObservedReliabilitySummary.excessWaitMinutes,
      wait_reliability_ratio: routeObservedReliabilitySummary.waitReliabilityRatio,
    })
    .from(routeObservedReliabilitySummary)
    .where(eq(routeObservedReliabilitySummary.month, month))
    .orderBy(
      asc(routeObservedReliabilitySummary.routeId),
      asc(routeObservedReliabilitySummary.runId),
    );

  const parsedRows = rows.map((row) => RouteObservedReliabilitySummaryRowSchema.parse(row));
  const statuses = groupSourceStatuses(
    await listRouteMonthSourceStatuses(db, month, "reliability"),
  );

  return parsedRows.map((row) => toRouteObservedReliabilitySummary(row, statuses));
}

export async function findLatestNonBaselineObservedMonth(
  db: D1ServingDb,
  baselineMonth: string,
): Promise<string | null> {
  const rows = await db
    .select()
    .from(routeObservedReliabilitySummary)
    .orderBy(desc(routeObservedReliabilitySummary.month));
  for (const row of rows) {
    if (row.month !== baselineMonth) {
      return row.month;
    }
  }
  return null;
}
