import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { createLocalPipelineDb, type LocalPipelineDb } from "../src/local/client.js";
import {
  update311ServiceRequestGeocode,
  updateDotStreetPermitGeocode,
  updateNypdCollisionGeocode,
  updateTrafficSpeedGeocode,
  updateTrafficVolumeGeocode,
} from "../src/local/repositories/geocode-updates.js";

async function createTestLocalDb(): Promise<{ db: LocalPipelineDb; sqlite: Database }> {
  const sqlite = new Database(":memory:");
  const migrationsDir = new URL("../migrations/local/", import.meta.url);
  const filenames = (await readdir(migrationsDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  for (const filename of filenames) {
    const body = await Bun.file(new URL(filename, migrationsDir)).text();
    for (const statement of body.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) sqlite.exec(trimmed);
    }
  }
  return { db: createLocalPipelineDb(sqlite), sqlite };
}

function geocodeColumns(sqlite: Database, tableName: string): {
  physical_id: string | null;
  geocode_confidence: string | null;
} {
  return sqlite
    .query<{ physical_id: string | null; geocode_confidence: string | null }, []>(
      `SELECT physical_id, geocode_confidence FROM ${tableName} LIMIT 1`,
    )
    .get() as { physical_id: string | null; geocode_confidence: string | null };
}

describe("local geocode update repository", () => {
  test("updates simple geocode targets by their source keys", async () => {
    const { db, sqlite } = await createTestLocalDb();
    try {
      sqlite
        .query(
          `INSERT INTO local_dot_traffic_speed
           (link_id, sampled_at, status_code, physical_id, geocode_confidence)
           VALUES ('speed-link', '2026-03-01T00:00:00', '0', NULL, NULL)`,
        )
        .run();
      sqlite
        .query(
          `INSERT INTO local_dot_traffic_volume_count
           (request_id, segment_id, sampled_at, volume, physical_id, geocode_confidence)
           VALUES (10, 20, '2026-03-02T00:00:00', 42, NULL, NULL)`,
        )
        .run();
      sqlite
        .query(
          `INSERT INTO local_nypd_collision
           (collision_id, crash_date, physical_id, geocode_confidence)
           VALUES ('collision-1', '2026-03-03', NULL, NULL)`,
        )
        .run();
      sqlite
        .query(
          `INSERT INTO local_dot_street_permit
           (permit_number, permit_kind, physical_id, geocode_confidence)
           VALUES ('permit-1', 'construction', NULL, NULL)`,
        )
        .run();
      sqlite
        .query(
          `INSERT INTO local_311_service_request
           (unique_key, era, created_date, physical_id, geocode_confidence)
           VALUES ('311-1', 'current', '2026-03-04', NULL, NULL)`,
        )
        .run();

      await updateTrafficSpeedGeocode(
        db,
        { linkId: "speed-link", sampledAt: "2026-03-01T00:00:00" },
        { physicalId: "p-speed", confidence: "latlng_snap" },
      );
      await updateTrafficVolumeGeocode(
        db,
        { requestId: 10, segmentId: 20, sampledAt: "2026-03-02T00:00:00" },
        { physicalId: "p-volume", confidence: "intersection" },
      );
      await updateNypdCollisionGeocode(db, "collision-1", {
        physicalId: "p-collision",
        confidence: "address",
      });
      await updateDotStreetPermitGeocode(db, "permit-1", {
        physicalId: "p-permit",
        confidence: "intersection",
      });
      await update311ServiceRequestGeocode(db, "311-1", {
        physicalId: null,
        confidence: "no_match",
      });

      expect(geocodeColumns(sqlite, "local_dot_traffic_speed")).toEqual({
        physical_id: "p-speed",
        geocode_confidence: "latlng_snap",
      });
      expect(geocodeColumns(sqlite, "local_dot_traffic_volume_count")).toEqual({
        physical_id: "p-volume",
        geocode_confidence: "intersection",
      });
      expect(geocodeColumns(sqlite, "local_nypd_collision")).toEqual({
        physical_id: "p-collision",
        geocode_confidence: "address",
      });
      expect(geocodeColumns(sqlite, "local_dot_street_permit")).toEqual({
        physical_id: "p-permit",
        geocode_confidence: "intersection",
      });
      expect(geocodeColumns(sqlite, "local_311_service_request")).toEqual({
        physical_id: null,
        geocode_confidence: "no_match",
      });
    } finally {
      sqlite.close();
    }
  });
});
