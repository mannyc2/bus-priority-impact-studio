// Repository functions for the post-v1 corpus-expansion sources.
// One section per source; each section: type, replace-by-scope, list/get reads.
// See knowledge/wiki/analysis/finding_coverage_and_corpus_expansion.md.

import { and, asc, eq } from "drizzle-orm";
import { batchInsert, type LocalPipelineDb } from "../client.js";
import { localBusWaitAssessment } from "../schema.js";

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
