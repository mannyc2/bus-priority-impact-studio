import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { type LocalContextEvent, type LocalPipelineDb, upsertContextEvents } from "@bp/db/local";
import * as z from "@bp/domain/schema-compat";

export type BuildContextEventsResult = {
  inserted311: number;
  insertedCollisions: number;
  insertedParking: number;
  insertedPermits: number;
  insertedTrafficVolumes: number;
  insertedTrafficSpeeds: number;
  insertedAceViolations: number;
  total: number;
};

export type BuildContextEventsLocalDb = {
  readonly db: LocalPipelineDb;
  readonly sqlite: Database;
};

type AceViolationSummaryRow = {
  month: string;
  route_id: string;
  violation_type: string;
  violation_status: string;
  violation_count: number;
};

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const ContextEventPayloadSchemaByKind = {
  "311_complaint": z
    .object({
      complaintType: nullableString,
      descriptor: nullableString,
      status: nullableString,
      incidentAddress: nullableString,
      streetName: nullableString,
      curbFrictionCategory: nullableString,
      curbFrictionRule: nullableString,
    })
    .strict(),
  collision: z
    .object({
      borough: nullableString,
      onStreetName: nullableString,
      crossStreetName: nullableString,
      personsInjured: nullableNumber,
      personsKilled: nullableNumber,
      pedestriansInjured: nullableNumber,
      pedestriansKilled: nullableNumber,
      cyclistInjured: nullableNumber,
      cyclistKilled: nullableNumber,
    })
    .strict(),
  parking_violation: z
    .object({
      violationCode: z.number().int(),
      violationDescription: nullableString,
      violationCounty: nullableString,
      houseNumber: nullableString,
      streetName: nullableString,
      intersectingStreet: nullableString,
      streetCode1: nullableString,
      streetCode2: nullableString,
      streetCode3: nullableString,
    })
    .strict(),
  permit: z
    .object({
      permitKind: z.string().min(1),
      permitTypeDesc: nullableString,
      permitStatusDesc: nullableString,
      permitSeriesDesc: nullableString,
      applicationTypeShortDesc: nullableString,
      equipmentTypeDesc: nullableString,
      borough: nullableString,
      houseNumber: nullableString,
      onStreetName: nullableString,
      fromStreetName: nullableString,
      toStreetName: nullableString,
      purposeComments: nullableString,
    })
    .strict(),
  traffic_volume: z
    .object({
      requestId: z.number().int(),
      segmentId: z.number().int(),
      borough: nullableString,
      street: nullableString,
      fromStreet: nullableString,
      toStreet: nullableString,
      direction: nullableString,
      volume: z.number(),
    })
    .strict(),
  traffic_speed: z
    .object({
      linkId: z.string().min(1),
      linkName: nullableString,
      borough: nullableString,
      speed: nullableNumber,
      travelTime: nullableNumber,
      statusCode: z.string().min(1),
    })
    .strict(),
  ace_violation_aggregate: z
    .object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      totalViolations: z.number().int().nonnegative(),
      breakdown: z.array(
        z
          .object({
            type: z.string().min(1),
            status: z.string().min(1),
            count: z.number().int().nonnegative(),
          })
          .strict(),
      ),
    })
    .strict(),
} as const;

export type ContextEventPayloadKind = keyof typeof ContextEventPayloadSchemaByKind;

export function parseContextEventPayloadJson(input: {
  eventKind: string;
  payloadJson: string;
}): unknown {
  const schema =
    ContextEventPayloadSchemaByKind[input.eventKind as ContextEventPayloadKind] ?? null;
  if (schema === null) {
    throw new Error(`No context-event payload schema for event kind ${input.eventKind}`);
  }
  return schema.parse(JSON.parse(input.payloadJson));
}

function contextEventPayloadJson<K extends ContextEventPayloadKind>(
  eventKind: K,
  payload: z.input<(typeof ContextEventPayloadSchemaByKind)[K]>,
): string {
  return JSON.stringify(ContextEventPayloadSchemaByKind[eventKind].parse(payload));
}

export function contextEventId(sourceId: string, sourceRowId: string): string {
  return createHash("sha1").update(`${sourceId}|${sourceRowId}`).digest("hex");
}

export function normalizeContextEventTime(raw: string): string {
  const cleaned = raw.replace(/[^0-9APMapm]/g, "");
  const hhmm = cleaned.match(/^(\d{1,2})(\d{2})([apAP])?$/);
  if (!hhmm?.[1] || !hhmm[2]) return "00:00:00";
  let hh = Number.parseInt(hhmm[1], 10);
  const mm = Number.parseInt(hhmm[2], 10);
  const ampm = hhmm[3]?.toLowerCase();
  if (ampm === "p" && hh < 12) hh += 12;
  if (ampm === "a" && hh === 12) hh = 0;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}

