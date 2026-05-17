import { and, asc, eq, inArray } from "drizzle-orm";
import { batchInsert, type LocalPipelineDb } from "../client.js";
import {
  localObservedHeadwaySample,
  localObservedVehicleStopEvent,
  localRouteMonthSourceStatus,
  localRouteObservedReliabilitySummary,
} from "../schema.js";

export type LocalObservedVehicleStopEvent = typeof localObservedVehicleStopEvent.$inferSelect;
export type LocalObservedHeadwaySample = typeof localObservedHeadwaySample.$inferSelect;
export type LocalRouteObservedReliabilitySummary =
  typeof localRouteObservedReliabilitySummary.$inferSelect;

export async function replaceObservedHeadwayRows(
  db: LocalPipelineDb,
  runId: string,
  input: {
    stopEvents: readonly (typeof localObservedVehicleStopEvent.$inferInsert)[];
    headwaySamples: readonly (typeof localObservedHeadwaySample.$inferInsert)[];
  },
): Promise<void> {
  await db.delete(localObservedHeadwaySample).where(eq(localObservedHeadwaySample.runId, runId));
  await db
    .delete(localObservedVehicleStopEvent)
    .where(eq(localObservedVehicleStopEvent.runId, runId));

  if (input.stopEvents.length > 0) {
    await batchInsert(db, localObservedVehicleStopEvent, [...input.stopEvents]);
  }
  if (input.headwaySamples.length > 0) {
    await batchInsert(db, localObservedHeadwaySample, [...input.headwaySamples]);
  }
}

export async function listObservedVehicleStopEvents(
  db: LocalPipelineDb,
  runId: string,
): Promise<LocalObservedVehicleStopEvent[]> {
  return db
    .select()
    .from(localObservedVehicleStopEvent)
    .where(eq(localObservedVehicleStopEvent.runId, runId))
    .orderBy(asc(localObservedVehicleStopEvent.eventRank));
}

export async function listObservedHeadwaySamples(
  db: LocalPipelineDb,
  runId: string,
): Promise<LocalObservedHeadwaySample[]> {
  return db
    .select()
    .from(localObservedHeadwaySample)
    .where(eq(localObservedHeadwaySample.runId, runId))
    .orderBy(asc(localObservedHeadwaySample.sampleRank));
}

const observedReliabilitySourceIds = ["observedHeadways", "bunching", "waitTimeReliability"];

export async function replaceRouteObservedReliabilityRows(
  db: LocalPipelineDb,
  month: string,
  _runId: string,
  input: {
    summaries: readonly (typeof localRouteObservedReliabilitySummary.$inferInsert)[];
    sourceStatuses: readonly (typeof localRouteMonthSourceStatus.$inferInsert)[];
  },
): Promise<void> {
  await db
    .delete(localRouteObservedReliabilitySummary)
    .where(eq(localRouteObservedReliabilitySummary.month, month));
  await db
    .delete(localRouteMonthSourceStatus)
    .where(
      and(
        eq(localRouteMonthSourceStatus.month, month),
        eq(localRouteMonthSourceStatus.sourceScope, "reliability"),
        inArray(localRouteMonthSourceStatus.sourceId, observedReliabilitySourceIds),
      ),
    );

  if (input.summaries.length > 0) {
    await batchInsert(db, localRouteObservedReliabilitySummary, [...input.summaries]);
  }
  if (input.sourceStatuses.length > 0) {
    await batchInsert(db, localRouteMonthSourceStatus, [...input.sourceStatuses]);
  }
}

export async function listRouteObservedReliabilitySummaries(
  db: LocalPipelineDb,
  month: string,
  runId?: string,
): Promise<LocalRouteObservedReliabilitySummary[]> {
  const whereClause =
    runId === undefined
      ? eq(localRouteObservedReliabilitySummary.month, month)
      : and(
          eq(localRouteObservedReliabilitySummary.month, month),
          eq(localRouteObservedReliabilitySummary.runId, runId),
        );

  return db
    .select()
    .from(localRouteObservedReliabilitySummary)
    .where(whereClause)
    .orderBy(
      asc(localRouteObservedReliabilitySummary.routeId),
      asc(localRouteObservedReliabilitySummary.runId),
    );
}
