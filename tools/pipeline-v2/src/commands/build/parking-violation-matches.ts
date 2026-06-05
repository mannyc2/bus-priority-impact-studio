import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Geoclient } from "@bp/sources/clients/geoclient";
import { canonicalBoroughCode, normalizeStreetName } from "@bp/sources/clients/geoclient";
import { arg, defineCommand, z } from "@liche/core";
import { createGeoclientFromEnv, Geocoder } from "../../lib/geocoder.ts";
import { writeJson } from "../../lib/json.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import {
  numericHouseNumber,
  parkingLocationKey,
  parseParkingCameraLocation,
  stableMatchEvidenceHash,
  streetCorridorKey,
} from "../../lib/parking-location.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

export type BuildParkingViolationMatchesInputs = {
  local: OpenLocalPipelineDb;
  artifactRoot?: string | undefined;
  output?: string | undefined;
  hydrateRawFields?: boolean | undefined;
  rawParkingDir?: string | undefined;
  rawLionPath?: string | undefined;
  skipGeoclient?: boolean | undefined;
  maxCameraGroups?: number | undefined;
  maxAddressGroups?: number | undefined;
  computedAt?: Date | undefined;
  geoclient?: Geoclient | null | undefined;
  auditOnly?: boolean | undefined;
};

export type BuildParkingViolationMatchesResult = {
  computedAt: string;
  auditArtifactPath: string;
  hydratedParkingRows: number;
  hydratedLionRows: number;
  refreshedLocationKeyRows: number;
  cameraGroupsScanned: number;
  addressGroupsScanned: number;
  matchRows: number;
  matchedLocationGroups: number;
  representedEvents: number;
  routeCount: number;
  byMatchKind: Array<{ matchKind: string; confidence: string; rows: number; events: number }>;
};

type ParkingGroup = {
  location_key: string;
  violation_code: number;
  violation_county: string | null;
  street_name: string | null;
  intersecting_street: string | null;
  street_code1: string | null;
  house_number: string | null;
  event_count: number;
};

type LionSegment = {
  physical_id: string;
  street_name: string | null;
  borough_code: string | null;
  l_low_hn: string | null;
  l_high_hn: string | null;
  r_low_hn: string | null;
  r_high_hn: string | null;
};

type RouteCandidate = {
  physicalId: string;
  routeId: string;
  overlapMeters: number | null;
  bufferMeters: number | null;
  routeFanout: number;
};

type MatchInsert = {
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
  routes: RouteCandidate[];
};