export function buildAceViolationAggregateEvents(input: {
  rows: readonly AceViolationSummaryRow[];
  ingestedAt: string;
}): LocalContextEvent[] {
  const aceGroups = new Map<
    string,
    {
      month: string;
      routeId: string;
      breakdown: Array<{ type: string; status: string; count: number }>;
      total: number;
    }
  >();
  for (const row of input.rows) {
    const key = `${row.month}\t${row.route_id}`;
    const existing = aceGroups.get(key);
    if (existing) {
      existing.breakdown.push({
        type: row.violation_type,
        status: row.violation_status,
        count: row.violation_count,
      });
      existing.total += row.violation_count;
    } else {
      aceGroups.set(key, {
        month: row.month,
        routeId: row.route_id,
        breakdown: [
          {
            type: row.violation_type,
            status: row.violation_status,
            count: row.violation_count,
          },
        ],
        total: row.violation_count,
      });
    }
  }

  return [...aceGroups.values()].map((group) => ({
    eventId: contextEventId("nyc_mta_ace_violations", `${group.month}-${group.routeId}`),
    sourceId: "nyc_mta_ace_violations",
    sourceRowId: `${group.month}-${group.routeId}`,
    eventKind: "ace_violation_aggregate",
    occurredAt: `${group.month}-01T00:00:00`,
    endedAt: null,
    physicalId: null,
    lat: null,
    lng: null,
    routeId: group.routeId,
    payloadJson: contextEventPayloadJson("ace_violation_aggregate", {
      month: group.month,
      totalViolations: group.total,
      breakdown: group.breakdown,
    }),
    ingestedAt: input.ingestedAt,
  }));
}

