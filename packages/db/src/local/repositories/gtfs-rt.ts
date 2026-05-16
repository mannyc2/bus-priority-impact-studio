import { asc, eq } from "drizzle-orm";
import type { LocalPipelineDb } from "../client.js";
import { localGtfsRtCollectionRun, localGtfsRtFeedSnapshot } from "../schema.js";

export type GtfsRtFeedType = "vehicle_positions" | "trip_updates" | "alerts";
export type LocalGtfsRtCollectionRun = typeof localGtfsRtCollectionRun.$inferSelect;
export type LocalGtfsRtFeedSnapshot = typeof localGtfsRtFeedSnapshot.$inferSelect;

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
