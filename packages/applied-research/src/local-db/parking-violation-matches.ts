import type { Database } from "bun:sqlite";
import {
  canonicalParkingBoroughCode,
  normalizeParkingStreetName,
  numericHouseNumber,
  parkingLocationKey,
  parseParkingCameraLocation,
  stableMatchEvidenceHash,
  streetCorridorKey,
} from "./parking-location";

export type ParkingViolationMatchGroup = {
  location_key: string;
  violation_code: number;
  violation_county: string | null;
  street_name: string | null;
  intersecting_street: string | null;
  street_code1: string | null;
  house_number: string | null;
  event_count: number;
};

export type RawParkingViolationMatchHydrationRow = {
  summons_number?: unknown;
  violation_code?: unknown;
  violation_county?: unknown;
  street_code1?: unknown;
  street_code2?: unknown;
  street_code3?: unknown;
  house_number?: unknown;
  street_name?: unknown;
  intersecting_street?: unknown;
};

export type RawLionParkingMatchHydrationRow = {
  physicalid?: unknown;
  b5sc?: unknown;
  boroughcode?: unknown;
  borough_indicator?: unknown;
  l_low_hn?: unknown;
  l_high_hn?: unknown;
  r_low_hn?: unknown;
  r_high_hn?: unknown;
};

export type ParkingViolationRouteCandidate = {
  physicalId: string;
  routeId: string;
  overlapMeters: number | null;
  bufferMeters: number | null;
  routeFanout: number;
};

export type ParkingViolationLionSegment = {
  physical_id: string;
  street_name: string | null;
  borough_code: string | null;
  l_low_hn: string | null;
  l_high_hn: string | null;
  r_low_hn: string | null;
  r_high_hn: string | null;
};

export type ParkingViolationMatchInsert = {
  locationKey: string;
  matchKind: string;
  confidence: string;
  violationCode: number;
  violationCounty: string | null;
  streetName: string | null;
  intersectingStreet: string | null;
  candidateCount: number;
  eventCount: number;
  evidence: Record<string, unknown>;
  routes: ParkingViolationRouteCandidate[];
};

export type ParkingViolationCameraGeocodeRequest = {
  crossStreetOne: string;
  crossStreetTwo: string;
  borough: string;
};

export type ParkingViolationCameraGeocodeOutcome = {
  physicalId: string | null;
  confidence: string;
};

export type ParkingViolationMatchKindSummary = {
  matchKind: string;
  confidence: string;
  rows: number;
  events: number;
};

export type ParkingViolationMatchAuditSummary = {
  matchRows: number;
  matchedLocationGroups: number;
  representedEvents: number;
  routeCount: number;
  byMatchKind: ParkingViolationMatchKindSummary[];
};

export type ParkingViolationMatchRunCounts = {
  hydratedParkingRows: number;
  hydratedLionRows: number;
  refreshedLocationKeyRows: number;
  cameraGroupsScanned: number;
  addressGroupsScanned: number;
};

export type BuildParkingViolationMatchesLocalDbResult = {
  cameraGroupsScanned: number;
  addressGroupsScanned: number;
};

export type ParkingViolationCameraGeocode = (
  request: ParkingViolationCameraGeocodeRequest,
) => Promise<ParkingViolationCameraGeocodeOutcome | null>;

export type ParkingViolationMatchAuditArtifact = {
  artifactKind: "parking_violation_match_audit";
  schemaVersion: 1;
  generatedAt: string;
  summary: ParkingViolationMatchRunCounts & {
    matchRows: number;
    matchedLocationGroups: number;
    representedEvents: number;
    routeCount: number;
  };
  byMatchKind: ParkingViolationMatchKindSummary[];
};

const CAMERA_CONFIDENCE_WEIGHT: Record<string, number> = {
  camera_intersection_geoclient: 1,
  camera_intersection_snap: 0.85,
  camera_street_corridor: 0.2,
};

export function clearParkingViolationMatches(sqlite: Database): void {
  sqlite.exec("DELETE FROM local_parking_violation_match");
}

export function countParkingViolationLocationGroups(sqlite: Database, prefix: string): number {
  return (
    sqlite
      .query<{ n: number }, [string]>(
        `SELECT count(DISTINCT match_location_key) AS n
           FROM local_parking_violation
          WHERE match_location_key LIKE ?`,
      )
      .get(`${prefix}|%`)?.n ?? 0
  );
}

