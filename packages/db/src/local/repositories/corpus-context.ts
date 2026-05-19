// Repository functions for the post-v1 corpus-expansion sources.
// One section per source; each section: type, replace-by-scope, list/get reads.
// See knowledge/wiki/analysis/finding_coverage_and_corpus_expansion.md.

import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { batchInsert, type LocalPipelineDb } from "../client.js";
import {
  local311ServiceRequest,
  localBusWaitAssessment,
  localDotStreetPermit,
  localDotTrafficSpeed,
  localDotTrafficVolumeCount,
  localLionSegment,
  localNypdCollision,
  localParkingViolation,
} from "../schema.js";

const UPSERT_CHUNK = 250;

async function chunked<T>(rows: readonly T[], run: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    await run(rows.slice(i, i + UPSERT_CHUNK));
  }
}

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
  await chunked(rows, (chunk) =>
    db
      .insert(localDotTrafficSpeed)
      .values(chunk)
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
      }),
  );
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

// =========================================================================
// NYC DOT Street Construction (tqtj-sjs8) + Street Opening (9jic-byiu)
// Permits keyed on permit_number; upserts on conflict.
// =========================================================================

export type LocalDotStreetPermit = typeof localDotStreetPermit.$inferSelect;

export async function upsertDotStreetPermits(
  db: LocalPipelineDb,
  rows: readonly LocalDotStreetPermit[],
): Promise<void> {
  if (rows.length === 0) return;
  await chunked(rows, (chunk) =>
    db
      .insert(localDotStreetPermit)
      .values(chunk)
      .onConflictDoUpdate({
        target: localDotStreetPermit.permitNumber,
        set: {
          permitKind: sql`excluded.permit_kind`,
          applicationTrackingId: sql`excluded.application_tracking_id`,
          permitTypeId: sql`excluded.permit_type_id`,
          permitTypeDesc: sql`excluded.permit_type_desc`,
          permitStatusId: sql`excluded.permit_status_id`,
          permitStatusDesc: sql`excluded.permit_status_desc`,
          permitSeriesId: sql`excluded.permit_series_id`,
          permitSeriesDesc: sql`excluded.permit_series_desc`,
          applicationTypeShortDesc: sql`excluded.application_type_short_desc`,
          equipmentTypeDesc: sql`excluded.equipment_type_desc`,
          numberOfZones: sql`excluded.number_of_zones`,
          linearFeet: sql`excluded.linear_feet`,
          totalSqFeet: sql`excluded.total_sq_feet`,
          estimatedNumberOfCuts: sql`excluded.estimated_number_of_cuts`,
          permitIssueDate: sql`excluded.permit_issue_date`,
          emergencyIssueDate: sql`excluded.emergency_issue_date`,
          issuedWorkStartDate: sql`excluded.issued_work_start_date`,
          issuedWorkEndDate: sql`excluded.issued_work_end_date`,
          boroughName: sql`excluded.borough_name`,
        },
      }),
  );
}

export async function countDotStreetPermits(
  db: LocalPipelineDb,
): Promise<{ kind: "construction" | "opening"; count: number }[]> {
  const rows = await db
    .select({ kind: localDotStreetPermit.permitKind, count: sql<number>`count(*)`.as("c") })
    .from(localDotStreetPermit)
    .groupBy(localDotStreetPermit.permitKind);
  return rows.map((r) => ({ kind: r.kind as "construction" | "opening", count: Number(r.count) }));
}

// =========================================================================
// NYC DOT Automated Traffic Volume Counts (7ym2-wayt)
// =========================================================================

export type LocalDotTrafficVolumeCount = typeof localDotTrafficVolumeCount.$inferSelect;

