import { and, asc, eq, inArray } from "drizzle-orm";
import { insertAll, type LocalPipelineDb } from "../client.js";
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

export function replaceObservedHeadwayRows(
  db: LocalPipelineDb,
  runId: string,
  input: {
    stopEvents: readonly (typeof localObservedVehicleStopEvent.$inferInsert)[];
    headwaySamples: readonly (typeof localObservedHeadwaySample.$inferInsert)[];
  },
): void {
  db.transaction((tx) => {
    tx.delete(localObservedHeadwaySample).where(eq(localObservedHeadwaySample.runId, runId)).run();
    tx
      .delete(localObservedVehicleStopEvent)
      .where(eq(localObservedVehicleStopEvent.runId, runId))
      .run();

    insertAll(tx, localObservedVehicleStopEvent, [...input.stopEvents]);
    insertAll(tx, localObservedHeadwaySample, [...input.headwaySamples]);
  });
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

export function replaceRouteObservedReliabilityRows(
  db: LocalPipelineDb,
  month: string,
  runId: string,
  input: {
    summaries: readonly (typeof localRouteObservedReliabilitySummary.$inferInsert)[];
    sourceStatuses: readonly (typeof localRouteMonthSourceStatus.$inferInsert)[];
  },
): void {
  for (const row of input.summaries) {
    if (row.month !== month || row.runId !== runId) {
      throw new Error(
        `replaceRouteObservedReliabilityRows: summary row (month=${row.month}, runId=${row.runId}) does not match scope (month=${month}, runId=${runId})`,
      );
    }
  }
  for (const row of input.sourceStatuses) {
    if (row.month !== month) {
      throw new Error(
        `replaceRouteObservedReliabilityRows: sourceStatus row (month=${row.month}) does not match scope (month=${month})`,
      );
    }
  }

  db.transaction((tx) => {
    tx
      .delete(localRouteObservedReliabilitySummary)
      .where(
        and(
          eq(localRouteObservedReliabilitySummary.month, month),
          eq(localRouteObservedReliabilitySummary.runId, runId),
        ),
      )
      .run();
    tx
      .delete(localRouteMonthSourceStatus)
      .where(
        and(
          eq(localRouteMonthSourceStatus.month, month),
          eq(localRouteMonthSourceStatus.sourceScope, "reliability"),
          inArray(localRouteMonthSourceStatus.sourceId, observedReliabilitySourceIds),
        ),
      )
      .run();

    insertAll(tx, localRouteObservedReliabilitySummary, [...input.summaries]);
    insertAll(tx, localRouteMonthSourceStatus, [...input.sourceStatuses]);
  });
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