export function hydrateParkingViolationRawFields(
  sqlite: Database,
  rows: Iterable<RawParkingViolationMatchHydrationRow>,
): number {
  const update = sqlite.prepare(
    `UPDATE local_parking_violation
        SET street_code1 = ?,
            street_code2 = ?,
            street_code3 = ?,
            intersecting_street = ?,
            match_location_key = ?
      WHERE summons_number = ?`,
  );
  let changed = 0;
  sqlite.exec("BEGIN");
  try {
    for (const row of rows) {
      const summonsNumber = textValue(row.summons_number);
      if (!summonsNumber) continue;
      const violationCode = numberValue(row.violation_code);
      const violationCounty = textValue(row.violation_county);
      const streetCode1 = textValue(row.street_code1);
      const streetCode2 = textValue(row.street_code2);
      const streetCode3 = textValue(row.street_code3);
      const houseNumber = textValue(row.house_number);
      const streetName = textValue(row.street_name);
      const intersectingStreet = textValue(row.intersecting_street);
      const locationKey =
        violationCode === null
          ? null
          : parkingLocationKey({
              violationCode,
              violationCounty,
              streetCode1,
              houseNumber,
              streetName,
              intersectingStreet,
            });
      changed += update.run(
        streetCode1,
        streetCode2,
        streetCode3,
        intersectingStreet,
        locationKey,
        summonsNumber,
      ).changes;
    }
    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
  return changed;
}

export function hydrateParkingViolationLionRawFields(
  sqlite: Database,
  rows: Iterable<RawLionParkingMatchHydrationRow>,
): number {
  const update = sqlite.prepare(
    `UPDATE local_lion_segment
        SET street_code_master = ?,
            borough_code = ?,
            borough = coalesce(borough, ?),
            l_low_hn = ?,
            l_high_hn = ?,
            r_low_hn = ?,
            r_high_hn = ?
      WHERE physical_id = ?`,
  );
  let changed = 0;
  sqlite.exec("BEGIN");
  try {
    for (const row of rows) {
      const physicalId = textValue(row.physicalid);
      if (!physicalId) continue;
      const boroughCode = textValue(row.boroughcode);
      changed += update.run(
        textValue(row.b5sc),
        boroughCode,
        textValue(row.borough_indicator) ?? boroughCode,
        textValue(row.l_low_hn),
        textValue(row.l_high_hn),
        textValue(row.r_low_hn),
        textValue(row.r_high_hn),
        physicalId,
      ).changes;
    }
    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
  return changed;
}

export function refreshParkingViolationLocationKeys(sqlite: Database): number {
  const groups = sqlite
    .query<
      {
        violation_code: number;
        violation_county: string | null;
        street_code1: string | null;
        house_number: string | null;
        street_name: string | null;
        intersecting_street: string | null;
      },
      []
    >(
      `SELECT violation_code,
              violation_county,
              street_code1,
              house_number,
              street_name,
              intersecting_street
         FROM local_parking_violation
        GROUP BY violation_code, violation_county, street_code1, house_number,
                 street_name, intersecting_street`,
    )
    .all();
  const update = sqlite.prepare(
    `UPDATE local_parking_violation
        SET match_location_key = ?
      WHERE violation_code = ?
        AND violation_county IS ?
        AND street_code1 IS ?
        AND house_number IS ?
        AND street_name IS ?
        AND intersecting_street IS ?`,
  );
  let changed = 0;
  sqlite.exec("BEGIN");
  try {
    for (const row of groups) {
      const key = parkingLocationKey({
        violationCode: row.violation_code,
        violationCounty: row.violation_county,
        streetCode1: row.street_code1,
        houseNumber: row.house_number,
        streetName: row.street_name,
        intersectingStreet: row.intersecting_street,
      });
      changed += update.run(
        key,
        row.violation_code,
        row.violation_county,
        row.street_code1,
        row.house_number,
        row.street_name,
        row.intersecting_street,
      ).changes;
    }
    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
  return changed;
}

export function listParkingViolationCameraGroups(
  sqlite: Database,
  limit?: number,
): ParkingViolationMatchGroup[] {
  return sqlite
    .query<ParkingViolationMatchGroup, [number] | []>(
      `SELECT match_location_key AS location_key,
              min(violation_code) AS violation_code,
              min(violation_county) AS violation_county,
              min(street_name) AS street_name,
              min(intersecting_street) AS intersecting_street,
              min(street_code1) AS street_code1,
              min(house_number) AS house_number,
              count(*) AS event_count
         FROM local_parking_violation
        WHERE violation_code = 5
          AND match_location_key IS NOT NULL
        GROUP BY match_location_key
        ORDER BY event_count DESC
        ${limit === undefined ? "" : "LIMIT ?"}`,
    )
    .all(...(limit === undefined ? [] : [limit]));
}

export function listParkingViolationAddressGroups(
  sqlite: Database,
  limit?: number,
): ParkingViolationMatchGroup[] {
  return sqlite
    .query<ParkingViolationMatchGroup, [number] | []>(
      `SELECT match_location_key AS location_key,
              min(violation_code) AS violation_code,
              min(violation_county) AS violation_county,
              min(street_name) AS street_name,
              min(intersecting_street) AS intersecting_street,
              min(street_code1) AS street_code1,
              min(house_number) AS house_number,
              count(*) AS event_count
         FROM local_parking_violation
        WHERE violation_code != 5
          AND match_location_key IS NOT NULL
          AND street_code1 IS NOT NULL
          AND house_number IS NOT NULL
        GROUP BY match_location_key
        ORDER BY event_count DESC
        ${limit === undefined ? "" : "LIMIT ?"}`,
    )
    .all(...(limit === undefined ? [] : [limit]));
}

export function insertParkingViolationMatch(
  sqlite: Database,
  match: ParkingViolationMatchInsert,
  computedAt: string,
): void {
  const weightBase =
    match.matchKind === "street_code_house_range"
      ? match.confidence === "high"
        ? 0.9
        : match.confidence === "medium"
          ? 0.6
          : 0.3
      : (CAMERA_CONFIDENCE_WEIGHT[match.matchKind] ?? 0.3);
  const insert = sqlite.prepare(
    `INSERT INTO local_parking_violation_match
       (location_key, match_rank, match_kind, confidence, violation_code,
        violation_county, street_name, intersecting_street, physical_id, route_id,
        candidate_count, route_fanout, match_weight, event_count, matched_at,
        evidence_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  sqlite.exec("BEGIN");
  try {
    let rank = 1;
    const candidateCount = Math.max(1, match.candidateCount);
    for (const route of match.routes) {
      insert.run(
        match.locationKey,
        rank,
        match.matchKind,
        match.confidence,
        match.violationCode,
        match.violationCounty,
        match.streetName,
        match.intersectingStreet,
        route.physicalId,
        route.routeId,
        candidateCount,
        route.routeFanout,
        weightBase / candidateCount,
        match.eventCount,
        computedAt,
        JSON.stringify({
          ...match.evidence,
          routeOverlapMeters: route.overlapMeters,
          routeBufferMeters: route.bufferMeters,
        }),
      );
      rank += 1;
    }
    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}

export function listParkingViolationLionSegments(
  sqlite: Database,
  b5sc: string,
  boroughCode: string,
): ParkingViolationLionSegment[] {
  return sqlite
    .query<ParkingViolationLionSegment, [string, string]>(
      `SELECT physical_id,
              street_name,
              borough_code,
              l_low_hn,
              l_high_hn,
              r_low_hn,
              r_high_hn
         FROM local_lion_segment
        WHERE street_code_master = ?
          AND (borough_code IS NULL OR borough_code = ?)`,
    )
    .all(b5sc, boroughCode);
}

export function loadParkingViolationRoutesForPhysicalIds(
  sqlite: Database,
  physicalIds: readonly string[],
  cache: Map<string, ParkingViolationRouteCandidate[]> = new Map(),
): ParkingViolationRouteCandidate[] {
  const output: ParkingViolationRouteCandidate[] = [];
  for (const physicalId of new Set(physicalIds)) {
    let rows = cache.get(physicalId);
    if (!rows) {
      rows = sqlite
        .query<
          {
            route_id: string;
            overlap_meters: number | null;
            buffer_meters: number | null;
            route_fanout: number;
          },
          [string, string]
        >(
          `WITH fanout AS (
             SELECT physical_id, count(*) AS route_fanout
               FROM local_route_lion_link
              WHERE physical_id = ?
              GROUP BY physical_id
           )
           SELECT l.route_id,
                  l.overlap_meters,
                  l.buffer_meters,
                  f.route_fanout
             FROM local_route_lion_link l
             JOIN fanout f ON f.physical_id = l.physical_id
            WHERE l.physical_id = ?
            ORDER BY l.route_id`,
        )
        .all(physicalId, physicalId)
        .map((row) => ({
          physicalId,
          routeId: row.route_id,
          overlapMeters: row.overlap_meters,
          bufferMeters: row.buffer_meters,
          routeFanout: row.route_fanout,
        }));
      cache.set(physicalId, rows);
    }
    output.push(...rows);
  }
  return output.sort((a, b) =>
    a.routeId === b.routeId
      ? a.physicalId.localeCompare(b.physicalId)
      : a.routeId.localeCompare(b.routeId),
  );
}

export function buildParkingViolationStreetRouteIndex(
  sqlite: Database,
): Map<string, ParkingViolationRouteCandidate[]> {
  const rows = sqlite
    .query<
      {
        route_id: string;
        physical_id: string;
        overlap_meters: number | null;
        buffer_meters: number | null;
        street_name: string | null;
        borough_code: string | null;
        route_fanout: number;
      },
      []
    >(
      `WITH fanout AS (
         SELECT physical_id, count(*) AS route_fanout
           FROM local_route_lion_link
          GROUP BY physical_id
       )
       SELECT l.route_id,
              l.physical_id,
              l.overlap_meters,
              l.buffer_meters,
              coalesce(s.street_name, l.street_name) AS street_name,
              coalesce(s.borough_code, s.borough) AS borough_code,
              f.route_fanout
         FROM local_route_lion_link l
         JOIN local_lion_segment s ON s.physical_id = l.physical_id
         JOIN fanout f ON f.physical_id = l.physical_id
        WHERE coalesce(s.street_name, l.street_name) IS NOT NULL`,
    )
    .all();
  const index = new Map<string, ParkingViolationRouteCandidate[]>();
  for (const row of rows) {
    const key = streetCorridorKey({
      boroughCode: row.borough_code,
      streetName: row.street_name,
    });
    if (!key) continue;
    const list = index.get(key) ?? [];
    list.push({
      physicalId: row.physical_id,
      routeId: row.route_id,
      overlapMeters: row.overlap_meters,
      bufferMeters: row.buffer_meters,
      routeFanout: row.route_fanout,
    });
    index.set(key, list);
  }
  return index;
}

export function parkingViolationCameraGeocodeRequest(
  group: ParkingViolationMatchGroup,
): ParkingViolationCameraGeocodeRequest | null {
  const parsed = parseParkingCameraLocation({
    streetName: group.street_name,
    intersectingStreet: group.intersecting_street,
  });
  const boroughCode = canonicalParkingBoroughCode(group.violation_county);
  if (!parsed?.crossStreet || !boroughCode) return null;
  return {
    crossStreetOne: parsed.primaryStreet,
    crossStreetTwo: parsed.crossStreet,
    borough: group.violation_county ?? boroughCode,
  };
}

export function resolveParkingViolationCameraMatch(args: {
  sqlite: Database;
  group: ParkingViolationMatchGroup;
  geocodeOutcome?: ParkingViolationCameraGeocodeOutcome | null;
  physicalRouteCache: Map<string, ParkingViolationRouteCandidate[]>;
  streetRouteIndex: Map<string, ParkingViolationRouteCandidate[]>;
}): ParkingViolationMatchInsert | null {
  const parsed = parseParkingCameraLocation({
    streetName: args.group.street_name,
    intersectingStreet: args.group.intersecting_street,
  });
  const boroughCode = canonicalParkingBoroughCode(args.group.violation_county);
  if (!parsed || !boroughCode) return null;

  if (parsed.crossStreet) {
    const physicalId = args.geocodeOutcome?.physicalId ?? null;
    const outcomeConfidence = args.geocodeOutcome?.confidence ?? "";
    const isGeoclientMatch =
      physicalId !== null &&
      (outcomeConfidence.startsWith("geoclient_intersection") ||
        outcomeConfidence.startsWith("geoclient_latlng_snap") ||
        outcomeConfidence.startsWith("latlng_snap"));
    if (isGeoclientMatch) {
      const routes = loadParkingViolationRoutesForPhysicalIds(
        args.sqlite,
        [physicalId],
        args.physicalRouteCache,
      );
      if (routes.length > 0) {
        const kind =
          outcomeConfidence.startsWith("latlng_snap") ||
          outcomeConfidence.startsWith("geoclient_latlng_snap")
            ? "camera_intersection_snap"
            : "camera_intersection_geoclient";
        return {
          locationKey: args.group.location_key,
          matchKind: kind,
          confidence: routes.length <= 3 ? "high" : "medium",
          violationCode: args.group.violation_code,
          violationCounty: args.group.violation_county,
          streetName: args.group.street_name,
          intersectingStreet: args.group.intersecting_street,
          candidateCount: routes.length,
          eventCount: args.group.event_count,
          evidence: {
            parser: parsed,
            outcomeConfidence,
            physicalId,
          },
          routes,
        };
      }
    }
    return null;
  }

  const corridorKey = streetCorridorKey({
    boroughCode,
    streetName: parsed.primaryStreet,
  });
  const routes = corridorKey ? (args.streetRouteIndex.get(corridorKey) ?? []) : [];
  if (routes.length === 0 || routes.length > 25) return null;
  return {
    locationKey: args.group.location_key,
    matchKind: "camera_street_corridor",
    confidence: "low",
    violationCode: args.group.violation_code,
    violationCounty: args.group.violation_county,
    streetName: args.group.street_name,
    intersectingStreet: args.group.intersecting_street,
    candidateCount: routes.length,
    eventCount: args.group.event_count,
    evidence: {
      parser: parsed,
      fallback: "route_corridor_primary_street",
      evidenceHash: stableMatchEvidenceHash({ corridorKey, count: routes.length }),
    },
    routes,
  };
}

export function resolveParkingViolationStreetCodeHouseMatch(args: {
  sqlite: Database;
  group: ParkingViolationMatchGroup;
  lionStreetCache: Map<string, ParkingViolationLionSegment[]>;
  physicalRouteCache: Map<string, ParkingViolationRouteCandidate[]>;
}): ParkingViolationMatchInsert | null {
  const boroughCode = canonicalParkingBoroughCode(args.group.violation_county);
  const streetCode = args.group.location_key.split("|")[2];
  const houseNumber = numericHouseNumber(args.group.house_number);
  if (!boroughCode || !streetCode || houseNumber === null) return null;

  const b5sc = `${boroughCode}${streetCode}`;
  let segments = args.lionStreetCache.get(b5sc);
  if (!segments) {
    segments = listParkingViolationLionSegments(args.sqlite, b5sc, boroughCode);
    args.lionStreetCache.set(b5sc, segments);
  }
  const physicalIds = segments
    .filter((segment) => parkingHouseNumberFallsInSegment(houseNumber, segment))
    .map((segment) => segment.physical_id);
  if (physicalIds.length === 0) return null;
  const routes = loadParkingViolationRoutesForPhysicalIds(
    args.sqlite,
    physicalIds,
    args.physicalRouteCache,
  );
  if (routes.length === 0) return null;
  const confidence = physicalIds.length <= 2 ? "high" : physicalIds.length <= 6 ? "medium" : "low";
  return {
    locationKey: args.group.location_key,
    matchKind: "street_code_house_range",
    confidence,
    violationCode: args.group.violation_code,
    violationCounty: args.group.violation_county,
    streetName: args.group.street_name,
    intersectingStreet: args.group.intersecting_street,
    candidateCount: routes.length,
    eventCount: args.group.event_count,
    evidence: {
      b5sc,
      houseNumber,
      physicalCandidateCount: physicalIds.length,
      normalizedStreetName: normalizeParkingStreetName(args.group.street_name),
    },
    routes,
  };
}

export async function runBuildParkingViolationMatchesLocalDb(args: {
  sqlite: Database;
  computedAt: string;
  maxCameraGroups?: number | undefined;
  maxAddressGroups?: number | undefined;
  geocodeCameraIntersection?: ParkingViolationCameraGeocode | undefined;
}): Promise<BuildParkingViolationMatchesLocalDbResult> {
  let cameraGroupsScanned = 0;
  let addressGroupsScanned = 0;
  clearParkingViolationMatches(args.sqlite);

  const physicalRouteCache = new Map<string, ParkingViolationRouteCandidate[]>();
  const streetRouteIndex = buildParkingViolationStreetRouteIndex(args.sqlite);
  const lionStreetCache = new Map<string, ParkingViolationLionSegment[]>();

  for (const group of listParkingViolationCameraGroups(args.sqlite, args.maxCameraGroups)) {
    cameraGroupsScanned += 1;
    const geocodeRequest = parkingViolationCameraGeocodeRequest(group);
    const geocodeOutcome =
      geocodeRequest && args.geocodeCameraIntersection
        ? await args.geocodeCameraIntersection(geocodeRequest)
        : null;
    const match = resolveParkingViolationCameraMatch({
      sqlite: args.sqlite,
      group,
      geocodeOutcome,
      physicalRouteCache,
      streetRouteIndex,
    });
    if (match) insertParkingViolationMatch(args.sqlite, match, args.computedAt);
  }

  for (const group of listParkingViolationAddressGroups(args.sqlite, args.maxAddressGroups)) {
    addressGroupsScanned += 1;
    const match = resolveParkingViolationStreetCodeHouseMatch({
      sqlite: args.sqlite,
      group,
      lionStreetCache,
      physicalRouteCache,
    });
    if (match) insertParkingViolationMatch(args.sqlite, match, args.computedAt);
  }

  return {
    cameraGroupsScanned,
    addressGroupsScanned,
  };
}

function parkingHouseNumberFallsInSegment(
  houseNumber: number,
  segment: ParkingViolationLionSegment,
): boolean {
  return (
    parkingHouseNumberFallsInRange(houseNumber, segment.l_low_hn, segment.l_high_hn) ||
    parkingHouseNumberFallsInRange(houseNumber, segment.r_low_hn, segment.r_high_hn)
  );
}

function parkingHouseNumberFallsInRange(
  houseNumber: number,
  lowRaw: string | null,
  highRaw: string | null,
): boolean {
  const low = numericHouseNumber(lowRaw);
  const high = numericHouseNumber(highRaw);
  if (low === null || high === null) return false;
  const min = Math.min(low, high);
  const max = Math.max(low, high);
  if (houseNumber < min || houseNumber > max) return false;
  const lowParity = low % 2;
  const highParity = high % 2;
  return lowParity !== highParity || houseNumber % 2 === lowParity;
}

export function summarizeParkingViolationMatches(
  sqlite: Database,
): ParkingViolationMatchAuditSummary {
  const summary = sqlite
    .query<
      {
        match_rows: number;
        matched_location_groups: number;
        represented_events: number;
        route_count: number;
      },
      []
    >(
      `WITH location_events AS (
         SELECT location_key, max(event_count) AS event_count
           FROM local_parking_violation_match
          GROUP BY location_key
       )
       SELECT (SELECT count(*) FROM local_parking_violation_match) AS match_rows,
              (SELECT count(*) FROM location_events) AS matched_location_groups,
              coalesce((SELECT sum(event_count) FROM location_events), 0)
                AS represented_events,
              (SELECT count(DISTINCT route_id) FROM local_parking_violation_match)
                AS route_count`,
    )
    .get() ?? {
    match_rows: 0,
    matched_location_groups: 0,
    represented_events: 0,
    route_count: 0,
  };

  const byMatchKind = sqlite
    .query<{ match_kind: string; confidence: string; rows: number; events: number }, []>(
      `WITH location_events AS (
         SELECT match_kind,
                confidence,
                location_key,
                count(*) AS rows,
                max(event_count) AS events
           FROM local_parking_violation_match
          GROUP BY match_kind, confidence, location_key
       )
       SELECT match_kind,
              confidence,
              sum(rows) AS rows,
              coalesce(sum(events), 0) AS events
         FROM location_events
        GROUP BY match_kind, confidence
        ORDER BY events DESC, match_kind, confidence`,
    )
    .all()
    .map((row) => ({
      matchKind: row.match_kind,
      confidence: row.confidence,
      rows: row.rows,
      events: row.events,
    }));

  return {
    matchRows: summary.match_rows,
    matchedLocationGroups: summary.matched_location_groups,
    representedEvents: summary.represented_events,
    routeCount: summary.route_count,
    byMatchKind,
  };
}

export function buildParkingViolationMatchAuditArtifact(input: {
  generatedAt: string;
  counts: ParkingViolationMatchRunCounts;
  summary: ParkingViolationMatchAuditSummary;
}): ParkingViolationMatchAuditArtifact {
  return {
    artifactKind: "parking_violation_match_audit",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    summary: {
      ...input.counts,
      matchRows: input.summary.matchRows,
      matchedLocationGroups: input.summary.matchedLocationGroups,
      representedEvents: input.summary.representedEvents,
      routeCount: input.summary.routeCount,
    },
    byMatchKind: input.summary.byMatchKind,
  };
}

function textValue(input: unknown): string | null {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof input === "number" && Number.isFinite(input)) return String(input);
  return null;
}

function numberValue(input: unknown): number | null {
  const value = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  return Number.isFinite(value) ? Math.round(value) : null;
}
