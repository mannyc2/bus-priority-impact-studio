import { asc, eq } from "drizzle-orm";
import { batchInsert, type LocalPipelineDb } from "../client.js";
import { localObservedHeadwaySample, localObservedVehicleStopEvent } from "../schema.js";

export type LocalObservedVehicleStopEvent = typeof localObservedVehicleStopEvent.$inferSelect;
export type LocalObservedHeadwaySample = typeof localObservedHeadwaySample.$inferSelect;

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
