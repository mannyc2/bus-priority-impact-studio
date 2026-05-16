import { and, asc, eq } from "drizzle-orm";
import { batchInsert, type LocalPipelineDb } from "../client.js";
import {
  localGtfsRtAlert,
  localGtfsRtCollectionRun,
  localGtfsRtFeedSnapshot,
  localGtfsRtParsedSnapshot,
  localGtfsRtStopTimeUpdate,
  localGtfsRtTripUpdate,
  localGtfsRtVehiclePosition,
} from "../schema.js";

export type GtfsRtFeedType = "vehicle_positions" | "trip_updates" | "alerts";
export type LocalGtfsRtCollectionRun = typeof localGtfsRtCollectionRun.$inferSelect;
export type LocalGtfsRtFeedSnapshot = typeof localGtfsRtFeedSnapshot.$inferSelect;
export type LocalGtfsRtParsedSnapshot = typeof localGtfsRtParsedSnapshot.$inferSelect;
export type LocalGtfsRtVehiclePosition = typeof localGtfsRtVehiclePosition.$inferSelect;
export type LocalGtfsRtTripUpdate = typeof localGtfsRtTripUpdate.$inferSelect;
export type LocalGtfsRtStopTimeUpdate = typeof localGtfsRtStopTimeUpdate.$inferSelect;
export type LocalGtfsRtAlert = typeof localGtfsRtAlert.$inferSelect;

export async function insertGtfsRtCollectionRun(
  db: LocalPipelineDb,
  row: typeof localGtfsRtCollectionRun.$inferInsert,
): Promise<void> {
  await db.insert(localGtfsRtCollectionRun).values(row);
}

export async function finishGtfsRtCollectionRun(
  db: LocalPipelineDb,
  runId: string,
  update: Pick<
    typeof localGtfsRtCollectionRun.$inferInsert,
    "endedAt" | "status" | "snapshotCount" | "successCount" | "failureCount"
  > & { error?: string | null },
): Promise<void> {
  await db
    .update(localGtfsRtCollectionRun)
    .set(update)
    .where(eq(localGtfsRtCollectionRun.runId, runId));
}

export async function insertGtfsRtFeedSnapshot(
  db: LocalPipelineDb,
  row: typeof localGtfsRtFeedSnapshot.$inferInsert,
): Promise<void> {
  await db.insert(localGtfsRtFeedSnapshot).values(row);
}

export async function listGtfsRtCollectionRuns(
  db: LocalPipelineDb,
): Promise<LocalGtfsRtCollectionRun[]> {
  return db
    .select()
    .from(localGtfsRtCollectionRun)
    .orderBy(asc(localGtfsRtCollectionRun.startedAt), asc(localGtfsRtCollectionRun.runId));
}

export async function listGtfsRtFeedSnapshots(
  db: LocalPipelineDb,
  runId: string,
): Promise<LocalGtfsRtFeedSnapshot[]> {
  return db
    .select()
    .from(localGtfsRtFeedSnapshot)
    .where(eq(localGtfsRtFeedSnapshot.runId, runId))
    .orderBy(asc(localGtfsRtFeedSnapshot.sampleIndex), asc(localGtfsRtFeedSnapshot.feedType));
}

