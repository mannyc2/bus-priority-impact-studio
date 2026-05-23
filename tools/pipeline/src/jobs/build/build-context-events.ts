import { createHash } from "node:crypto";
import { type LocalContextEvent, upsertContextEvents } from "@bp/db/local";
import { withLocalPipelineDb } from "../../lib/local-db.js";

type Args = { dbPath?: string };

type Result = {
  inserted311: number;
  insertedCollisions: number;
  insertedParking: number;
  insertedPermits: number;
  insertedTrafficVolumes: number;
  insertedTrafficSpeeds: number;
  insertedAceViolations: number;
  total: number;
};

function parseCliArgs(args: string[]): Args {
  const i = args.indexOf("--db-path");
  if (i === -1) return {};
  const value = args[i + 1];
  return value === undefined ? {} : { dbPath: value };
}

function eventId(sourceId: string, sourceRowId: string): string {
  return createHash("sha1").update(`${sourceId}|${sourceRowId}`).digest("hex");
}

export async function buildContextEvents(args: Args = {}): Promise<Result> {
  return withLocalPipelineDb(args.dbPath, async (local) => {
    const ingestedAt = new Date().toISOString();

    // ---- 311 ----
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
          physical_id: string | null;
          latitude: number | null;
          longitude: number | null;
          incident_address: string | null;
          street_name: string | null;
        },
        []
      >(
        `SELECT unique_key, era, created_date, closed_date, complaint_type, descriptor,
                status, physical_id, latitude, longitude, incident_address, street_name
           FROM local_311_service_request`,
      )
      .all();
    const events311: LocalContextEvent[] = rows311.map((r) => ({
      // event_id is stable across era flips so a request that moves from
      // "current" to "historical" doesn't show up twice in the context table.
      // Era is preserved on source_id for provenance.
      eventId: eventId("nyc_311", r.unique_key),
      sourceId: `nyc_311_service_requests_${r.era}`,
      sourceRowId: r.unique_key,
      eventKind: "311_complaint",
      occurredAt: r.created_date,
      endedAt: r.closed_date,
      physicalId: r.physical_id,
      lat: r.latitude,
      lng: r.longitude,
      routeId: null,
      payloadJson: JSON.stringify({
        complaintType: r.complaint_type,
        descriptor: r.descriptor,
        status: r.status,
        incidentAddress: r.incident_address,
        streetName: r.street_name,
      }),
      ingestedAt,
    }));

    // ---- NYPD collisions ----
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
    const eventsCol: LocalContextEvent[] = rowsCol.map((r) => {
      const occurredAt = r.crash_time
        ? `${r.crash_date}T${r.crash_time}`
        : `${r.crash_date}T00:00:00`;
      return {
        eventId: eventId("nypd_collisions", r.collision_id),
        sourceId: "nypd_motor_vehicle_collisions",
        sourceRowId: r.collision_id,
        eventKind: "collision",
        occurredAt,
        endedAt: null,
        physicalId: r.physical_id,
        lat: r.latitude,
        lng: r.longitude,
        routeId: null,
        payloadJson: JSON.stringify({
          borough: r.borough,
          onStreetName: r.on_street_name,
          crossStreetName: r.cross_street_name,
          personsInjured: r.persons_injured,
          personsKilled: r.persons_killed,
          pedestriansInjured: r.pedestrians_injured,
          pedestriansKilled: r.pedestrians_killed,
          cyclistInjured: r.cyclist_injured,
          cyclistKilled: r.cyclist_killed,
        }),
        ingestedAt,
      };
    });

    // ---- Parking violations ----
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
    const eventsPark: LocalContextEvent[] = rowsPark.map((r) => ({
      eventId: eventId("nyc_parking_violation", r.summons_number),
      sourceId: "nyc_parking_violations_current",
      sourceRowId: r.summons_number,
      eventKind: "parking_violation",
      occurredAt: r.violation_time
        ? `${r.issue_date}T${normalizeTime(r.violation_time)}`
        : `${r.issue_date}T00:00:00`,
      endedAt: null,
      physicalId: r.physical_id,
      lat: null,
      lng: null,
      routeId: null,
      payloadJson: JSON.stringify({
        violationCode: r.violation_code,
        violationDescription: r.violation_description,
        violationCounty: r.violation_county,
        houseNumber: r.house_number,
        streetName: r.street_name,
        intersectingStreet: r.intersecting_street,
        streetCode1: r.street_code1,
        streetCode2: r.street_code2,
        streetCode3: r.street_code3,
      }),
      ingestedAt,
    }));

    // ---- DOT street permits ----
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
    const eventsPerm: LocalContextEvent[] = rowsPerm.map((r) => ({
      eventId: eventId(`nyc_dot_${r.permit_kind}_permit`, r.permit_number),
      sourceId: `nyc_dot_street_${r.permit_kind}_permits`,
      sourceRowId: r.permit_number,
      eventKind: "permit",
      occurredAt: r.issued_work_start_date ?? r.permit_issue_date ?? new Date(0).toISOString(),
      endedAt: r.issued_work_end_date,
      physicalId: r.physical_id,
      lat: null,
      lng: null,
      routeId: null,
      payloadJson: JSON.stringify({
        permitKind: r.permit_kind,
        permitTypeDesc: r.permit_type_desc,
        permitStatusDesc: r.permit_status_desc,
        permitSeriesDesc: r.permit_series_desc,
        applicationTypeShortDesc: r.application_type_short_desc,
        equipmentTypeDesc: r.equipment_type_desc,
        borough: r.borough_name,
        houseNumber: r.house_number,
        onStreetName: r.on_street_name,
        fromStreetName: r.from_street_name,
        toStreetName: r.to_street_name,
        purposeComments: r.purpose_comments,
      }),
      ingestedAt,
    }));

    // ---- DOT traffic-volume counts ----
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
    const eventsVol: LocalContextEvent[] = rowsVol.map((r) => ({
      eventId: eventId(
        "nyc_dot_traffic_volume",
        `${r.request_id}-${r.segment_id}-${r.sampled_at}`,
      ),
      sourceId: "nyc_dot_automated_traffic_volume_counts",
      sourceRowId: `${r.request_id}-${r.segment_id}-${r.sampled_at}`,
      eventKind: "traffic_volume",
      occurredAt: r.sampled_at,
      endedAt: null,
      physicalId: r.physical_id,
      lat: null,
      lng: null,
      routeId: null,
      payloadJson: JSON.stringify({
        requestId: r.request_id,
        segmentId: r.segment_id,
        borough: r.borough,
        street: r.street,
        fromStreet: r.from_street,
        toStreet: r.to_street,
        direction: r.direction,
        volume: r.volume,
      }),
      ingestedAt,
    }));

    // ---- DOT traffic speeds ----
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
    const eventsSpeed: LocalContextEvent[] = rowsSpeed.map((r) => ({
      eventId: eventId("nyc_dot_traffic_speed", `${r.link_id}-${r.sampled_at}`),
      sourceId: "nyc_dot_real_time_traffic_speeds",
      sourceRowId: `${r.link_id}-${r.sampled_at}`,
      eventKind: "traffic_speed",
      occurredAt: r.sampled_at,
      endedAt: null,
      physicalId: r.physical_id,
      lat: null,
      lng: null,
      routeId: null,
      payloadJson: JSON.stringify({
        linkId: r.link_id,
        linkName: r.link_name,
        borough: r.borough,
        speed: r.speed,
        travelTime: r.travel_time,
        statusCode: r.status_code,
      }),
      ingestedAt,
    }));

    // ---- ACE camera enforcement (monthly per-route aggregates) ----
    // Roll up violation_type × violation_status into a single event per
    // (month, route_id). The breakdown lives in the payload so detectors
    // can drill in without re-querying the source.
    const rowsAce = local.sqlite
      .query<
        {
          month: string;
          route_id: string;
          violation_type: string;
          violation_status: string;
          violation_count: number;
        },
        []
      >(
        `SELECT month, route_id, violation_type, violation_status, violation_count
           FROM local_ace_violation_summary
          ORDER BY month, route_id, violation_type, violation_status`,
      )
      .all();
    const aceGroups = new Map<
      string,
      {
        month: string;
        routeId: string;
        breakdown: Array<{ type: string; status: string; count: number }>;
        total: number;
      }
    >();
    for (const r of rowsAce) {
      const key = `${r.month}\t${r.route_id}`;
      const existing = aceGroups.get(key);
      if (existing) {
        existing.breakdown.push({
          type: r.violation_type,
          status: r.violation_status,
          count: r.violation_count,
        });
        existing.total += r.violation_count;
      } else {
        aceGroups.set(key, {
          month: r.month,
          routeId: r.route_id,
          breakdown: [
            { type: r.violation_type, status: r.violation_status, count: r.violation_count },
          ],
          total: r.violation_count,
        });
      }
    }
    const eventsAce: LocalContextEvent[] = [...aceGroups.values()].map((g) => ({
      eventId: eventId("nyc_mta_ace_violations", `${g.month}-${g.routeId}`),
      sourceId: "nyc_mta_ace_violations",
      sourceRowId: `${g.month}-${g.routeId}`,
      eventKind: "ace_violation_aggregate",
      occurredAt: `${g.month}-01T00:00:00`,
      endedAt: null,
      physicalId: null,
      lat: null,
      lng: null,
      routeId: g.routeId,
      payloadJson: JSON.stringify({
        month: g.month,
        totalViolations: g.total,
        breakdown: g.breakdown,
      }),
      ingestedAt,
    }));

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
  });
}

function normalizeTime(raw: string): string {
  // Parking violation times are "HHMM" or "HHMMA"/"HHMMP" — best-effort normalize.
  const cleaned = raw.replace(/[^0-9APMapm]/g, "");
  const hhmm = cleaned.match(/^(\d{1,2})(\d{2})([apAP])?$/);
  if (!hhmm || !hhmm[1] || !hhmm[2]) return "00:00:00";
  let hh = Number.parseInt(hhmm[1], 10);
  const mm = Number.parseInt(hhmm[2], 10);
  const ampm = hhmm[3]?.toLowerCase();
  if (ampm === "p" && hh < 12) hh += 12;
  if (ampm === "a" && hh === 12) hh = 0;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}

export async function buildContextEventsFromCli(args: string[]): Promise<Result> {
  const result = await buildContextEvents(parseCliArgs(args));
  console.log(
    `context-events: 311=${result.inserted311} collisions=${result.insertedCollisions} parking=${result.insertedParking} permits=${result.insertedPermits} traffic_volumes=${result.insertedTrafficVolumes} traffic_speeds=${result.insertedTrafficSpeeds} ace=${result.insertedAceViolations} total=${result.total}`,
  );
  return result;
}