type RawParkingRow = {
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

type RawLionRow = {
  physicalid?: unknown;
  b5sc?: unknown;
  boroughcode?: unknown;
  borough_indicator?: unknown;
  l_low_hn?: unknown;
  l_high_hn?: unknown;
  r_low_hn?: unknown;
  r_high_hn?: unknown;
};

const CAMERA_CONFIDENCE_WEIGHT: Record<string, number> = {
  camera_intersection_geoclient: 1,
  camera_intersection_snap: 0.85,
  camera_street_corridor: 0.2,
};

export function parkingViolationMatchAuditPath(artifactRoot: string): string {
  return join(artifactRoot, "context-events", "parking-violation-match-audit.json");
}

export async function runBuildParkingViolationMatches(
  inputs: BuildParkingViolationMatchesInputs,
): Promise<BuildParkingViolationMatchesResult> {
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();
  const auditArtifactPath = inputs.output ?? parkingViolationMatchAuditPath(artifactRoot);
  const computedAt = (inputs.computedAt ?? new Date()).toISOString();
  const { local } = inputs;

  let hydratedParkingRows = 0;
  let hydratedLionRows = 0;
  let refreshedLocationKeyRows = 0;
  let cameraGroupsScanned = 0;
  let addressGroupsScanned = 0;

  if (inputs.auditOnly === true) {
    cameraGroupsScanned = countLocationGroups(local, "camera");
    addressGroupsScanned = countLocationGroups(local, "street_code_house");
  } else {
    if (inputs.hydrateRawFields === true) {
      hydratedLionRows = await hydrateLionRawFields(local, inputs.rawLionPath);
      hydratedParkingRows = await hydrateParkingRawFields(local, inputs.rawParkingDir);
    }

    const existingLocationKeys =
      local.sqlite
        .query<{ n: number }, []>(
          "SELECT count(*) AS n FROM local_parking_violation WHERE match_location_key IS NOT NULL",
        )
        .get()?.n ?? 0;
    refreshedLocationKeyRows =
      inputs.hydrateRawFields === true || existingLocationKeys > 0
        ? 0
        : refreshParkingLocationKeys(local);
    local.sqlite.exec("DELETE FROM local_parking_violation_match");

    const geoclient =
      inputs.skipGeoclient === true
        ? null
        : inputs.geoclient === undefined
          ? createGeoclientFromEnv()
          : inputs.geoclient;
    const geocoder = new Geocoder({
      db: local.db,
      sqlite: local.sqlite,
      sourceLabel: "nyc_parking_camera_location",
      geoclient,
    });

    const physicalRouteCache = new Map<string, RouteCandidate[]>();
    const streetRouteIndex = buildStreetRouteIndex(local);
    const lionStreetCache = new Map<string, LionSegment[]>();

    for (const group of listCameraGroups(local, inputs.maxCameraGroups)) {
      cameraGroupsScanned += 1;
      const match = await resolveCameraGroup({
        local,
        group,
        geocoder,
        physicalRouteCache,
        streetRouteIndex,
      });
      if (match) insertMatch(local, match, computedAt);
    }

    for (const group of listAddressGroups(local, inputs.maxAddressGroups)) {
      addressGroupsScanned += 1;
      const match = resolveStreetCodeHouseGroup({
        local,
        group,
        lionStreetCache,
        physicalRouteCache,
      });
      if (match) insertMatch(local, match, computedAt);
    }
  }

  const summary = local.sqlite
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

  const byMatchKind = local.sqlite
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

  const result: BuildParkingViolationMatchesResult = {
    computedAt,
    auditArtifactPath,
    hydratedParkingRows,
    hydratedLionRows,
    refreshedLocationKeyRows,
    cameraGroupsScanned,
    addressGroupsScanned,
    matchRows: summary.match_rows,
    matchedLocationGroups: summary.matched_location_groups,
    representedEvents: summary.represented_events,
    routeCount: summary.route_count,
    byMatchKind,
  };

  await mkdir(dirname(auditArtifactPath), { recursive: true });
  await writeJson(auditArtifactPath, {
    artifactKind: "parking_violation_match_audit",
    schemaVersion: 1,
    generatedAt: computedAt,
    summary: {
      hydratedParkingRows: result.hydratedParkingRows,
      hydratedLionRows: result.hydratedLionRows,
      refreshedLocationKeyRows: result.refreshedLocationKeyRows,
      cameraGroupsScanned: result.cameraGroupsScanned,
      addressGroupsScanned: result.addressGroupsScanned,
      matchRows: result.matchRows,
      matchedLocationGroups: result.matchedLocationGroups,
      representedEvents: result.representedEvents,
      routeCount: result.routeCount,
    },
    byMatchKind: result.byMatchKind,
  });

  return result;
}

async function hydrateParkingRawFields(
  local: OpenLocalPipelineDb,
  rawParkingDir = fromRepoRoot(join("data/raw/parking-violations")),
): Promise<number> {
  const entries = (await readdir(rawParkingDir))
    .filter((entry) => entry.startsWith("parking-violations-") && entry.endsWith(".json"))
    .sort();
  const update = local.sqlite.prepare(
    `UPDATE local_parking_violation
        SET street_code1 = ?,
            street_code2 = ?,
            street_code3 = ?,
            intersecting_street = ?,
            match_location_key = ?
      WHERE summons_number = ?`,
  );
  let changed = 0;
  for (const entry of entries) {
    const path = join(rawParkingDir, entry);
    const snapshot = await Bun.file(path).json();
    const rows = snapshotRows<RawParkingRow>(snapshot);
    local.sqlite.exec("BEGIN");
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
      local.sqlite.exec("COMMIT");
    } catch (err) {
      local.sqlite.exec("ROLLBACK");
      throw err;
    }
  }
  return changed;
}

async function hydrateLionRawFields(
  local: OpenLocalPipelineDb,
  rawLionPath?: string,
): Promise<number> {
  const path = rawLionPath ?? (await latestLionRawPath());
  const snapshot = await Bun.file(path).json();
  const rows = snapshotRows<RawLionRow>(snapshot);
  const update = local.sqlite.prepare(
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
  local.sqlite.exec("BEGIN");
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
    local.sqlite.exec("COMMIT");
  } catch (err) {
    local.sqlite.exec("ROLLBACK");
    throw err;
  }
  return changed;
}