export async function insertDotTrafficVolumeCounts(
  db: LocalPipelineDb,
  rows: readonly LocalDotTrafficVolumeCount[],
): Promise<void> {
  if (rows.length === 0) return;
  await chunked(rows, (chunk) =>
    db
      .insert(localDotTrafficVolumeCount)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          localDotTrafficVolumeCount.requestId,
          localDotTrafficVolumeCount.segmentId,
          localDotTrafficVolumeCount.sampledAt,
        ],
        set: {
          borough: sql`excluded.borough`,
          street: sql`excluded.street`,
          fromStreet: sql`excluded.from_street`,
          toStreet: sql`excluded.to_street`,
          direction: sql`excluded.direction`,
          volume: sql`excluded.volume`,
          wktGeom: sql`excluded.wkt_geom`,
        },
      }),
  );
}

export async function countDotTrafficVolumes(db: LocalPipelineDb): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)`.as("c") })
    .from(localDotTrafficVolumeCount);
  return Number(rows[0]?.c ?? 0);
}

// =========================================================================
// NYPD Motor Vehicle Collisions (h9gi-nx95)
// =========================================================================

export type LocalNypdCollision = typeof localNypdCollision.$inferSelect;

export async function upsertNypdCollisions(
  db: LocalPipelineDb,
  rows: readonly LocalNypdCollision[],
): Promise<void> {
  if (rows.length === 0) return;
  await chunked(rows, (chunk) =>
    db
      .insert(localNypdCollision)
      .values(chunk)
      .onConflictDoUpdate({
        target: localNypdCollision.collisionId,
        set: {
          crashDate: sql`excluded.crash_date`,
          crashTime: sql`excluded.crash_time`,
          borough: sql`excluded.borough`,
          zipCode: sql`excluded.zip_code`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          onStreetName: sql`excluded.on_street_name`,
          offStreetName: sql`excluded.off_street_name`,
          crossStreetName: sql`excluded.cross_street_name`,
          personsInjured: sql`excluded.persons_injured`,
          personsKilled: sql`excluded.persons_killed`,
          pedestriansInjured: sql`excluded.pedestrians_injured`,
          pedestriansKilled: sql`excluded.pedestrians_killed`,
          cyclistInjured: sql`excluded.cyclist_injured`,
          cyclistKilled: sql`excluded.cyclist_killed`,
          motoristInjured: sql`excluded.motorist_injured`,
          motoristKilled: sql`excluded.motorist_killed`,
          contributingFactorVehicle1: sql`excluded.contributing_factor_vehicle_1`,
          contributingFactorVehicle2: sql`excluded.contributing_factor_vehicle_2`,
        },
      }),
  );
}

export async function countNypdCollisions(db: LocalPipelineDb): Promise<number> {
  const rows = await db.select({ c: sql<number>`count(*)`.as("c") }).from(localNypdCollision);
  return Number(rows[0]?.c ?? 0);
}

// =========================================================================
// 311 Service Requests (erm2-nwe9 current + 76ig-c548 historical)
// =========================================================================

export type Local311ServiceRequest = typeof local311ServiceRequest.$inferSelect;

export async function upsert311ServiceRequests(
  db: LocalPipelineDb,
  rows: readonly Local311ServiceRequest[],
): Promise<void> {
  if (rows.length === 0) return;
  await chunked(rows, (chunk) =>
    db
      .insert(local311ServiceRequest)
      .values(chunk)
      .onConflictDoUpdate({
        target: local311ServiceRequest.uniqueKey,
        set: {
          era: sql`excluded.era`,
          createdDate: sql`excluded.created_date`,
          closedDate: sql`excluded.closed_date`,
          agency: sql`excluded.agency`,
          agencyName: sql`excluded.agency_name`,
          complaintType: sql`excluded.complaint_type`,
          descriptor: sql`excluded.descriptor`,
          locationType: sql`excluded.location_type`,
          incidentZip: sql`excluded.incident_zip`,
          incidentAddress: sql`excluded.incident_address`,
          streetName: sql`excluded.street_name`,
          crossStreet1: sql`excluded.cross_street_1`,
          crossStreet2: sql`excluded.cross_street_2`,
          city: sql`excluded.city`,
          status: sql`excluded.status`,
          resolutionDescription: sql`excluded.resolution_description`,
          communityBoard: sql`excluded.community_board`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
        },
      }),
  );
}

export async function count311ByEra(
  db: LocalPipelineDb,
): Promise<{ era: "current" | "historical"; count: number }[]> {
  const rows = await db
    .select({ era: local311ServiceRequest.era, count: sql<number>`count(*)`.as("c") })
    .from(local311ServiceRequest)
    .groupBy(local311ServiceRequest.era);
  return rows.map((r) => ({ era: r.era as "current" | "historical", count: Number(r.count) }));
}

// =========================================================================
// Parking Violations (pvqr-7yc4)
// =========================================================================

export type LocalParkingViolation = typeof localParkingViolation.$inferSelect;

export async function upsertParkingViolations(
  db: LocalPipelineDb,
  rows: readonly LocalParkingViolation[],
): Promise<void> {
  if (rows.length === 0) return;
  await chunked(rows, (chunk) =>
    db
      .insert(localParkingViolation)
      .values(chunk)
      .onConflictDoUpdate({
        target: localParkingViolation.summonsNumber,
        set: {
          issueDate: sql`excluded.issue_date`,
          violationCode: sql`excluded.violation_code`,
          violationDescription: sql`excluded.violation_description`,
          plateId: sql`excluded.plate_id`,
          registrationState: sql`excluded.registration_state`,
          plateType: sql`excluded.plate_type`,
          vehicleBodyType: sql`excluded.vehicle_body_type`,
          vehicleMake: sql`excluded.vehicle_make`,
          issuingAgency: sql`excluded.issuing_agency`,
          violationLocation: sql`excluded.violation_location`,
          violationPrecinct: sql`excluded.violation_precinct`,
          violationCounty: sql`excluded.violation_county`,
          houseNumber: sql`excluded.house_number`,
          streetName: sql`excluded.street_name`,
          violationTime: sql`excluded.violation_time`,
        },
      }),
  );
}

export async function countParkingViolationsByCode(
  db: LocalPipelineDb,
): Promise<{ code: number; count: number }[]> {
  const rows = await db
    .select({
      code: localParkingViolation.violationCode,
      count: sql<number>`count(*)`.as("c"),
    })
    .from(localParkingViolation)
    .groupBy(localParkingViolation.violationCode)
    .orderBy(localParkingViolation.violationCode);
  return rows.map((r) => ({ code: r.code, count: Number(r.count) }));
}

// =========================================================================
// NYC LION street centerline (not Socrata; ingested from a local file or
// pull script that materializes a GeoJSON / Shapefile dump).
// =========================================================================

export type LocalLionSegment = typeof localLionSegment.$inferSelect;

export async function upsertLionSegments(
  db: LocalPipelineDb,
  rows: readonly LocalLionSegment[],
): Promise<void> {
  if (rows.length === 0) return;
  await chunked(rows, (chunk) =>
    db
      .insert(localLionSegment)
      .values(chunk)
      .onConflictDoUpdate({
        target: localLionSegment.physicalId,
        set: {
          streetCodeMaster: sql`excluded.street_code_master`,
          streetName: sql`excluded.street_name`,
          borough: sql`excluded.borough`,
          l_zip: sql`excluded.l_zip`,
          r_zip: sql`excluded.r_zip`,
          segmentTypeCode: sql`excluded.segment_type_code`,
          segmentTypeDesc: sql`excluded.segment_type_desc`,
          rwTypeCode: sql`excluded.rw_type_code`,
          rwTypeDesc: sql`excluded.rw_type_desc`,
          fromNodeId: sql`excluded.from_node_id`,
          toNodeId: sql`excluded.to_node_id`,
          trafficDir: sql`excluded.traffic_dir`,
          fromLevelCode: sql`excluded.from_level_code`,
          toLevelCode: sql`excluded.to_level_code`,
          shapeLength: sql`excluded.shape_length`,
          wktGeom: sql`excluded.wkt_geom`,
        },
      }),
  );
}

export async function countLionSegments(db: LocalPipelineDb): Promise<number> {
  const rows = await db.select({ c: sql<number>`count(*)`.as("c") }).from(localLionSegment);
  return Number(rows[0]?.c ?? 0);
}
