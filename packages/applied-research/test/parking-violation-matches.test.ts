import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import {
  buildParkingViolationMatchAuditArtifact,
  buildParkingViolationStreetRouteIndex,
  clearParkingViolationMatches,
  countParkingViolationLocationGroups,
  hydrateParkingViolationLionRawFields,
  hydrateParkingViolationRawFields,
  insertParkingViolationMatch,
  listParkingViolationAddressGroups,
  listParkingViolationCameraGroups,
  listParkingViolationLionSegments,
  loadParkingViolationRoutesForPhysicalIds,
  parkingViolationCameraGeocodeRequest,
  refreshParkingViolationLocationKeys,
  resolveParkingViolationCameraMatch,
  resolveParkingViolationStreetCodeHouseMatch,
  runBuildParkingViolationMatchesLocalDb,
  summarizeParkingViolationMatches,
} from "../src/local-db";

describe("parking violation match audit summaries", () => {
  let sqlite: Database | null = null;

  afterEach(() => {
    sqlite?.close();
    sqlite = null;
  });

  function openDb(): Database {
    sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE local_parking_violation_match (
        location_key TEXT NOT NULL,
        match_rank INTEGER,
        match_kind TEXT NOT NULL,
        confidence TEXT NOT NULL,
        violation_code INTEGER,
        violation_county TEXT,
        street_name TEXT,
        intersecting_street TEXT,
        physical_id TEXT,
        route_id TEXT NOT NULL,
        candidate_count INTEGER,
        route_fanout INTEGER,
        match_weight REAL,
        event_count INTEGER NOT NULL,
        matched_at TEXT,
        evidence_json TEXT
      );
    `);
    return sqlite;
  }

  test("summarizes match coverage and match-kind event counts", () => {
    const db = openDb();
    db.exec(`
      INSERT INTO local_parking_violation_match
        (location_key, match_kind, confidence, route_id, event_count)
      VALUES
        ('camera:1', 'camera_intersection_geoclient', 'high', 'M15', 7),
        ('camera:1', 'camera_intersection_geoclient', 'high', 'M15-SBS', 7),
        ('camera:2', 'camera_street_corridor', 'low', 'B44', 3),
        ('camera:2', 'camera_street_corridor', 'low', 'B44-SBS', 3),
        ('camera:3', 'camera_intersection_geoclient', 'high', 'M15', 11);
    `);

    expect(summarizeParkingViolationMatches(db)).toEqual({
      matchRows: 5,
      matchedLocationGroups: 3,
      representedEvents: 21,
      routeCount: 4,
      byMatchKind: [
        {
          matchKind: "camera_intersection_geoclient",
          confidence: "high",
          rows: 3,
          events: 18,
        },
        {
          matchKind: "camera_street_corridor",
          confidence: "low",
          rows: 2,
          events: 3,
        },
      ],
    });
  });

  test("counts distinct parking location groups by location-key prefix", () => {
    const db = openDb();
    db.exec(`
      CREATE TABLE local_parking_violation (
        match_location_key TEXT
      );

      INSERT INTO local_parking_violation (match_location_key)
      VALUES
        ('camera|mn|main|1'),
        ('camera|mn|main|1'),
        ('camera|bk|broadway|2'),
        ('street_code_house|mn|123|10'),
        (NULL);
    `);

    expect(countParkingViolationLocationGroups(db, "camera")).toBe(2);
    expect(countParkingViolationLocationGroups(db, "street_code_house")).toBe(1);
    expect(countParkingViolationLocationGroups(db, "unknown")).toBe(0);
  });

  test("refreshes location keys and lists camera/address groups", () => {
    const db = openDb();
    db.exec(`
      CREATE TABLE local_parking_violation (
        violation_code INTEGER NOT NULL,
        violation_county TEXT,
        street_code1 TEXT,
        house_number TEXT,
        street_name TEXT,
        intersecting_street TEXT,
        match_location_key TEXT
      );

      INSERT INTO local_parking_violation
        (violation_code, violation_county, street_code1, house_number, street_name, intersecting_street)
      VALUES
        (5, 'NY', NULL, NULL, '1 AVE @ E 14 ST', NULL),
        (5, 'NY', NULL, NULL, '1 AVE @ E 14 ST', NULL),
        (5, 'K', NULL, NULL, 'FLATBUSH AVE', NULL),
        (7, 'NY', '12345', '10', 'MAIN ST', NULL),
        (7, 'NY', '12345', '10', 'MAIN ST', NULL),
        (7, 'NY', NULL, '20', 'NO CODE ST', NULL);
    `);

    expect(refreshParkingViolationLocationKeys(db)).toBe(6);

    const cameraGroups = listParkingViolationCameraGroups(db, 1);
    expect(cameraGroups).toEqual([
      {
        location_key: "camera|1|1 AVE @ E 14 ST|",
        violation_code: 5,
        violation_county: "NY",
        street_name: "1 AVE @ E 14 ST",
        intersecting_street: null,
        street_code1: null,
        house_number: null,
        event_count: 2,
      },
    ]);

    const addressGroups = listParkingViolationAddressGroups(db);
    expect(addressGroups).toEqual([
      {
        location_key: "street_code_house|1|12345|10",
        violation_code: 7,
        violation_county: "NY",
        street_name: "MAIN ST",
        intersecting_street: null,
        street_code1: "12345",
        house_number: "10",
        event_count: 2,
      },
    ]);
  });

  test("hydrates parking and LION raw fields into local match tables", () => {
    const db = openDb();
    db.exec(`
      CREATE TABLE local_parking_violation (
        summons_number TEXT NOT NULL,
        violation_code INTEGER,
        violation_county TEXT,
        street_code1 TEXT,
        street_code2 TEXT,
        street_code3 TEXT,
        house_number TEXT,
        street_name TEXT,
        intersecting_street TEXT,
        match_location_key TEXT
      );

      CREATE TABLE local_lion_segment (
        physical_id TEXT NOT NULL,
        street_code_master TEXT,
        borough_code TEXT,
        borough TEXT,
        l_low_hn TEXT,
        l_high_hn TEXT,
        r_low_hn TEXT,
        r_high_hn TEXT
      );

      INSERT INTO local_parking_violation (summons_number, violation_code)
      VALUES ('A1', 5), ('A2', 7);

      INSERT INTO local_lion_segment (physical_id)
      VALUES ('100'), ('200');
    `);

    expect(
      hydrateParkingViolationRawFields(db, [
        {
          summons_number: "A1",
          violation_code: "5",
          violation_county: "NY",
          street_name: "1 AVE @ E 14 ST",
        },
        {
          summons_number: "A2",
          violation_code: 7,
          violation_county: "NY",
          street_code1: "12345",
          street_code2: "23456",
          street_code3: "34567",
          house_number: "10",
          street_name: "Main St",
          intersecting_street: "Broadway",
        },
      ]),
    ).toBe(2);
    expect(
      db
        .query<
          {
            summons_number: string;
            street_code1: string | null;
            intersecting_street: string | null;
            match_location_key: string | null;
          },
          []
        >(
          `SELECT summons_number, street_code1, intersecting_street, match_location_key
             FROM local_parking_violation
            ORDER BY summons_number`,
        )
        .all(),
    ).toEqual([
      {
        summons_number: "A1",
        street_code1: null,
        intersecting_street: null,
        match_location_key: "camera|1|1 AVE @ E 14 ST|",
      },
      {
        summons_number: "A2",
        street_code1: "12345",
        intersecting_street: "Broadway",
        match_location_key: "street_code_house|1|12345|10",
      },
    ]);

    expect(
      hydrateParkingViolationLionRawFields(db, [
        {
          physicalid: "100",
          b5sc: "112345",
          boroughcode: "1",
          borough_indicator: "MN",
          l_low_hn: "2",
          l_high_hn: "20",
          r_low_hn: "1",
          r_high_hn: "19",
        },
      ]),
    ).toBe(1);
    expect(
      db
        .query<
          {
            physical_id: string;
            street_code_master: string | null;
            borough_code: string | null;
            borough: string | null;
            l_low_hn: string | null;
            r_high_hn: string | null;
          },
          []
        >(
          `SELECT physical_id, street_code_master, borough_code, borough, l_low_hn, r_high_hn
             FROM local_lion_segment
            WHERE physical_id = '100'`,
        )
        .get(),
    ).toEqual({
      physical_id: "100",
      street_code_master: "112345",
      borough_code: "1",
      borough: "MN",
      l_low_hn: "2",
      r_high_hn: "19",
    });
  });

  test("clears and inserts weighted parking violation route matches", () => {
    const db = openDb();
    db.exec(`
      INSERT INTO local_parking_violation_match
        (location_key, match_kind, confidence, route_id, event_count)
      VALUES ('old', 'old', 'low', 'OLD', 1);
    `);

    clearParkingViolationMatches(db);
    insertParkingViolationMatch(
      db,
      {
        locationKey: "camera|1|1 AVE|",
        matchKind: "camera_intersection_snap",
        confidence: "high",
        violationCode: 5,
        violationCounty: "NY",
        streetName: "1 AVE",
        intersectingStreet: null,
        candidateCount: 2,
        eventCount: 9,
        evidence: { parser: { primaryStreet: "1 AVE" } },
        routes: [
          {
            physicalId: "100",
            routeId: "M15",
            overlapMeters: 12.5,
            bufferMeters: 20,
            routeFanout: 2,
          },
          {
            physicalId: "101",
            routeId: "M15-SBS",
            overlapMeters: null,
            bufferMeters: 20,
            routeFanout: 2,
          },
        ],
      },
      "2026-01-02T03:04:05.000Z",
    );

    const rows = db
      .query<
        {
          location_key: string;
          match_rank: number;
          route_id: string;
          match_weight: number;
          evidence_json: string;
        },
        []
      >(
        `SELECT location_key, match_rank, route_id, match_weight, evidence_json
           FROM local_parking_violation_match
          ORDER BY match_rank`,
      )
      .all();

    expect(rows).toEqual([
      {
        location_key: "camera|1|1 AVE|",
        match_rank: 1,
        route_id: "M15",
        match_weight: 0.425,
        evidence_json: JSON.stringify({
          parser: { primaryStreet: "1 AVE" },
          routeOverlapMeters: 12.5,
          routeBufferMeters: 20,
        }),
      },
      {
        location_key: "camera|1|1 AVE|",
        match_rank: 2,
        route_id: "M15-SBS",
        match_weight: 0.425,
        evidence_json: JSON.stringify({
          parser: { primaryStreet: "1 AVE" },
          routeOverlapMeters: null,
          routeBufferMeters: 20,
        }),
      },
    ]);
  });

  test("loads LION segments, physical-id routes, and street route index", () => {
    const db = openDb();
    db.exec(`
      CREATE TABLE local_lion_segment (
        physical_id TEXT NOT NULL,
        street_name TEXT,
        street_code_master TEXT,
        borough_code TEXT,
        borough TEXT,
        l_low_hn TEXT,
        l_high_hn TEXT,
        r_low_hn TEXT,
        r_high_hn TEXT
      );

      CREATE TABLE local_route_lion_link (
        physical_id TEXT NOT NULL,
        route_id TEXT NOT NULL,
        street_name TEXT,
        overlap_meters REAL,
        buffer_meters REAL
      );

      INSERT INTO local_lion_segment
        (physical_id, street_name, street_code_master, borough_code, borough, l_low_hn, l_high_hn, r_low_hn, r_high_hn)
      VALUES
        ('100', 'Main St', '112345', '1', '1', '2', '20', '1', '19'),
        ('101', 'Main St', '112345', NULL, '1', '22', '40', '21', '39'),
        ('200', 'Other St', '212345', '2', '2', '1', '9', '2', '10');

      INSERT INTO local_route_lion_link
        (physical_id, route_id, street_name, overlap_meters, buffer_meters)
      VALUES
        ('100', 'M15', 'Main St', 10.5, 20),
        ('100', 'M15-SBS', 'Main St', 11.5, 20),
        ('101', 'M14', 'Main St', 5, 15),
        ('200', 'BX1', 'Other St', 8, 12);
    `);

    expect(listParkingViolationLionSegments(db, "112345", "1")).toEqual([
      {
        physical_id: "100",
        street_name: "Main St",
        borough_code: "1",
        l_low_hn: "2",
        l_high_hn: "20",
        r_low_hn: "1",
        r_high_hn: "19",
      },
      {
        physical_id: "101",
        street_name: "Main St",
        borough_code: null,
        l_low_hn: "22",
        l_high_hn: "40",
        r_low_hn: "21",
        r_high_hn: "39",
      },
    ]);

    const cache = new Map();
    expect(loadParkingViolationRoutesForPhysicalIds(db, ["100", "100", "101"], cache)).toEqual([
      {
        physicalId: "101",
        routeId: "M14",
        overlapMeters: 5,
        bufferMeters: 15,
        routeFanout: 1,
      },
      {
        physicalId: "100",
        routeId: "M15",
        overlapMeters: 10.5,
        bufferMeters: 20,
        routeFanout: 2,
      },
      {
        physicalId: "100",
        routeId: "M15-SBS",
        overlapMeters: 11.5,
        bufferMeters: 20,
        routeFanout: 2,
      },
    ]);
    expect(cache.has("100")).toBe(true);

    const index = buildParkingViolationStreetRouteIndex(db);
    expect(index.get("1|MAIN STREET")).toEqual([
      {
        physicalId: "100",
        routeId: "M15",
        overlapMeters: 10.5,
        bufferMeters: 20,
        routeFanout: 2,
      },
      {
        physicalId: "100",
        routeId: "M15-SBS",
        overlapMeters: 11.5,
        bufferMeters: 20,
        routeFanout: 2,
      },
      {
        physicalId: "101",
        routeId: "M14",
        overlapMeters: 5,
        bufferMeters: 15,
        routeFanout: 1,
      },
    ]);
  });

  test("resolves street-code-house groups into route matches", () => {
    const db = openDb();
    db.exec(`
      CREATE TABLE local_lion_segment (
        physical_id TEXT NOT NULL,
        street_name TEXT,
        street_code_master TEXT,
        borough_code TEXT,
        borough TEXT,
        l_low_hn TEXT,
        l_high_hn TEXT,
        r_low_hn TEXT,
        r_high_hn TEXT
      );

      CREATE TABLE local_route_lion_link (
        physical_id TEXT NOT NULL,
        route_id TEXT NOT NULL,
        street_name TEXT,
        overlap_meters REAL,
        buffer_meters REAL
      );

      INSERT INTO local_lion_segment
        (physical_id, street_name, street_code_master, borough_code, borough, l_low_hn, l_high_hn, r_low_hn, r_high_hn)
      VALUES
        ('100', 'Main St', '112345', '1', '1', '2', '20', '1', '19'),
        ('101', 'Main St', '112345', '1', '1', '22', '40', '21', '39');

      INSERT INTO local_route_lion_link
        (physical_id, route_id, street_name, overlap_meters, buffer_meters)
      VALUES
        ('100', 'M15', 'Main St', 10.5, 20),
        ('100', 'M15-SBS', 'Main St', 11.5, 20);
    `);

    expect(
      resolveParkingViolationStreetCodeHouseMatch({
        sqlite: db,
        group: {
          location_key: "street_code_house|1|12345|10",
          violation_code: 7,
          violation_county: "NY",
          street_name: "Main St",
          intersecting_street: null,
          street_code1: "12345",
          house_number: "10",
          event_count: 4,
        },
        lionStreetCache: new Map(),
        physicalRouteCache: new Map(),
      }),
    ).toEqual({
      locationKey: "street_code_house|1|12345|10",
      matchKind: "street_code_house_range",
      confidence: "high",
      violationCode: 7,
      violationCounty: "NY",
      streetName: "Main St",
      intersectingStreet: null,
      candidateCount: 2,
      eventCount: 4,
      evidence: {
        b5sc: "112345",
        houseNumber: 10,
        physicalCandidateCount: 1,
        normalizedStreetName: "MAIN STREET",
      },
      routes: [
        {
          physicalId: "100",
          routeId: "M15",
          overlapMeters: 10.5,
          bufferMeters: 20,
          routeFanout: 2,
        },
        {
          physicalId: "100",
          routeId: "M15-SBS",
          overlapMeters: 11.5,
          bufferMeters: 20,
          routeFanout: 2,
        },
      ],
    });
  });

  test("builds camera geocode requests and resolves geocoded intersection matches", () => {
    const db = openDb();
    db.exec(`
      CREATE TABLE local_route_lion_link (
        physical_id TEXT NOT NULL,
        route_id TEXT NOT NULL,
        street_name TEXT,
        overlap_meters REAL,
        buffer_meters REAL
      );

      INSERT INTO local_route_lion_link
        (physical_id, route_id, street_name, overlap_meters, buffer_meters)
      VALUES
        ('100', 'M15', '1 Ave', 10.5, 20),
        ('100', 'M15-SBS', '1 Ave', 11.5, 20);
    `);
    const group = {
      location_key: "camera|1|1 AVE @ E 14 ST|",
      violation_code: 5,
      violation_county: "NY",
      street_name: "1 AVE @ E 14 ST",
      intersecting_street: null,
      street_code1: null,
      house_number: null,
      event_count: 6,
    };

    expect(parkingViolationCameraGeocodeRequest(group)).toEqual({
      crossStreetOne: "1 AVE",
      crossStreetTwo: "E 14 ST",
      borough: "NY",
    });

    expect(
      resolveParkingViolationCameraMatch({
        sqlite: db,
        group,
        geocodeOutcome: {
          physicalId: "100",
          confidence: "geoclient_intersection_exact",
        },
        physicalRouteCache: new Map(),
        streetRouteIndex: new Map(),
      }),
    ).toEqual({
      locationKey: "camera|1|1 AVE @ E 14 ST|",
      matchKind: "camera_intersection_geoclient",
      confidence: "high",
      violationCode: 5,
      violationCounty: "NY",
      streetName: "1 AVE @ E 14 ST",
      intersectingStreet: null,
      candidateCount: 2,
      eventCount: 6,
      evidence: {
        parser: {
          direction: null,
          primaryStreet: "1 AVE",
          crossStreet: "E 14 ST",
        },
        outcomeConfidence: "geoclient_intersection_exact",
        physicalId: "100",
      },
      routes: [
        {
          physicalId: "100",
          routeId: "M15",
          overlapMeters: 10.5,
          bufferMeters: 20,
          routeFanout: 2,
        },
        {
          physicalId: "100",
          routeId: "M15-SBS",
          overlapMeters: 11.5,
          bufferMeters: 20,
          routeFanout: 2,
        },
      ],
    });
  });

  test("resolves camera corridor fallback when there is no cross street", () => {
    const db = openDb();
    const routes = [
      {
        physicalId: "100",
        routeId: "M15",
        overlapMeters: 10.5,
        bufferMeters: 20,
        routeFanout: 1,
      },
    ];
    const streetRouteIndex = new Map([["1|1 AVENUE", routes]]);

    expect(
      resolveParkingViolationCameraMatch({
        sqlite: db,
        group: {
          location_key: "camera|1|1 AVE|",
          violation_code: 5,
          violation_county: "NY",
          street_name: "1 AVE",
          intersecting_street: null,
          street_code1: null,
          house_number: null,
          event_count: 3,
        },
        physicalRouteCache: new Map(),
        streetRouteIndex,
      }),
    ).toEqual({
      locationKey: "camera|1|1 AVE|",
      matchKind: "camera_street_corridor",
      confidence: "low",
      violationCode: 5,
      violationCounty: "NY",
      streetName: "1 AVE",
      intersectingStreet: null,
      candidateCount: 1,
      eventCount: 3,
      evidence: {
        parser: {
          direction: null,
          primaryStreet: "1 AVE",
          crossStreet: null,
        },
        fallback: "route_corridor_primary_street",
        evidenceHash: "1ba4a8cb1183332d179b98f1b22ba31b84a6a401",
      },
      routes,
    });
  });

  test("runs the local DB match rebuild with an injected camera geocoder", async () => {
    const db = openDb();
    db.exec(`
      CREATE TABLE local_parking_violation (
        violation_code INTEGER NOT NULL,
        violation_county TEXT,
        street_code1 TEXT,
        house_number TEXT,
        street_name TEXT,
        intersecting_street TEXT,
        match_location_key TEXT
      );

      CREATE TABLE local_lion_segment (
        physical_id TEXT NOT NULL,
        street_name TEXT,
        street_code_master TEXT,
        borough_code TEXT,
        borough TEXT,
        l_low_hn TEXT,
        l_high_hn TEXT,
        r_low_hn TEXT,
        r_high_hn TEXT
      );

      CREATE TABLE local_route_lion_link (
        physical_id TEXT NOT NULL,
        route_id TEXT NOT NULL,
        street_name TEXT,
        overlap_meters REAL,
        buffer_meters REAL
      );

      INSERT INTO local_parking_violation
        (violation_code, violation_county, street_code1, house_number, street_name, intersecting_street, match_location_key)
      VALUES
        (5, 'NY', NULL, NULL, '1 AVE @ E 14 ST', NULL, 'camera|1|1 AVE @ E 14 ST|'),
        (7, 'NY', '12345', '10', 'Main St', NULL, 'street_code_house|1|12345|10');

      INSERT INTO local_lion_segment
        (physical_id, street_name, street_code_master, borough_code, borough, l_low_hn, l_high_hn, r_low_hn, r_high_hn)
      VALUES
        ('100', '1 Ave', NULL, '1', '1', NULL, NULL, NULL, NULL),
        ('200', 'Main St', '112345', '1', '1', '2', '20', '1', '19');

      INSERT INTO local_route_lion_link
        (physical_id, route_id, street_name, overlap_meters, buffer_meters)
      VALUES
        ('100', 'M15', '1 Ave', 10.5, 20),
        ('200', 'M14', 'Main St', 5, 15);
    `);

    const result = await runBuildParkingViolationMatchesLocalDb({
      sqlite: db,
      computedAt: "2026-01-02T03:04:05.000Z",
      geocodeCameraIntersection: async (request) => {
        expect(request).toEqual({
          crossStreetOne: "1 AVE",
          crossStreetTwo: "E 14 ST",
          borough: "NY",
        });
        return {
          physicalId: "100",
          confidence: "geoclient_intersection_exact",
        };
      },
    });

    expect(result).toEqual({
      cameraGroupsScanned: 1,
      addressGroupsScanned: 1,
    });
    expect(
      db
        .query<{ location_key: string; match_kind: string; route_id: string }, []>(
          `SELECT location_key, match_kind, route_id
             FROM local_parking_violation_match
            ORDER BY location_key, route_id`,
        )
        .all(),
    ).toEqual([
      {
        location_key: "camera|1|1 AVE @ E 14 ST|",
        match_kind: "camera_intersection_geoclient",
        route_id: "M15",
      },
      {
        location_key: "street_code_house|1|12345|10",
        match_kind: "street_code_house_range",
        route_id: "M14",
      },
    ]);
  });

  test("builds the audit artifact from run counts and summary", () => {
    const artifact = buildParkingViolationMatchAuditArtifact({
      generatedAt: "2026-01-02T03:04:05.000Z",
      counts: {
        hydratedParkingRows: 10,
        hydratedLionRows: 11,
        refreshedLocationKeyRows: 12,
        cameraGroupsScanned: 13,
        addressGroupsScanned: 14,
      },
      summary: {
        matchRows: 2,
        matchedLocationGroups: 1,
        representedEvents: 8,
        routeCount: 2,
        byMatchKind: [
          {
            matchKind: "street_code_house",
            confidence: "medium",
            rows: 2,
            events: 8,
          },
        ],
      },
    });

    expect(artifact).toEqual({
      artifactKind: "parking_violation_match_audit",
      schemaVersion: 1,
      generatedAt: "2026-01-02T03:04:05.000Z",
      summary: {
        hydratedParkingRows: 10,
        hydratedLionRows: 11,
        refreshedLocationKeyRows: 12,
        cameraGroupsScanned: 13,
        addressGroupsScanned: 14,
        matchRows: 2,
        matchedLocationGroups: 1,
        representedEvents: 8,
        routeCount: 2,
      },
      byMatchKind: [
        {
          matchKind: "street_code_house",
          confidence: "medium",
          rows: 2,
          events: 8,
        },
      ],
    });
  });
});