export async function replaceGtfsRtParsedSnapshot(
  db: LocalPipelineDb,
  input: {
    parsedSnapshot: typeof localGtfsRtParsedSnapshot.$inferInsert;
    vehiclePositions: readonly (typeof localGtfsRtVehiclePosition.$inferInsert)[];
    tripUpdates: readonly (typeof localGtfsRtTripUpdate.$inferInsert)[];
    stopTimeUpdates: readonly (typeof localGtfsRtStopTimeUpdate.$inferInsert)[];
    alerts: readonly (typeof localGtfsRtAlert.$inferInsert)[];
  },
): Promise<void> {
  const { runId, feedType, sampleIndex } = input.parsedSnapshot;
  const snapshotFilter = and(
    eq(localGtfsRtParsedSnapshot.runId, runId),
    eq(localGtfsRtParsedSnapshot.feedType, feedType),
    eq(localGtfsRtParsedSnapshot.sampleIndex, sampleIndex),
  );
  const parsedRowFilter = and(
    eq(localGtfsRtVehiclePosition.runId, runId),
    eq(localGtfsRtVehiclePosition.feedType, feedType),
    eq(localGtfsRtVehiclePosition.sampleIndex, sampleIndex),
  );
  const tripRowFilter = and(
    eq(localGtfsRtTripUpdate.runId, runId),
    eq(localGtfsRtTripUpdate.feedType, feedType),
    eq(localGtfsRtTripUpdate.sampleIndex, sampleIndex),
  );
  const stopRowFilter = and(
    eq(localGtfsRtStopTimeUpdate.runId, runId),
    eq(localGtfsRtStopTimeUpdate.feedType, feedType),
    eq(localGtfsRtStopTimeUpdate.sampleIndex, sampleIndex),
  );
  const alertRowFilter = and(
    eq(localGtfsRtAlert.runId, runId),
    eq(localGtfsRtAlert.feedType, feedType),
    eq(localGtfsRtAlert.sampleIndex, sampleIndex),
  );

  await db.delete(localGtfsRtParsedSnapshot).where(snapshotFilter);
  await db.delete(localGtfsRtVehiclePosition).where(parsedRowFilter);
  await db.delete(localGtfsRtTripUpdate).where(tripRowFilter);
  await db.delete(localGtfsRtStopTimeUpdate).where(stopRowFilter);
  await db.delete(localGtfsRtAlert).where(alertRowFilter);
  await db.insert(localGtfsRtParsedSnapshot).values(input.parsedSnapshot);

  if (input.vehiclePositions.length > 0) {
    await batchInsert(db, localGtfsRtVehiclePosition, [...input.vehiclePositions]);
  }
  if (input.tripUpdates.length > 0) {
    await batchInsert(db, localGtfsRtTripUpdate, [...input.tripUpdates]);
  }
  if (input.stopTimeUpdates.length > 0) {
    await batchInsert(db, localGtfsRtStopTimeUpdate, [...input.stopTimeUpdates]);
  }
  if (input.alerts.length > 0) {
    await batchInsert(db, localGtfsRtAlert, [...input.alerts]);
  }
}

export async function listGtfsRtParsedSnapshots(
  db: LocalPipelineDb,
  runId: string,
): Promise<LocalGtfsRtParsedSnapshot[]> {
  return db
    .select()
    .from(localGtfsRtParsedSnapshot)
    .where(eq(localGtfsRtParsedSnapshot.runId, runId))
    .orderBy(asc(localGtfsRtParsedSnapshot.sampleIndex), asc(localGtfsRtParsedSnapshot.feedType));
}

export async function listGtfsRtVehiclePositions(
  db: LocalPipelineDb,
  runId: string,
): Promise<LocalGtfsRtVehiclePosition[]> {
  return db
    .select()
    .from(localGtfsRtVehiclePosition)
    .where(eq(localGtfsRtVehiclePosition.runId, runId))
    .orderBy(asc(localGtfsRtVehiclePosition.sampleIndex), asc(localGtfsRtVehiclePosition.entityId));
}

export async function listGtfsRtTripUpdates(
  db: LocalPipelineDb,
  runId: string,
): Promise<LocalGtfsRtTripUpdate[]> {
  return db
    .select()
    .from(localGtfsRtTripUpdate)
    .where(eq(localGtfsRtTripUpdate.runId, runId))
    .orderBy(asc(localGtfsRtTripUpdate.sampleIndex), asc(localGtfsRtTripUpdate.entityId));
}

export async function listGtfsRtStopTimeUpdates(
  db: LocalPipelineDb,
  runId: string,
): Promise<LocalGtfsRtStopTimeUpdate[]> {
  return db
    .select()
    .from(localGtfsRtStopTimeUpdate)
    .where(eq(localGtfsRtStopTimeUpdate.runId, runId))
    .orderBy(
      asc(localGtfsRtStopTimeUpdate.sampleIndex),
      asc(localGtfsRtStopTimeUpdate.entityId),
      asc(localGtfsRtStopTimeUpdate.updateRank),
    );
}

export async function listGtfsRtAlerts(
  db: LocalPipelineDb,
  runId: string,
): Promise<LocalGtfsRtAlert[]> {
  return db
    .select()
    .from(localGtfsRtAlert)
    .where(eq(localGtfsRtAlert.runId, runId))
    .orderBy(asc(localGtfsRtAlert.sampleIndex), asc(localGtfsRtAlert.entityId));
}
