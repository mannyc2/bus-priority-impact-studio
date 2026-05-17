import { asc, eq } from "drizzle-orm";
import { batchInsert, type LocalPipelineDb } from "../client.js";
import {
  localCorridor,
  localCorridorArtifact,
  localCorridorHotspot,
  localCorridorInterventionContext,
  localCorridorMonthSummary,
  localCorridorRouteMember,
} from "../schema.js";

export type LocalCorridor = typeof localCorridor.$inferSelect;
export type LocalCorridorArtifact = typeof localCorridorArtifact.$inferSelect;
export type LocalCorridorRouteMember = typeof localCorridorRouteMember.$inferSelect;
export type LocalCorridorMonthSummary = typeof localCorridorMonthSummary.$inferSelect;
export type LocalCorridorInterventionContext = typeof localCorridorInterventionContext.$inferSelect;
export type LocalCorridorHotspot = typeof localCorridorHotspot.$inferSelect;

export async function replaceCorridorRows(
  db: LocalPipelineDb,
  month: string,
  input: {
    corridors: readonly (typeof localCorridor.$inferInsert)[];
    routeMembers: readonly (typeof localCorridorRouteMember.$inferInsert)[];
    summaries: readonly (typeof localCorridorMonthSummary.$inferInsert)[];
    interventionContexts?: readonly (typeof localCorridorInterventionContext.$inferInsert)[];
    hotspots: readonly (typeof localCorridorHotspot.$inferInsert)[];
  },
): Promise<void> {
  await db.delete(localCorridorHotspot).where(eq(localCorridorHotspot.month, month));
  await db.delete(localCorridorArtifact).where(eq(localCorridorArtifact.month, month));
  await db
    .delete(localCorridorInterventionContext)
    .where(eq(localCorridorInterventionContext.month, month));
  await db.delete(localCorridorMonthSummary).where(eq(localCorridorMonthSummary.month, month));
  await db.delete(localCorridorRouteMember).where(eq(localCorridorRouteMember.month, month));
  await db.delete(localCorridor);

  if (input.corridors.length > 0) {
    await batchInsert(db, localCorridor, [...input.corridors]);
  }
  if (input.routeMembers.length > 0) {
    await batchInsert(db, localCorridorRouteMember, [...input.routeMembers]);
  }
  if (input.summaries.length > 0) {
    await batchInsert(db, localCorridorMonthSummary, [...input.summaries]);
  }
  const interventionContexts = input.interventionContexts ?? [];
  if (interventionContexts.length > 0) {
    await batchInsert(db, localCorridorInterventionContext, [...interventionContexts]);
  }
  if (input.hotspots.length > 0) {
    await batchInsert(db, localCorridorHotspot, [...input.hotspots]);
  }
}

export async function replaceCorridorArtifacts(
  db: LocalPipelineDb,
  month: string,
  rows: readonly (typeof localCorridorArtifact.$inferInsert)[],
): Promise<void> {
  await db.delete(localCorridorArtifact).where(eq(localCorridorArtifact.month, month));
  if (rows.length > 0) {
    await batchInsert(db, localCorridorArtifact, [...rows]);
  }
}

export async function listCorridors(db: LocalPipelineDb): Promise<LocalCorridor[]> {
  return db.select().from(localCorridor).orderBy(asc(localCorridor.corridorId));
}

export async function listCorridorArtifacts(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalCorridorArtifact[]> {
  return db
    .select()
    .from(localCorridorArtifact)
    .where(eq(localCorridorArtifact.month, month))
    .orderBy(asc(localCorridorArtifact.corridorId), asc(localCorridorArtifact.artifactName));
}

export async function listCorridorRouteMembers(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalCorridorRouteMember[]> {
  return db
    .select()
    .from(localCorridorRouteMember)
    .where(eq(localCorridorRouteMember.month, month))
    .orderBy(asc(localCorridorRouteMember.corridorId), asc(localCorridorRouteMember.routeId));
}

export async function listCorridorMonthSummaries(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalCorridorMonthSummary[]> {
  return db
    .select()
    .from(localCorridorMonthSummary)
    .where(eq(localCorridorMonthSummary.month, month))
    .orderBy(asc(localCorridorMonthSummary.corridorId));
}

export async function listCorridorHotspots(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalCorridorHotspot[]> {
  return db
    .select()
    .from(localCorridorHotspot)
    .where(eq(localCorridorHotspot.month, month))
    .orderBy(asc(localCorridorHotspot.corridorId), asc(localCorridorHotspot.corridorHotspotRank));
}

export async function listCorridorInterventionContexts(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalCorridorInterventionContext[]> {
  return db
    .select()
    .from(localCorridorInterventionContext)
    .where(eq(localCorridorInterventionContext.month, month))
    .orderBy(
      asc(localCorridorInterventionContext.corridorId),
      asc(localCorridorInterventionContext.contextRank),
    );
}
