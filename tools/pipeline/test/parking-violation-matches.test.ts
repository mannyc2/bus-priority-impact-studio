import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Geoclient } from "@bp/sources/nyc-geoclient";
import { buildContextEventRouteTouches } from "../src/jobs/build/build-context-event-route-touches.js";
import { buildContextEvents } from "../src/jobs/build/build-context-events.js";
import { buildParkingViolationMatches } from "../src/jobs/build/build-parking-violation-matches.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { parkingLocationKey, parseParkingCameraLocation } from "../src/lib/parking-location.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const dbPath = fromRepoRoot(join("data/working/test-parking-violation-matches/pipeline.sqlite"));
const artifactRoot = fromRepoRoot(join("data/working/test-parking-violation-matches/artifacts"));

type SqlValue = string | number | null;

async function resetDb(): Promise<void> {
  await rm(dirname(dbPath), { recursive: true, force: true });
}

function insertRow(sqlite: Database, table: string, row: Record<string, SqlValue>) {
  const columns = Object.keys(row);
  sqlite
    .query(
      `INSERT INTO ${table} (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
    )
    .run(...columns.map((column) => row[column] ?? null));
}

afterEach(async () => {
  await resetDb();
});

describe("parking violation location matching", () => {
  test("parses camera fragments into usable intersection names", () => {
    expect(
      parseParkingCameraLocation({
        streetName: "EB JAMAICA AVE @ MER",
        intersectingStreet: "RICK BLVD",
      }),
    ).toEqual({
      direction: "EB",
      primaryStreet: "JAMAICA AVE",
      crossStreet: "MERRICK BLVD",
    });
    expect(
      parseParkingCameraLocation({
        streetName: "EB W 14TH STREET @ 5",
        intersectingStreet: "TH AVE",
      }),
    ).toEqual({
      direction: "EB",
      primaryStreet: "W 14TH STREET",
      crossStreet: "5TH AVE",
    });
  });

  test("builds grouped camera and street-code candidates and routes parking touches", async () => {
    await resetDb();
    const local = await openLocalPipelineDb(dbPath);
    try {
      insertRow(local.sqlite, "local_lion_segment", {
        physical_id: "p-camera",
        street_code_master: "461230",
        street_name: "JAMAICA AVE",
        borough: "4",
        borough_code: "4",
        l_low_hn: null,
        l_high_hn: null,
        r_low_hn: null,
        r_high_hn: null,
      });
      insertRow(local.sqlite, "local_lion_segment", {
        physical_id: "p-address",
        street_code_master: "100010",
        street_name: "1 AVE",
        borough: "1",
        borough_code: "1",
        l_low_hn: "100",
        l_high_hn: "198",
        r_low_hn: "101",
        r_high_hn: "199",
      });
      insertRow(local.sqlite, "local_route_lion_link", {
        route_id: "Q5",
        physical_id: "p-camera",
        overlap_meters: 24,
        buffer_meters: 25,
        match_kind: "buffered_intersection",
        street_name: "JAMAICA AVE",
        borough: "4",
        computed_at: "2026-05-22T00:00:00.000Z",
      });
      insertRow(local.sqlite, "local_route_lion_link", {
        route_id: "M1",
        physical_id: "p-address",
        overlap_meters: 18,
        buffer_meters: 25,
        match_kind: "buffered_intersection",
        street_name: "1 AVE",
        borough: "1",
        computed_at: "2026-05-22T00:00:00.000Z",
      });
      insertRow(local.sqlite, "local_parking_violation", {
        summons_number: "cam-1",
        issue_date: "2026-03-01",
        violation_code: 5,
        violation_description: "BUS LANE VIOLATION",
        violation_county: "QN",
        street_name: "EB JAMAICA AVE @ MER",
        intersecting_street: "RICK BLVD",
        street_code1: "0",
        street_code2: "0",
        street_code3: "0",
        house_number: null,
        violation_time: "1200P",
        physical_id: null,
        geocode_confidence: null,
        match_location_key: null,
      });
      insertRow(local.sqlite, "local_parking_violation", {
        summons_number: "addr-1",
        issue_date: "2026-03-01",
        violation_code: 14,
        violation_description: "NO STANDING-DAY/TIME LIMITS",
        violation_county: "NY",
        street_name: "1st Ave",
        intersecting_street: null,
        street_code1: "10",
        street_code2: "0",
        street_code3: "0",
        house_number: "150",
        violation_time: "0100P",
        physical_id: null,
        geocode_confidence: null,
        match_location_key: null,
      });
    } finally {
      local.sqlite.close();
    }

    const geoclient: Geoclient = {
      address: async () => null,
      intersection: async () => ({
        physicalId: "p-camera",
        lat: null,
        lng: null,
        confidence: "grc=00",
        raw: {},
      }),
      search: async () => null,
    };

    const result = await buildParkingViolationMatches({
      dbPath,
      artifactRoot,
      geoclient,
      computedAt: new Date("2026-05-22T12:00:00.000Z"),
    });
    await buildContextEvents({ dbPath });
    await buildContextEventRouteTouches({
      dbPath,
      artifactRoot,
      computedAt: new Date("2026-05-22T12:30:00.000Z"),
    });

    const sqlite = new Database(dbPath, { readonly: true });
    try {
      const matches = sqlite
        .query<{ match_kind: string; route_id: string; event_count: number }, []>(
          `SELECT match_kind, route_id, event_count
             FROM local_parking_violation_match
            ORDER BY match_kind, route_id`,
        )
        .all();
      const touches = sqlite
        .query<{ route_id: string; touch_kind: string; match_weight: number }, []>(
          `SELECT route_id, touch_kind, match_weight
             FROM local_context_event_route_touch
            ORDER BY route_id`,
        )
        .all();

      expect(
        parkingLocationKey({
          violationCode: 14,
          violationCounty: "NY",
          streetCode1: "10",
          houseNumber: "150",
          streetName: "1st Ave",
          intersectingStreet: null,
        }),
      ).toBe("street_code_house|1|00010|150");
      expect(result).toEqual(
        expect.objectContaining({
          cameraGroupsScanned: 1,
          addressGroupsScanned: 1,
          matchRows: 2,
          matchedLocationGroups: 2,
          routeCount: 2,
        }),
      );
      expect(matches).toEqual([
        { match_kind: "camera_intersection_geoclient", route_id: "Q5", event_count: 1 },
        { match_kind: "street_code_house_range", route_id: "M1", event_count: 1 },
      ]);
      expect(touches).toEqual([
        { route_id: "M1", touch_kind: "parking_location_match", match_weight: 0.9 },
        { route_id: "Q5", touch_kind: "parking_location_match", match_weight: 1 },
      ]);
    } finally {
      sqlite.close();
    }
  });
});