export async function runBuildContextEvents(inputs: {
  local: BuildContextEventsLocalDb;
}): Promise<BuildContextEventsResult> {
  const { local } = inputs;
  const ingestedAt = new Date().toISOString();

  const rows311 = local.sqlite
    .query<
      {
        unique_key: string;
        era: string;
        created_date: string;
        closed_date: string | null;
        complaint_type: string | null;
        descriptor: string | null;
        status: string | null;
        curb_friction_category: string | null;
        curb_friction_rule: string | null;
        physical_id: string | null;
        latitude: number | null;
        longitude: number | null;
        incident_address: string | null;
        street_name: string | null;
      },
      []
    >(
      `SELECT unique_key, era, created_date, closed_date, complaint_type, descriptor,
              status, curb_friction_category, curb_friction_rule, physical_id, latitude,
              longitude, incident_address, street_name
         FROM local_311_service_request`,
    )
    .all();
  const events311: LocalContextEvent[] = rows311.map((row) => ({
    eventId: contextEventId("nyc_311", row.unique_key),
    sourceId: `nyc_311_service_requests_${row.era}`,
    sourceRowId: row.unique_key,
    eventKind: "311_complaint",
    occurredAt: row.created_date,
    endedAt: row.closed_date,
    physicalId: row.physical_id,
    lat: row.latitude,
    lng: row.longitude,
    routeId: null,
    payloadJson: contextEventPayloadJson("311_complaint", {
      complaintType: row.complaint_type,
      descriptor: row.descriptor,
      status: row.status,
      incidentAddress: row.incident_address,
      streetName: row.street_name,
      curbFrictionCategory: row.curb_friction_category,
      curbFrictionRule: row.curb_friction_rule,
    }),
    ingestedAt,
  }));

  const rowsCol = local.sqlite
    .query<
      {
        collision_id: string;
        crash_date: string;
        crash_time: string | null;
        borough: string | null;
        latitude: number | null;
        longitude: number | null;
        on_street_name: string | null;
        cross_street_name: string | null;
        persons_injured: number | null;
        persons_killed: number | null;
        pedestrians_injured: number | null;
        pedestrians_killed: number | null;
        cyclist_injured: number | null;
        cyclist_killed: number | null;
        physical_id: string | null;
      },
      []
    >(
      `SELECT collision_id, crash_date, crash_time, borough, latitude, longitude,
              on_street_name, cross_street_name, persons_injured, persons_killed,
              pedestrians_injured, pedestrians_killed, cyclist_injured, cyclist_killed,
              physical_id
         FROM local_nypd_collision`,
    )
    .all();
  const eventsCol: LocalContextEvent[] = rowsCol.map((row) => {
    const occurredAt = row.crash_time
      ? `${row.crash_date}T${row.crash_time}`
      : `${row.crash_date}T00:00:00`;
    return {
      eventId: contextEventId("nypd_collisions", row.collision_id),
      sourceId: "nypd_motor_vehicle_collisions",
      sourceRowId: row.collision_id,
      eventKind: "collision",
      occurredAt,
      endedAt: null,
      physicalId: row.physical_id,
      lat: row.latitude,
      lng: row.longitude,
      routeId: null,
      payloadJson: contextEventPayloadJson("collision", {
        borough: row.borough,
        onStreetName: row.on_street_name,
        crossStreetName: row.cross_street_name,
        personsInjured: row.persons_injured,
        personsKilled: row.persons_killed,
        pedestriansInjured: row.pedestrians_injured,
        pedestriansKilled: row.pedestrians_killed,
        cyclistInjured: row.cyclist_injured,
        cyclistKilled: row.cyclist_killed,
      }),
      ingestedAt,
    };
  });

  const rowsPark = local.sqlite
    .query<
      {
        summons_number: string;
        issue_date: string;
        violation_code: number;
        violation_description: string | null;
        violation_county: string | null;
        house_number: string | null;
        street_name: string | null;
        intersecting_street: string | null;
        street_code1: string | null;
        street_code2: string | null;
        street_code3: string | null;
        violation_time: string | null;
        physical_id: string | null;
      },
      []
    >(
      `SELECT summons_number, issue_date, violation_code, violation_description,
              violation_county, house_number, street_name, intersecting_street,
              street_code1, street_code2, street_code3, violation_time, physical_id
         FROM local_parking_violation`,
    )
    .all();
  const eventsPark: LocalContextEvent[] = rowsPark.map((row) => ({
    eventId: contextEventId("nyc_parking_violation", row.summons_number),
    sourceId: "nyc_parking_violations_current",
    sourceRowId: row.summons_number,
    eventKind: "parking_violation",
    occurredAt: row.violation_time
      ? `${row.issue_date}T${normalizeContextEventTime(row.violation_time)}`
      : `${row.issue_date}T00:00:00`,
    endedAt: null,
    physicalId: row.physical_id,
    lat: null,
    lng: null,
    routeId: null,
    payloadJson: contextEventPayloadJson("parking_violation", {
      violationCode: row.violation_code,
      violationDescription: row.violation_description,
      violationCounty: row.violation_county,
      houseNumber: row.house_number,
      streetName: row.street_name,
      intersectingStreet: row.intersecting_street,
      streetCode1: row.street_code1,
      streetCode2: row.street_code2,
      streetCode3: row.street_code3,
    }),
    ingestedAt,
  }));

  const rowsPerm = local.sqlite
    .query<
      {
        permit_number: string;
        permit_kind: string;
        permit_type_desc: string | null;
        permit_status_desc: string | null;
        permit_series_desc: string | null;
        application_type_short_desc: string | null;
        equipment_type_desc: string | null;
        permit_issue_date: string | null;
        issued_work_start_date: string | null;
        issued_work_end_date: string | null;
        borough_name: string | null;
        house_number: string | null;
        on_street_name: string | null;
        from_street_name: string | null;
        to_street_name: string | null;
        purpose_comments: string | null;
        physical_id: string | null;
      },
      []
    >(
      `SELECT permit_number, permit_kind, permit_type_desc, permit_status_desc,
              permit_series_desc, application_type_short_desc, equipment_type_desc,
              permit_issue_date, issued_work_start_date, issued_work_end_date,
              borough_name, house_number, on_street_name, from_street_name,
              to_street_name, purpose_comments, physical_id
         FROM local_dot_street_permit`,
    )
    .all();
  const eventsPerm: LocalContextEvent[] = rowsPerm.map((row) => ({
    eventId: contextEventId(`nyc_dot_${row.permit_kind}_permit`, row.permit_number),
    sourceId: `nyc_dot_street_${row.permit_kind}_permits`,
    sourceRowId: row.permit_number,
    eventKind: "permit",
    occurredAt: row.issued_work_start_date ?? row.permit_issue_date ?? new Date(0).toISOString(),
    endedAt: row.issued_work_end_date,
    physicalId: row.physical_id,
    lat: null,
    lng: null,
    routeId: null,
    payloadJson: contextEventPayloadJson("permit", {
      permitKind: row.permit_kind,
      permitTypeDesc: row.permit_type_desc,
      permitStatusDesc: row.permit_status_desc,
      permitSeriesDesc: row.permit_series_desc,
      applicationTypeShortDesc: row.application_type_short_desc,
      equipmentTypeDesc: row.equipment_type_desc,
      borough: row.borough_name,
      houseNumber: row.house_number,
      onStreetName: row.on_street_name,
      fromStreetName: row.from_street_name,
      toStreetName: row.to_street_name,
      purposeComments: row.purpose_comments,
    }),
    ingestedAt,
  }));

  const rowsVol = local.sqlite
    .query<
      {
        request_id: number;
        segment_id: number;
        sampled_at: string;
        borough: string | null;
        street: string | null;
        from_street: string | null;
        to_street: string | null;
        direction: string | null;
        volume: number;
        physical_id: string | null;
      },
      []
    >(
      `SELECT request_id, segment_id, sampled_at, borough, street,
              from_street, to_street, direction, volume, physical_id
         FROM local_dot_traffic_volume_count
        WHERE physical_id IS NOT NULL`,
    )
    .all();
  const eventsVol: LocalContextEvent[] = rowsVol.map((row) => ({
    eventId: contextEventId(
      "nyc_dot_traffic_volume",
      `${row.request_id}-${row.segment_id}-${row.sampled_at}`,
    ),
    sourceId: "nyc_dot_automated_traffic_volume_counts",
    sourceRowId: `${row.request_id}-${row.segment_id}-${row.sampled_at}`,
    eventKind: "traffic_volume",
    occurredAt: row.sampled_at,
    endedAt: null,
    physicalId: row.physical_id,
    lat: null,
    lng: null,
    routeId: null,
    payloadJson: contextEventPayloadJson("traffic_volume", {
      requestId: row.request_id,
      segmentId: row.segment_id,
      borough: row.borough,
      street: row.street,
      fromStreet: row.from_street,
      toStreet: row.to_street,
      direction: row.direction,
      volume: row.volume,
    }),
    ingestedAt,
  }));

  const rowsSpeed = local.sqlite
    .query<
      {
        link_id: string;
        sampled_at: string;
        speed: number | null;
        travel_time: number | null;
        status_code: string;
        borough: string | null;
        link_name: string | null;
        physical_id: string | null;
      },
      []
    >(
      `SELECT link_id, sampled_at, speed, travel_time, status_code,
              borough, link_name, physical_id
         FROM local_dot_traffic_speed
        WHERE physical_id IS NOT NULL`,
    )
    .all();
  const eventsSpeed: LocalContextEvent[] = rowsSpeed.map((row) => ({
    eventId: contextEventId("nyc_dot_traffic_speed", `${row.link_id}-${row.sampled_at}`),
    sourceId: "nyc_dot_real_time_traffic_speeds",
    sourceRowId: `${row.link_id}-${row.sampled_at}`,
    eventKind: "traffic_speed",
    occurredAt: row.sampled_at,
    endedAt: null,
    physicalId: row.physical_id,
    lat: null,
    lng: null,
    routeId: null,
    payloadJson: contextEventPayloadJson("traffic_speed", {
      linkId: row.link_id,
      linkName: row.link_name,
      borough: row.borough,
      speed: row.speed,
      travelTime: row.travel_time,
      statusCode: row.status_code,
    }),
    ingestedAt,
  }));

  const rowsAce = local.sqlite
    .query<AceViolationSummaryRow, []>(
      `SELECT month, route_id, violation_type, violation_status, violation_count
         FROM local_ace_violation_summary
        ORDER BY month, route_id, violation_type, violation_status`,
    )
    .all();
  const eventsAce = buildAceViolationAggregateEvents({ rows: rowsAce, ingestedAt });

  await upsertContextEvents(local.db, events311);
  await upsertContextEvents(local.db, eventsCol);
  await upsertContextEvents(local.db, eventsPark);
  await upsertContextEvents(local.db, eventsPerm);
  await upsertContextEvents(local.db, eventsVol);
  await upsertContextEvents(local.db, eventsSpeed);
  await upsertContextEvents(local.db, eventsAce);

  return {
    inserted311: events311.length,
    insertedCollisions: eventsCol.length,
    insertedParking: eventsPark.length,
    insertedPermits: eventsPerm.length,
    insertedTrafficVolumes: eventsVol.length,
    insertedTrafficSpeeds: eventsSpeed.length,
    insertedAceViolations: eventsAce.length,
    total:
      events311.length +
      eventsCol.length +
      eventsPark.length +
      eventsPerm.length +
      eventsVol.length +
      eventsSpeed.length +
      eventsAce.length,
  };
}
