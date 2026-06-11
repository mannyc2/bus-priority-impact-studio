import { asc, eq } from "drizzle-orm";
import { insertAll, type LocalPipelineDb } from "../client.js";
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

export function replaceCorridorRows(
  db: LocalPipelineDb,
  month: string,
  input: {
    corridors: readonly (typeof localCorridor.$inferInsert)[];
    routeMembers: readonly (typeof localCorridorRouteMember.$inferInsert)[];
    summaries: readonly (typeof localCorridorMonthSummary.$inferInsert)[];
    interventionContexts?: readonly (typeof localCorridorInterventionContext.$inferInsert)[];
    hotspots: readonly (typeof localCorridorHotspot.$inferInsert)[];
  },
): void {
  db.transaction((tx) => {
    tx.delete(localCorridorHotspot).where(eq(localCorridorHotspot.month, month)).run();
    tx.delete(localCorridorArtifact).where(eq(localCorridorArtifact.month, month)).run();
    tx
      .delete(localCorridorInterventionContext)
      .where(eq(localCorridorInterventionContext.month, month))
      .run();
    tx.delete(localCorridorMonthSummary).where(eq(localCorridorMonthSummary.month, month)).run();
    tx.delete(localCorridorRouteMember).where(eq(localCorridorRouteMember.month, month)).run();
    tx.delete(localCorridor).run();

    insertAll(tx, localCorridor, [...input.corridors]);
    insertAll(tx, localCorridorRouteMember, [...input.routeMembers]);
    insertAll(tx, localCorridorMonthSummary, [...input.summaries]);
    insertAll(tx, localCorridorInterventionContext, [...(input.interventionContexts ?? [])]);
    insertAll(tx, localCorridorHotspot, [...input.hotspots]);
  });
}

export function replaceCorridorArtifacts(
  db: LocalPipelineDb,
  month: string,
  rows: readonly (typeof localCorridorArtifact.$inferInsert)[],
): void {
  db.transaction((tx) => {
    tx.delete(localCorridorArtifact).where(eq(localCorridorArtifact.month, month)).run();
    insertAll(tx, localCorridorArtifact, [...rows]);
  });
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
