// Repository functions for the post-v1 corpus-expansion sources.
// One section per source; each section: type, replace-by-scope, list/get reads.
// See knowledge/wiki/analysis/finding_coverage_and_corpus_expansion.md.

import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { batchInsert, type LocalPipelineDb } from "../client.js";
import { localBusWaitAssessment, localDotTrafficSpeed } from "../schema.js";

// =========================================================================
// MTA Bus Wait Assessment (Socrata v4z4-2h6n)
// Source #1 of the Tier 1 expansion queue. Monthly route-level wait
// assessment, used to cross-check GTFS-RT-derived reliability.
// =========================================================================

export type LocalBusWaitAssessment = {
  month: string;
  routeId: string;
  borough: string;
  dayType: number;
  tripType: string;
  period: string;
  tripsPassingWait: number;
  scheduledTrips: number;
  waitAssessment: number | null;
};

export async function replaceBusWaitAssessmentRows(
  db: LocalPipelineDb,
  month: string,
  rows: readonly LocalBusWaitAssessment[],
): Promise<void> {
  for (const row of rows) {
    if (row.month !== month) {
      throw new Error(
        `replaceBusWaitAssessmentRows: row month ${row.month} does not match scope ${month}.`,
      );
    }
  }

  await db.delete(localBusWaitAssessment).where(eq(localBusWaitAssessment.month, month));

  if (rows.length === 0) return;

  await batchInsert(db, localBusWaitAssessment, [...rows]);
}

export async function listBusWaitAssessmentRowsForMonth(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalBusWaitAssessment[]> {
  return db
    .select()
    .from(localBusWaitAssessment)
    .where(eq(localBusWaitAssessment.month, month))
    .orderBy(
      asc(localBusWaitAssessment.routeId),
      asc(localBusWaitAssessment.dayType),
      asc(localBusWaitAssessment.tripType),
      asc(localBusWaitAssessment.period),
    );
}

export async function listBusWaitAssessmentRowsForRoute(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
): Promise<LocalBusWaitAssessment[]> {
  return db
    .select()
    .from(localBusWaitAssessment)
    .where(
      and(
        eq(localBusWaitAssessment.routeId, routeId),
        eq(localBusWaitAssessment.month, month),
      ),
    )
    .orderBy(
      asc(localBusWaitAssessment.dayType),
      asc(localBusWaitAssessment.tripType),
      asc(localBusWaitAssessment.period),
    );
}

// =========================================================================
// NYC DOT Real-Time Traffic Speeds (Socrata i4gi-tjb9)
// Source #2 of the Tier 1 expansion queue. Real-time per-link speed and
// travel-time snapshots. Each ingest call captures one snapshot keyed on
// (linkId, sampledAt). For longitudinal context, run the ingest periodically.
// =========================================================================

export type LocalDotTrafficSpeed = {
  linkId: string;
  sampledAt: string;
  speed: number | null;
  travelTime: number | null;
  statusCode: string;
  owner: string | null;
  borough: string | null;
  linkName: string | null;
  linkPoints: string | null;
  transcomId: string | null;
};

export async function insertDotTrafficSpeedSnapshot(
  db: LocalPipelineDb,
  rows: readonly LocalDotTrafficSpeed[],
): Promise<void> {
  if (rows.length === 0) return;
  // Per-link (linkId, sampledAt) is unique; re-running with overlapping windows
  // would otherwise PK-conflict. Update on conflict so the latest snapshot wins.
  await db
    .insert(localDotTrafficSpeed)
    .values([...rows])
    .onConflictDoUpdate({
      target: [localDotTrafficSpeed.linkId, localDotTrafficSpeed.sampledAt],
      set: {
        speed: sql`excluded.speed`,
        travelTime: sql`excluded.travel_time`,
        statusCode: sql`excluded.status_code`,
        owner: sql`excluded.owner`,
        borough: sql`excluded.borough`,
        linkName: sql`excluded.link_name`,
        linkPoints: sql`excluded.link_points`,
        transcomId: sql`excluded.transcom_id`,
      },
    });
}

export async function listLatestDotTrafficSpeeds(
  db: LocalPipelineDb,
  limit = 100,
): Promise<LocalDotTrafficSpeed[]> {
  return db
    .select()
    .from(localDotTrafficSpeed)
    .orderBy(desc(localDotTrafficSpeed.sampledAt), asc(localDotTrafficSpeed.linkId))
    .limit(limit);
}

export async function listDotTrafficSpeedsForLink(
  db: LocalPipelineDb,
  linkId: string,
  sampledAtFrom?: string,
): Promise<LocalDotTrafficSpeed[]> {
  const condition =
    sampledAtFrom === undefined
      ? eq(localDotTrafficSpeed.linkId, linkId)
      : and(
          eq(localDotTrafficSpeed.linkId, linkId),
          gte(localDotTrafficSpeed.sampledAt, sampledAtFrom),
        );
  return db
    .select()
    .from(localDotTrafficSpeed)
    .where(condition)
    .orderBy(asc(localDotTrafficSpeed.sampledAt));
}