function refreshParkingLocationKeys(local: OpenLocalPipelineDb): number {
  const groups = local.sqlite
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
  const update = local.sqlite.prepare(
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
  local.sqlite.exec("BEGIN");
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
    local.sqlite.exec("COMMIT");
  } catch (err) {
    local.sqlite.exec("ROLLBACK");
    throw err;
  }
  return changed;
}

function listCameraGroups(local: OpenLocalPipelineDb, limit?: number): ParkingGroup[] {
  return local.sqlite
    .query<ParkingGroup, [number] | []>(
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

function listAddressGroups(local: OpenLocalPipelineDb, limit?: number): ParkingGroup[] {
  return local.sqlite
    .query<ParkingGroup, [number] | []>(
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

function countLocationGroups(local: OpenLocalPipelineDb, prefix: string): number {
  return (
    local.sqlite
      .query<{ n: number }, [string]>(
        `SELECT count(DISTINCT match_location_key) AS n
           FROM local_parking_violation
          WHERE match_location_key LIKE ?`,
      )
      .get(`${prefix}|%`)?.n ?? 0
  );
}

async function resolveCameraGroup(args: {
  local: OpenLocalPipelineDb;
  group: ParkingGroup;
  geocoder: Geocoder;
  physicalRouteCache: Map<string, RouteCandidate[]>;
  streetRouteIndex: Map<string, RouteCandidate[]>;
}): Promise<MatchInsert | null> {
  const parsed = parseParkingCameraLocation({
    streetName: args.group.street_name,
    intersectingStreet: args.group.intersecting_street,
  });
  const boroughCode = canonicalBoroughCode(args.group.violation_county);
  if (!parsed || !boroughCode) return null;

  if (parsed.crossStreet) {
    const outcome = await args.geocoder.resolve({
      kind: "intersection",
      crossStreetOne: parsed.primaryStreet,
      crossStreetTwo: parsed.crossStreet,
      borough: args.group.violation_county ?? boroughCode,
    });
    const physicalId = outcome.physicalId;
    const isGeoclientMatch =
      physicalId !== null &&
      (outcome.confidence.startsWith("geoclient_intersection") ||
        outcome.confidence.startsWith("geoclient_latlng_snap") ||
        outcome.confidence.startsWith("latlng_snap"));
    if (isGeoclientMatch) {
      const routes = routesForPhysicalIds(args.local, [physicalId], args.physicalRouteCache);
      if (routes.length > 0) {
        const kind =
          outcome.confidence.startsWith("latlng_snap") ||
          outcome.confidence.startsWith("geoclient_latlng_snap")
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
            outcomeConfidence: outcome.confidence,
            physicalId: outcome.physicalId,
          },
          routes,
        };
      }
    }
  }

  if (parsed.crossStreet) return null;

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

function resolveStreetCodeHouseGroup(args: {
  local: OpenLocalPipelineDb;
  group: ParkingGroup;
  lionStreetCache: Map<string, LionSegment[]>;
  physicalRouteCache: Map<string, RouteCandidate[]>;
}): MatchInsert | null {
  const boroughCode = canonicalBoroughCode(args.group.violation_county);
  const streetCode = args.group.location_key.split("|")[2];
  const houseNumber = numericHouseNumber(args.group.house_number);
  if (!boroughCode || !streetCode || houseNumber === null) return null;

  const b5sc = `${boroughCode}${streetCode}`;
  let segments = args.lionStreetCache.get(b5sc);
  if (!segments) {
    segments = args.local.sqlite
      .query<LionSegment, [string, string]>(
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
    args.lionStreetCache.set(b5sc, segments);
  }
  const physicalIds = segments
    .filter((segment) => houseNumberFallsInSegment(houseNumber, segment))
    .map((segment) => segment.physical_id);
  if (physicalIds.length === 0) return null;
  const routes = routesForPhysicalIds(args.local, physicalIds, args.physicalRouteCache);
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
      normalizedStreetName: normalizeStreetName(args.group.street_name),
    },
    routes,
  };
}

function routesForPhysicalIds(
  local: OpenLocalPipelineDb,
  physicalIds: readonly string[],
  cache: Map<string, RouteCandidate[]>,
): RouteCandidate[] {
  const output: RouteCandidate[] = [];
  for (const physicalId of new Set(physicalIds)) {
    let rows = cache.get(physicalId);
    if (!rows) {
      rows = local.sqlite
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

function buildStreetRouteIndex(local: OpenLocalPipelineDb): Map<string, RouteCandidate[]> {
  const rows = local.sqlite
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
  const index = new Map<string, RouteCandidate[]>();
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

function insertMatch(local: OpenLocalPipelineDb, match: MatchInsert, computedAt: string): void {
  const weightBase =
    match.matchKind === "street_code_house_range"
      ? match.confidence === "high"
        ? 0.9
        : match.confidence === "medium"
          ? 0.6
          : 0.3
      : (CAMERA_CONFIDENCE_WEIGHT[match.matchKind] ?? 0.3);
  const insert = local.sqlite.prepare(
    `INSERT INTO local_parking_violation_match
       (location_key, match_rank, match_kind, confidence, violation_code,
        violation_county, street_name, intersecting_street, physical_id, route_id,
        candidate_count, route_fanout, match_weight, event_count, matched_at,
        evidence_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  local.sqlite.exec("BEGIN");
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
    local.sqlite.exec("COMMIT");
  } catch (err) {
    local.sqlite.exec("ROLLBACK");
    throw err;
  }
}

function houseNumberFallsInSegment(houseNumber: number, segment: LionSegment): boolean {
  return (
    houseNumberFallsInRange(houseNumber, segment.l_low_hn, segment.l_high_hn) ||
    houseNumberFallsInRange(houseNumber, segment.r_low_hn, segment.r_high_hn)
  );
}

function houseNumberFallsInRange(
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

async function latestLionRawPath(): Promise<string> {
  const dir = fromRepoRoot(join("data/raw/lion-centerline"));
  const entries = (await readdir(dir))
    .filter((entry) => entry.startsWith("lion-centerline-") && entry.endsWith(".json"))
    .sort();
  const latest = entries[entries.length - 1];
  if (!latest) throw new Error(`No lion-centerline raw snapshot found in ${dir}.`);
  return join(dir, latest);
}

function snapshotRows<T>(snapshot: unknown): T[] {
  if (Array.isArray(snapshot)) return snapshot as T[];
  if (
    snapshot &&
    typeof snapshot === "object" &&
    Array.isArray((snapshot as { rows?: unknown }).rows)
  ) {
    return (snapshot as { rows: T[] }).rows;
  }
  return [];
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

export default defineCommand({
  path: ["build", "parking-violation-matches"],
  summary: "Resolve parking-violation location groups to route candidates via LION + Geoclient.",
  input: {
    options: dbOptions.extend({
      artifactRoot: z.string().optional().describe("Artifact root (defaults to data/artifacts/)"),
      output: z.string().optional().describe("Override path for the audit JSON"),
      rawParkingDir: z.string().optional().describe("Raw parking-violations snapshot directory"),
      rawLion: z.string().optional().describe("Raw lion-centerline snapshot path"),
      hydrateRawFields: arg
        .boolean()
        .default(false)
        .describe("Re-hydrate parking + LION raw fields from snapshots"),
      skipGeoclient: arg
        .boolean()
        .default(false)
        .describe("Disable Geoclient (rely on cache + LION snap only)"),
      maxCameraGroups: arg.positiveInt().optional().describe("Cap camera groups scanned"),
      maxAddressGroups: arg.positiveInt().optional().describe("Cap address groups scanned"),
      auditOnly: arg
        .boolean()
        .default(false)
        .describe("Skip rebuild; just recount the current match table"),
    }),
  },
  middleware: [withLocalDb({ spatial: true })],
  output: z.object({
    computedAt: z.string(),
    auditArtifactPath: z.string(),
    hydratedParkingRows: z.number(),
    hydratedLionRows: z.number(),
    refreshedLocationKeyRows: z.number(),
    cameraGroupsScanned: z.number(),
    addressGroupsScanned: z.number(),
    matchRows: z.number(),
    matchedLocationGroups: z.number(),
    representedEvents: z.number(),
    routeCount: z.number(),
    byMatchKind: z.array(z.unknown()),
  }),
  async run({ ctx, input }) {
    return runBuildParkingViolationMatches({
      local: localDbFromCtx(ctx),
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
      output: input.options.output === undefined ? undefined : fromCliPath(input.options.output),
      rawParkingDir:
        input.options.rawParkingDir === undefined
          ? undefined
          : fromCliPath(input.options.rawParkingDir),
      rawLionPath:
        input.options.rawLion === undefined ? undefined : fromCliPath(input.options.rawLion),
      hydrateRawFields: input.options.hydrateRawFields,
      skipGeoclient: input.options.skipGeoclient,
      maxCameraGroups: input.options.maxCameraGroups,
      maxAddressGroups: input.options.maxAddressGroups,
      auditOnly: input.options.auditOnly,
    });
  },
});
