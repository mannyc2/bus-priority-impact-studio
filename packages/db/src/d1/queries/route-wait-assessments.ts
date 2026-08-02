import { asc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { routeWaitAssessment } from "../schema.js";

async function selectRouteWaitAssessmentRows(db: D1ServingDb, routeId: string) {
  return db
    .select({
      routeId: routeWaitAssessment.routeId,
      month: routeWaitAssessment.month,
      assessmentRowCount: routeWaitAssessment.assessmentRowCount,
      tripsPassingWait: routeWaitAssessment.tripsPassingWait,
      scheduledTrips: routeWaitAssessment.scheduledTrips,
      waitAssessment: routeWaitAssessment.waitAssessment,
    })
    .from(routeWaitAssessment)
    .where(eq(routeWaitAssessment.routeId, routeId))
    .orderBy(asc(routeWaitAssessment.month));
}

export type RouteWaitAssessment = Awaited<ReturnType<typeof selectRouteWaitAssessmentRows>>[number];

export function listRouteWaitAssessments(
  db: D1ServingDb,
  routeId: string,
): Promise<RouteWaitAssessment[]> {
  return selectRouteWaitAssessmentRows(db, routeId);
}
